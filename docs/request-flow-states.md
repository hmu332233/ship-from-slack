# 요청 흐름 상태 관리 및 프롬프트 생성

## TL;DR

> **대상 독자**: 이 시스템을 개발/유지보수하는 개발자.
> 일반 사용자(Slack `/request`만 사용하는 경우)는 [사용 가이드](USAGE-GUIDE.md)를 참조하세요.

### ClientPayload 필드 요약

| 필드 | 타입 | 필수 | 설정 주체 | 설명 |
|------|------|------|-----------|------|
| `prompt` | `string` | ✅ | 사용자 직접 입력 | 원본 수정 요청 |
| `requester` | `string` | ✅ | Slack Bot 자동 설정 | 요청자 이름/ID |
| `slack_channel` | `string` | ✅ | Slack Bot 자동 설정 | 채널 ID |
| `slack_thread_ts` | `string` | ✅ | Slack Bot 자동 설정 | 스레드 타임스탬프 |
| `clarification_history` | `ClarificationEntry[]` | — | Slack Bot 자동 누적 | Q&A 이력 (답변 흐름에서 자동 추가) |
| `is_followup` | `boolean` | — | Slack Bot 자동 설정 | 추가 요청 여부 (`true`면 기존 PR에 커밋) |
| `branch` | `string` | — | Slack Bot / Workflow | 브랜치명 (미설정 시 기본값 `"main"`) |
| `pr_number` | `string` | — | Slack Bot 자동 설정 | 기존 PR 번호 (follow-up 시 사용) |

> 사용자는 **`prompt`만 입력**합니다. 나머지 필드는 Slack Bot이 흐름에 따라 자동으로 구성합니다.

### 흐름별 payload 차이 요약

| 흐름 | 트리거 | payload 특징 |
|------|--------|-------------|
| **최초 요청** | `/request` 모달 제출 | 4개 필수 필드만 (`prompt`, `requester`, `slack_channel`, `slack_thread_ts`) |
| **질문 답변** | `@봇` 멘션 (`pending_question` 상태) | 원본 `prompt` 유지 + `clarification_history` 자동 누적 |
| **추가 요청** | `@봇` 멘션 (`pr_ready` 상태) | `is_followup: true` + `branch` / `pr_number` 포함 |

자세한 내용은 아래 각 섹션 참조. 타입 정의: `claude-agent/types.ts:8-17`

---

## 개요

이 시스템은 **Slack 스레드를 상태 저장소로 활용**하는 독특한 아키텍처를 사용합니다. 별도의 데이터베이스 없이, Slack 메시지의 `metadata` 필드로 현재 상태를 역순 스캔하여 판별합니다.

**핵심 설계 원칙**:
- **Stateless Architecture**: GitHub Actions는 상태를 저장하지 않음
- **Slack-as-State-Store**: 모든 상태는 Slack 스레드 메시지에서 복원
- **Slack Metadata Payload**: 전체 컨텍스트를 Slack 메타데이터 필드에 직렬화하여 보존
- **Reverse Scanning**: 최신 메시지부터 역순 스캔으로 현재 상태 판별

---

## 1. 4가지 흐름과 3가지 스레드 상태

### 1.1 사용자 흐름 (User Actions)

| 흐름 | 트리거 | 핸들러 파일:라인 | 설명 |
|---|---|---|---|
| **최초 요청** | `/request` 슬래시 커맨드 → 모달 제출 | `interactions.js:40-53` | 새로운 작업 시작 |
| **질문** | Plan 단계에서 정보 부족 판단 | `index.ts:23-27` → `slack.ts:7-51` | Claude가 clarification 필요 판단 |
| **답변** | `pending_question` 스레드에서 `@봇` 멘션 | `events.js:88-158` | 사용자가 질문에 응답 |
| **추가 요청** | `pr_ready` 스레드에서 `@봇` 멘션 | `events.js:161-198` | 기존 PR에 추가 작업 요청 |

### 1.2 스레드 상태 (`findMetadataInThread()` 반환값)

**상태 판별 함수**: `lib/slack.js:141-201`

| 상태 | 의미 | 감지 방법 | 반환 구조 |
|---|---|---|---|
| `pr_ready` | PR 생성 완료, 추가 요청 가능 | `metadata.event_type === "pr_ready"` | `{ type: 'pr_ready', pr_number, branch }` |
| `pending_question` | 질문 대기 중, 답변 필요 | `metadata.event_type === "pending_question"` | `{ type: 'pending_question', payload }` |
| `in_progress` | 작업 진행 중, 멘션 불가 | `metadata.event_type === "question_answered"` 또는 메타데이터 없음 | `{ type: 'in_progress' }` |

**역순 스캔 이유** (L133-139의 주석):
```
하나의 스레드에서 pending_question → pr_ready 순서로 상태가 변할 수 있음.
가장 최신 메시지부터 스캔해야 현재 상태를 정확히 반영.

예: [질문 메시지(과거)] → [PR 생성(최신)]
    역순 스캔 시 PR 생성을 먼저 발견 → pr_ready 반환 (올바름)
    정순 스캔 시 질문 메시지를 먼저 발견 → pending_question 반환 (잘못됨)
```

---

## 2. 상태 전이 다이어그램

```
최초 요청 (/request 슬래시 커맨드)
    │
    ▼
┌─────────────────┐
│  Modal 제출      │ interactions.js:40-53
│  payload = {     │
│    prompt,       │
│    requester,    │
│    slack_channel,│
│    slack_thread  │
│  }               │
└────────┬─────────┘
         │
         ▼
    GitHub Actions 트리거
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  [in_progress]                                          │
│                                                         │
│  Plan 단계 (claude-agent/phases/plan.ts)               │
│  - buildPlanSystemPrompt(clarificationCount, isFollowup)│
│  - Structured Output 분석                              │
└────────┬───────────────────────────────────┬────────────┘
         │                                   │
         │ needs_clarification = true        │ needs_clarification = false
         ▼                                   ▼
┌──────────────────────────┐         ┌──────────────────────────┐
│ [pending_question]        │         │  Execute 단계            │
│                          │         │  - plan.md 실행          │
│ sendClarificationToSlack │         │  - Git commit + push     │
│ slack.ts:7-51            │         │                          │
│                          │         │  is_followup?            │
│ Slack metadata:          │         │  ├─ true  → commentOnPR  │
│ {                        │         │  └─ false → createPR     │
│   event_type:            │         │                          │
│   "pending_question",    │         └──────────┬───────────────┘
│   event_payload: {       │                    │
│     prompt, questions,   │                    ▼
│     branch, pr_number    │         ┌──────────────────────────┐
│   }                      │         │ [pr_ready]               │
│ }                        │         │                          │
└──────────┬───────────────┘         │ Slack metadata:          │
           │                         │ {                        │
           │ 사용자 답변 (@봇 멘션)   │   event_type: "pr_ready",│
           │ events.js:88-158        │   event_payload: {       │
           ▼                         │     pr_number, branch    │
┌──────────────────────────┐         │   }                      │
│ metadata payload 복원     │         │ }                        │
│ JSON 필드 파싱            │         └──────────┬───────────────┘
│                          │                    │
│ clarification_history에  │                    │ 사용자 추가 요청 (@봇 멘션)
│ Q&A 추가                 │                    │ events.js:161-198
│                          │                    ▼
│ metadata:                │         ┌──────────────────────────┐
│ event_type =             │         │ 새 payload 생성:         │
│ "question_answered"      │         │ {                        │
└──────────┬───────────────┘         │   prompt: 새 요청 내용,  │
           │                         │   is_followup: true,     │
           ▼                         │   branch: 기존 브랜치,   │
    [in_progress]                    │   pr_number: 기존 PR     │
    Plan 재실행                      │ }                        │
    (최대 3회 반복)                  └──────────┬───────────────┘
                                               │
                                               ▼
                                      GitHub Actions 재트리거
                                      (Plan → Execute → PR 업데이트)
```

---

## 3. Payload 구조 (`ClientPayload`)

**타입 정의**: `claude-agent/types.ts:8-17`

```typescript
type ClientPayload = {
  prompt: string;                                // 원본 요청
  clarification_history?: ClarificationEntry[];  // Q&A 이력
  requester: string;
  slack_channel: string;
  slack_thread_ts: string;
  is_followup?: boolean;
  branch?: string;
  pr_number?: string;
};

type ClarificationEntry = {
  questions: string[];
  answer: string;
};
```

### 3.1 흐름별 Payload 차이

| 필드 | 최초 요청 | 답변 (clarification) | 추가 요청 (followup) |
|---|---|---|---|
| `prompt` | ✅ 사용자 입력 원문 | ✅ **원본 요청 유지** (중요!) | ✅ 새 요청 내용 |
| `clarification_history` | ❌ 없음 | ✅ `[{questions, answer}, ...]` 배열 | ❌ 없음 |
| `is_followup` | ❌ 없음/`false` | ✅ 원본에서 복원 (followup 중 질문 가능) | ✅ `true` |
| `branch` | ❌ 없음 | ✅ 원본에서 복원 | ✅ 기존 브랜치명 |
| `pr_number` | ❌ 없음 | ✅ 원본에서 복원 | ✅ 기존 PR 번호 |
| `requester` | ✅ 사용자 이름 | ✅ 사용자 ID | ✅ 사용자 ID |
| `slack_channel` | ✅ 채널 ID | ✅ 채널 ID | ✅ 채널 ID |
| `slack_thread_ts` | ✅ 스레드 타임스탬프 | ✅ 스레드 타임스탬프 | ✅ 스레드 타임스탬프 |

### 3.2 핵심 설계: 답변 흐름에서 원본 요청 보존

**문제**: GitHub Actions는 stateless이므로, 사용자가 답변할 때 원본 요청을 어떻게 기억하나?

**해결책**: Slack 메시지 메타데이터에 payload 필드를 직접 저장

1. **질문 전송 시** (`slack.ts:14-24`):
   ```typescript
   // Slack 메시지 metadata에 저장
   metadata: {
     event_type: "pending_question",
     event_payload: {
       prompt: payload.prompt,
       clarification_history: JSON.stringify(payload.clarification_history || []),
       questions: JSON.stringify(questions),
       is_followup: String(payload.is_followup || false),
       branch: payload.branch || "",
       pr_number: payload.pr_number || "",
     },
   }
   ```

2. **답변 처리 시** (`events.js:102-105`):
   ```javascript
   const rawPayload = metadata.payload;
   const originalPayload = {
     prompt: rawPayload.prompt,
     clarification_history: JSON.parse(rawPayload.clarification_history || '[]'),
     questions: JSON.parse(rawPayload.questions || '[]'),
     is_followup: rawPayload.is_followup === 'true',
     branch: rawPayload.branch,
     pr_number: rawPayload.pr_number,
   };
   ```

3. **새 payload 구성** (`events.js:143-154`):
   ```javascript
   const payload = {
     prompt: originalPayload.prompt,  // 원본 요청 유지!
     clarification_history: updatedHistory,
     is_followup: originalPayload.is_followup || false,  // followup 상태 복원
     branch: originalPayload.branch || undefined,        // 브랜치 복원
     pr_number: originalPayload.pr_number || undefined,  // PR 번호 복원
     // ... 나머지 필드
   };
   ```

---

## 4. 프롬프트 생성 로직

### 4.1 시스템 프롬프트 변형 (Plan 단계)

**함수**: `claude-agent/prompts/plan-prompt.ts:9-39` - `buildPlanSystemPrompt(clarificationCount, isFollowup)`

상태에 따라 4가지 프롬프트 변형을 생성합니다:

#### Variant 1: 최초 요청 (`clarificationCount === 0`, `!isFollowup`)

**조건**: `plan-prompt.ts:16-18`

**포함 지침**: `CLARIFICATION_CHECK_INSTRUCTION` (L68-97)

**핵심 내용**:
- 정보 부족 시 질문 허용
- Structured output 필수: `{ needs_clarification: boolean, questions: string[], plan_written: boolean }`
- 질문 기준 명시:
  - ✅ 날짜 변경 요청인데 구체적 날짜 없음
  - ✅ "이것 추가해줘"인데 구체적 내용 없음
  - ✅ 여러 대상이 있는데 어떤 것인지 모호함
  - ❌ 요청이 충분히 구체적
  - ❌ 표준 컨벤션으로 의도가 명확

**Structured Output Schema**:
```
needs_clarification: boolean  // true면 질문 전송, false면 plan.md 작성
questions: string[]           // 한국어 질문, 최대 2개
plan_written: boolean         // plan.md를 작성했는지 여부
```

---

#### Variant 2: 답변 후 재진입 (`0 < clarificationCount < 3`, `!isFollowup`)

**조건**: `plan-prompt.ts:19-21`

**포함 지침**: `buildContinuingClarificationInstruction(count)` (L99-112)

**핵심 내용**:
- 사용자가 이전 질문에 답변함
- Q&A 이력은 별도 섹션 (`## Clarification Context`)에 제공됨
- **중요**: Clarification Context는 보조 정보일 뿐, 추가 요구사항이 아님
- 여전히 정보 부족 시 추가 질문 가능 (최대 3회)
- 현재 `N`번 질문했고, 최대 `3`번까지 가능함을 명시

**경고 문구**:
```
CRITICAL: The Clarification Context section contains ONLY supplementary information
to help you understand the original request.
It is NOT a list of additional tasks or requirements.
The ONLY actionable request is in the "## Request" section.
```

---

#### Variant 3: 최대 질문 도달 (`clarificationCount >= 3`)

**조건**: `plan-prompt.ts:22-24`

**포함 지침**: `MAX_CLARIFICATION_INSTRUCTION` (L135-144)

**핵심 내용**:
- **더 이상 질문 금지**
- 기존 정보를 바탕으로 합리적 가정하고 진행
- 가정 사항은 plan.md의 "Assumptions" 섹션에 명확히 문서화
- `needs_clarification: false` 강제

**경고 문구**:
```
CRITICAL: Do NOT ask any more questions.

Make reasonable assumptions based on all the information provided
and write `.claude/plan.md` directly.
Document your assumptions clearly in the "Assumptions" section of the plan.
```

---

#### Variant 4: 추가 요청 (`isFollowup === true`, 모든 clarificationCount)

**조건**: `plan-prompt.ts:34-36`

**포함 지침**: 위 3가지 변형 중 하나 + `FOLLOWUP_CONTEXT_INSTRUCTION` (L211-220)

**추가 지침 내용**:
- 기존 브랜치에 이미 변경사항 존재
- **필수 사전 작업**:
  1. `git log origin/main..HEAD --oneline` 실행 (커밋 이력 확인)
  2. `git diff origin/main...HEAD` 실행 (전체 변경 내용 확인)
  3. 기존 변경사항 컨텍스트 충분히 이해
- plan.md에 "## Previous Changes Summary" 섹션 포함
- 새 계획이 기존 변경과 충돌/중복되지 않도록 확인

---

### 4.2 사용자 프롬프트 구성

**함수**: `plan-prompt.ts:45-57` - `buildPlanUserPrompt(payload)`

**구조**:

```markdown
## Request

{payload.prompt}

---

## Clarification Context

IMPORTANT: The content below is **supplementary context** provided to clarify
the original request. These are NOT additional requests, NOT new tasks to
implement, and NOT part of the requirements.
Use this Q&A history ONLY as reference to better understand the intent behind
the "## Request" section above.
Do NOT treat questions or answers as action items.

### Round 1
**Questions:**
• {question1}
• {question2}

**Answer:**
{answer1}

### Round 2
...
```

**조건부 포함**:
- `clarification_history`가 없으면 `## Request` 섹션만 포함
- `clarification_history`가 있으면 `## Clarification Context` 섹션 추가 (L114-133)

**경고 문구의 의도**:
- LLM이 Q&A를 "새로운 요구사항"으로 오해하지 않도록 명시적 제한
- "## Request" 섹션만이 유일한 실행 대상임을 강조

---

### 4.3 Execute 프롬프트 (상태 무관)

**파일**: `claude-agent/prompts/execute-prompt.ts`

**특징**:
- **상태와 무관하게 항상 동일**
- `.claude/plan.md` 파일을 읽고 그대로 실행
- Clarification 정보는 이미 Plan 단계에서 plan.md에 반영되었으므로 불필요

---

### 4.4 프롬프트 사용 흐름

```typescript
// claude-agent/phases/plan.ts:7-10
const systemPrompt = buildPlanSystemPrompt(
  payload.clarification_history?.length || 0,
  payload.is_followup || false
);

const userPrompt = buildPlanUserPrompt(payload);

// Claude SDK 호출
const response = await agent.run({
  systemPrompt,
  userPrompt,
  structuredOutput: PlanOutput,  // { needs_clarification, questions, plan_written }
});
```

---

## 5. 상태 저장 메커니즘: Slack-as-State-Store

### 5.1 왜 DB가 없는가?

**설계 목표**:
- Serverless 환경 (Vercel + GitHub Actions) 친화적
- 인프라 단순화 (DB 서버/관리 불필요)
- Slack 스레드가 자연스러운 대화 컨텍스트 범위

**트레이드오프**:
- ✅ 인프라 비용 Zero
- ✅ Slack 스레드와 상태가 1:1 매핑되어 직관적
- ⚠️ Slack API에 의존적 (conversations.replies 호출 필수)
- ⚠️ 메시지 삭제 시 상태 유실 가능 (실제로는 봇 메시지만 사용하므로 안전)

---

### 5.2 상태 감지 우선순위

**역순 스캔 순서** (`lib/slack.js:160-196`):

```
for (let i = messages.length - 1; i >= 0; i--) {
  if (message.metadata?.event_type) {  // ← metadata가 없는 메시지는 여기서 skip
    1. event_type === "pr_ready"
       → pr_ready + { pr_number, branch } 반환

    2. event_type === "question_answered"
       → in_progress 반환

    3. event_type === "pending_question"
       → pending_question + payload 반환
  }
  // metadata가 없으면 아무것도 하지 않고 다음 메시지(i--)로 진행
}

// 루프를 전부 다 돌고 난 후에도 상태 마커를 하나도 못 찾으면:
4. → in_progress (fallback 기본값)
```

**중요: "metadata 없음 → in_progress"는 개별 메시지 단위가 아님**

`in_progress` fallback은 스레드 전체를 스캔한 후에도 `event_type`이 있는 메시지를 하나도 찾지 못했을 때만 반환됩니다. metadata가 없는 개별 메시지는 단순히 skip되므로 상태에 영향을 주지 않습니다.

예를 들어, `vercel-preview.yml` 워크플로우가 동일한 스레드에 Slack 알림을 보내더라도 해당 메시지에는 `metadata` 필드가 없으므로 스캔 시 무시됩니다. 상태는 오직 claude-agent가 보내는 `event_type`이 있는 메시지로만 결정됩니다.

```
스레드 메시지 예시:
[1] 사용자 요청 (metadata 없음)           → skip
[2] 봇: "작업 시작합니다" (metadata 없음)  → skip
[3] 봇: PR 완료! (event_type="pr_ready")  → pr_ready 반환 (즉시 종료)
[4] Vercel: "Preview 준비됐습니다!" (metadata 없음) → skip (도달하지도 않음)

역순 스캔: [4] skip → [3] pr_ready 발견 → 즉시 반환
```

**우선순위 이유**:
- `pr_ready`는 작업 완료 상태 (가장 최신)
- `question_answered`는 답변 직후 ~ PR 생성 전 구간
- `pending_question`은 질문 대기 상태
- fallback `in_progress` = 스레드에 상태 마커가 전혀 없는 경우 (최초 요청 직후 등)

---

### 5.3 Payload 직렬화/역직렬화

**직렬화** (`slack.ts:14-24`):
```typescript
event_payload: {
  prompt: payload.prompt,
  clarification_history: JSON.stringify(payload.clarification_history || []),
  questions: JSON.stringify(questions),
  is_followup: String(payload.is_followup || false),
  branch: payload.branch || "",
  pr_number: payload.pr_number || "",
}
```

**역직렬화** (`events.js:102-105`):
```javascript
const rawPayload = metadata.payload;
const originalPayload = {
  prompt: rawPayload.prompt,
  clarification_history: JSON.parse(rawPayload.clarification_history || '[]'),
  questions: JSON.parse(rawPayload.questions || '[]'),
  is_followup: rawPayload.is_followup === 'true',
  branch: rawPayload.branch,
  pr_number: rawPayload.pr_number,
};
```

**보존되는 정보**:
- 원본 `prompt` (사용자가 최초에 입력한 요청)
- 전체 `clarification_history` 배열 (질문 횟수는 `clarification_history.length`로 파악)
- `is_followup`, `branch`, `pr_number` (followup 중 질문 가능하므로)

---

### 5.4 상태 마커 종류

| 마커 타입 | 설정 위치 | 값 | 목적 |
|---|---|---|---|
| **Slack metadata** | `slack.ts:42-48` | `event_type: "pending_question"` | 질문 대기 상태 표시 |
| **Slack metadata** | `events.js:122-124` | `event_type: "question_answered"` | 답변 완료 표시 (in_progress 전환) |
| **Slack metadata** | `slack.ts:71-78`, `slack.ts:106-113` | `event_type: "pr_ready"` | PR 생성 완료 표시 |

**Slack Metadata API 사용**:
```javascript
// pending_question 메시지 전송 시
{
  channel: "C12345",
  thread_ts: "1234567890.123456",
  text: "...",
  blocks: [...],
  metadata: {
    event_type: "pending_question",
    event_payload: {
      prompt: "...",
      clarification_history: "[]",
      questions: "[\"...\"]",
      is_followup: "false",
      branch: "",
      pr_number: ""
    }
  }
}

// pr_ready 메시지 전송 시
{
  channel: "C12345",
  thread_ts: "1234567890.123456",
  text: "...",
  blocks: [...],
  metadata: {
    event_type: "pr_ready",
    event_payload: {
      pr_number: "123",
      branch: "claude-code/456"
    }
  }
}

// 메시지 조회 시 (conversations.replies)
{
  messages: [
    {
      text: "...",
      metadata: {
        event_type: "pr_ready",
        event_payload: { pr_number: "123", branch: "claude-code/456" }
      }
    }
  ]
}
```

---

## 6. 전체 흐름 예시

### 예시 1: 최초 요청 → 질문 → 답변 → 실행 → PR

```
1. 사용자: /request 입력 → 모달 제출
   payload = { prompt: "날짜를 변경해주세요", requester: "user1", ... }

2. Plan 단계 (clarificationCount=0)
   → Variant 1 프롬프트 사용
   → Claude: needs_clarification=true, questions=["어떤 날짜를 변경할까요?", "언제로 변경할까요?"]

3. Slack 메시지 전송 (pending_question)
   → metadata.event_payload = { prompt: "날짜를 변경해주세요", questions: "[...]", ... }

4. 사용자: @봇 "startDate를 2024-03-01로 변경"
   → findMetadataInThread() → pending_question
   → metadata.event_payload 복원
   → payload = { prompt: "날짜를 변경해주세요", clarification_history: [{questions: [...], answer: "startDate를 2024-03-01로"}] }

5. Plan 재실행 (clarificationCount=1, clarification_history.length 기준)
   → Variant 2 프롬프트 사용
   → Claude: needs_clarification=false, plan_written=true

6. Execute 단계 → Git commit → PR 생성
   → Slack metadata: { event_type: "pr_ready", event_payload: { pr_number: "123", branch: "claude-code/456" } }

7. 상태: pr_ready
```

---

### 예시 2: 추가 요청 (followup)

```
1. 사용자: @봇 "버튼 색상을 파란색으로 변경"
   → findMetadataInThread() → pr_ready (pr_number: "123", branch: "claude-code/456")
   → payload = { prompt: "버튼 색상을 파란색으로 변경", is_followup: true, branch: "claude-code/456", pr_number: "123" }

2. Plan 단계 (isFollowup=true, clarificationCount=0)
   → Variant 4 프롬프트 사용 (Variant 1 + FOLLOWUP_CONTEXT_INSTRUCTION)
   → git log/diff 실행하여 기존 변경사항 파악
   → Claude: needs_clarification=false, plan_written=true

3. Execute 단계 → 기존 브랜치에 commit → PR에 comment
   → Slack metadata: { event_type: "pr_ready", event_payload: { pr_number: "123", branch: "claude-code/456" } }

4. 상태: 여전히 pr_ready
```

---

### 예시 3: 추가 요청 중 질문 발생 (followup + clarification)

```
1. 사용자: @봇 "에러 메시지를 수정해주세요"
   → is_followup=true, branch="...", pr_number="123"

2. Plan 단계 (isFollowup=true, clarificationCount=0)
   → Claude: needs_clarification=true, questions=["어떤 에러 메시지를 수정할까요?"]

3. Slack 메시지 (pending_question)
   → metadata.event_payload = {
       prompt: "에러 메시지를 수정해주세요",
       questions: "[...]",
       is_followup: "true",  // followup 상태 보존!
       branch: "...",
       pr_number: "123"
     }

4. 사용자: @봇 "로그인 실패 시 나오는 에러"
   → metadata.event_payload 복원
   → payload = {
       prompt: "에러 메시지를 수정해주세요",  // 원본 유지
       clarification_history: [{...}],
       is_followup: true,   // 복원됨!
       branch: "...",       // 복원됨!
       pr_number: "123"     // 복원됨!
     }

5. Plan 재실행 (isFollowup=true, clarificationCount=1, clarification_history.length 기준)
   → Variant 4 (Variant 2 + FOLLOWUP_CONTEXT) 프롬프트 사용
   → git log/diff 실행 + clarification 컨텍스트 참조
   → Claude: plan_written=true

6. Execute → 기존 브랜치에 commit → PR 업데이트
```

---

## 7. 참고: 관련 파일 목록

### Slack Bot (상태 관리)

| 파일 | 역할 | 핵심 함수/라인 |
|---|---|---|
| `slack-bot/lib/slack.js` | 상태 감지 엔진 | `findMetadataInThread()` (L141-201) |
| `slack-bot/api/slack/interactions.js` | 최초 요청 처리 | L40-53 payload 생성 |
| `slack-bot/api/slack/events.js` | 답변/추가 요청 처리 | L88-158 (답변), L161-198 (추가) |
| `slack-bot/lib/github.js` | GitHub Actions 트리거 | `triggerGitHubAction()` L27-29 |

### Claude Agent (프롬프트 생성)

| 파일 | 역할 | 핵심 함수/라인 |
|---|---|---|
| `claude-agent/types.ts` | 타입 정의 | `ClientPayload` (L8-17), `ClarificationEntry` (L1-5) |
| `claude-agent/index.ts` | 메인 오케스트레이터 | L23-27 (clarification 분기) |
| `claude-agent/prompts/plan-prompt.ts` | 프롬프트 빌더 | `buildPlanSystemPrompt()` (L9-39), 4가지 변형 |
| `claude-agent/phases/plan.ts` | Plan 실행 | L7-10 (프롬프트 빌드), structured output 파싱 |
| `claude-agent/services/slack.ts` | Slack 알림 | `sendClarificationToSlack()` (L7-51), metadata payload 저장 |

### GitHub Actions

| 파일 | 역할 |
|---|---|
| `.github/workflows/claude-code.yml` | SDK 기반 워크플로우, CLIENT_PAYLOAD 전달 |

---

## 8. 설계 장단점

### 장점

✅ **인프라 단순성**: DB 불필요, Vercel + GitHub Actions만으로 작동  
✅ **자연스러운 범위**: Slack 스레드 = 1개의 작업 컨텍스트  
✅ **감사 추적**: 모든 상태 변화가 Slack 메시지 이력으로 남음  
✅ **Serverless 친화적**: Stateless 환경에서도 상태 복원 가능  
✅ **일관된 상태 감지**: 모든 상태(pr_ready 포함)를 Slack metadata로 통일

### 단점

⚠️ **Slack API 의존**: `conversations.replies` 호출 실패 시 상태 유실  
⚠️ **메시지 삭제 취약**: 봇 메시지 삭제 시 상태 손상 (실무에서는 희귀)  
⚠️ **Slack metadata 크기 제한**: payload가 매우 클 경우 Slack metadata 제한 초과 가능 (현재는 문제없음)
⚠️ **디버깅 복잡도**: 상태가 여러 메시지에 분산되어 있어 추적 어려움  

---

## 9. FAQ

**Q1. clarification_history가 3개 이상이면 어떻게 되나요?**  
A1. `MAX_CLARIFICATION_INSTRUCTION`이 적용되어 더 이상 질문하지 못하고, 가정하고 진행합니다 (plan-prompt.ts:135-144). 질문 횟수는 `clarification_history.length`로 판단합니다.

**Q2. 사용자가 답변 대신 새로운 요청을 멘션하면?**  
A2. `pending_question` 상태에서는 모든 멘션이 "답변"으로 처리됩니다. 새로운 요청은 `/request`로 별도 스레드를 만들어야 합니다.

**Q3. Follow-up 중 질문이 발생하면 branch/pr_number 정보가 유지되나요?**  
A3. 네, Slack metadata payload에 `is_followup`, `branch`, `pr_number`가 모두 포함되므로, 답변 후 복원됩니다 (slack.ts:20-22, events.js:151-153).

**Q4. PR 생성 후 메시지가 수정/삭제되면?**  
A4. `findMetadataInThread()`가 역순 스캔하므로, 가장 최근의 `event_type: "pr_ready"` metadata를 찾습니다. 봇 메시지를 삭제하지 않는 한 안전합니다.

**Q5. Clarification Context를 "추가 요청"으로 오해할 가능성은?**  
A5. 프롬프트에 3중으로 경고합니다:
- User 프롬프트 헤더 (L115-120)
- System 프롬프트 (L104-105)
- Plan 구조 설명 (L95-97)

**Q6. `in_progress` 상태에서 사용자가 멘션하면?**  
A6. "현재 작업이 진행 중입니다. 완료 후 안내드리겠습니다" 메시지를 보내고 무시합니다 (events.js:202-212).

**Q7. vercel-preview.yml 등 외부 워크플로우가 같은 스레드에 메시지를 보내면 상태가 꼬이지 않나요?**  
A7. 꼬이지 않습니다. `findMetadataInThread()`는 `message.metadata?.event_type`이 존재하는 메시지만 처리하고, metadata가 없는 메시지는 루프에서 그냥 skip합니다. `vercel-preview.yml`이 보내는 메시지에는 `metadata` 필드 자체가 없으므로 상태 감지에 전혀 영향을 주지 않습니다. "metadata 없음 → in_progress"는 스레드 **전체** 스캔 후 상태 마커를 단 하나도 찾지 못했을 때의 fallback이지, 개별 메시지 단위의 판별이 아닙니다.

---

**마지막 업데이트**: 2026-02-18  
**작성자**: OpenCode (Claude Agent)
