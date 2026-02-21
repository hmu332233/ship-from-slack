# Slack Bot V2 - 대화형 워크플로우

이 문서는  **대화형 Slack Bot V2**를 설정하고 배포하는 방법을 안내합니다.

## 개요

### 핵심 기능

1. **질문 기능**: 애매한 요청 시 봇이 먼저 질문
2. **추가 요청**: PR 완료 후 쓰레드에서 추가 작업 요청 가능
3. **대화 연속성**: 사용자 답변을 기억하고 컨텍스트 유지
4. **안전한 분리**: V1 코드 완전 무터치 (완전 독립 앱)

---

## 1. 새 Slack 앱 생성

### 1-1. 앱 만들기

1. https://api.slack.com/apps 접속
2. **Create New App** → **From scratch**
3. **App Name**: `봇` (또는 원하는 이름)
4. **Workspace**: 기존 워크스페이스와 동일하게 선택
5. **Create App** 클릭

### 1-2. Bot Token Scopes 설정

**OAuth & Permissions** 메뉴:

1. **Scopes** 섹션에서 **Bot Token Scopes** 추가:
   - `commands` - 슬래시 명령어
   - `chat:write` - 메시지 전송
   - `chat:write.public` - 봇이 속하지 않은 채널에도 전송
   - `app_mentions:read` - 멘션 이벤트 수신
   - `channels:history` - 공개 채널 쓰레드 메시지 조회
   - `groups:history` - 비공개 채널 쓰레드 메시지 조회
   - `im:history` - DM 메시지 조회
### 1-3. 환경 변수 준비

다음 값들을 기록해둡니다:

- **Signing Secret**: Basic Information > App Credentials
- **Bot User OAuth Token**: OAuth & Permissions (설치 후 생성됨)

---

## 2. Vercel 배포

### 2-1. Vercel 프로젝트 생성

1. Vercel 대시보드에서 **Add New... → Project**
2. 동일한 GitHub 레포지토리 선택
3. **Project Name**: `slack-bot` (또는 원하는 이름)
4. **Framework Preset**: Other
5. **Root Directory**: `apps/slack-bot`
6. **Build Command**: 비워둠 (Serverless Functions만 사용)
7. **Output Directory**: 비워둠

### 2-2. 환경 변수 설정

Vercel 프로젝트 **Settings → Environment Variables**:

| 변수 | 값 | 설명 |
|------|-----|------|
| `SLACK_BOT_TOKEN` | xoxb-... | V2 앱의 Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | ... | V2 앱의 Signing Secret |
| `GITHUB_TOKEN` | ghp-... | GitHub Personal Access Token |
| `GITHUB_REPO` | owner/repo | 예: `hmu332233/ship-from-slack` |

**중요**: `SLACK_BOT_TOKEN`은 V2 앱의 토큰입니다 (V1과 다름).

### 2-3. 배포

```bash
cd apps/slack-bot
vercel --prod
```

배포 완료 후 URL을 기록합니다: `https://slack-bot-xxxx.vercel.app`

---

## 3. Slack 앱 설정 (계속)

Vercel URL이 생성되면 Slack 앱 설정을 마저 진행합니다.

### 3-1. Slash Command

**Slash Commands** 메뉴 > **Create New Command**:

| 항목 | 값 |
|------|-----|
| **Command** | `/request` |
| **Request URL** | `https://<v2-vercel-url>/api/slack/commands` |
| **Short Description** | 코드 수정 요청 (대화형) |
| **Usage Hint** | 수정 요청 내용을 입력하세요 |

### 3-2. Interactivity

**Interactivity & Shortcuts** 메뉴:

1. **Interactivity** 토글 **ON**
2. **Request URL**: `https://<v2-vercel-url>/api/slack/interactions`
3. **Save Changes**

### 3-3. Event Subscriptions

**Event Subscriptions** 메뉴:

1. **Enable Events** 토글 **ON**
2. **Request URL**: `https://<v2-vercel-url>/api/slack/events`
   - URL verification이 자동으로 진행됩니다 (초록 체크 표시 확인)
3. **Subscribe to bot events** 섹션:
   - `app_mention` 추가
   - `message.im` 추가 (봇과의 DM 메시지 수신)
4. **Save Changes**

### 3-4. 앱 설치

**Install App** 메뉴:

1. **Install to Workspace** 클릭
2. 권한 확인 후 **Allow**
3. **Bot User OAuth Token** (xoxb-...) 복사
   - 이 토큰을 Vercel 환경 변수에 설정합니다

---

## 4. GitHub Secrets 추가

GitHub 레포지토리 **Settings → Secrets and variables → Actions**:

### 새로 추가할 Secret

| 변수 | 값 | 설명 |
|------|-----|------|
| `SLACK_BOT_TOKEN_V2` | xoxb-... | V2 앱의 Bot Token |

### 기존 Secrets (재사용)

다음은 V1과 동일한 값을 사용합니다:

- `ANTHROPIC_API_KEY`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `PAT_TOKEN` (GitHub Personal Access Token)

**`PAT_TOKEN` 필요 스코프:**

| 스코프 | 용도 |
|--------|------|
| `repo` | git push, PR 생성, 라벨 추가 |
| `workflow` | GitHub Actions 워크플로우 트리거 |
| `read:org` | `gh` CLI가 조직 정보 조회 시 필요 (라벨 추가에 간접 필요) |

> **주의**: `read:org` 스코프가 없으면 `deploy-preview` 라벨이 PR에 붙지 않아 Vercel 프리뷰 배포가 트리거되지 않습니다.

---

## 5. 사용 방법

### 5-1. 신규 요청 (명확한 경우)

```
/request
```

모달에 입력:
```
FAQ에 "환불 절차는 어떻게 되나요?" 질문 추가, 답변은 "교육 시작 전까지 전액 환불 가능합니다."
```

**결과**:
```
✨ 내용 확인했습니다!
  ↓ (분석 중)
🎉 PR 만들었습니다! #123
```

### 5-2. 신규 요청 (애매한 경우)

```
/request
```

모달에 입력:
```
지원 마감일 변경해줘
```

**결과**:
```
✨ 내용 확인했습니다!
  ↓ (분석 중)
🤔 확인할 게 있어요!
• 지원 마감일을 며칠로 변경할까요?
```

쓰레드에서 답변:
```
@봇 3월 15일
```

**결과**:
```
✨ 답변 확인했어요! 바로 작업 시작할게요 ⏳
  ↓ (작업 중)
🎉 PR 만들었습니다! #123
```

### 5-3. 추가 요청

PR 완료 후 같은 쓰레드에서:

```
@봇 교육 시작일도 3월 20일로 바꿔줘
```

**결과**:
```
✨ 추가 요청 확인했습니다!
  ↓ (작업 중)
🎉 추가 작업 완료했습니다! #123
```

---

## 6. 아키텍처

### 파일 구조

```
apps/slack-bot/
├── api/slack/
│   ├── commands.js      # /request 슬래시 명령어 처리
│   ├── interactions.js  # 모달 제출 → GitHub Actions 트리거
│   └── events.js        # 멘션 이벤트 (질문 답변, 추가 요청)
├── lib/
│   ├── slack.js         # Slack API 유틸리티
│   └── github.js        # GitHub API 유틸리티
├── package.json
├── vercel.json
└── .env.example

.github/workflows/
└── claude-code-request-v2.yml  # V2 워크플로우
```

### 워크플로우

```
/request
  ↓
모달 입력
  ↓
interactions.js → GitHub dispatch (claude-code-request-v2)
  ↓
┌─────────────────────────────────────┐
│ Plan + Clarify (Opus)               │
│  - 요청 분석                         │
│  - 정보 충분? → plan.md             │
│  - 정보 부족? → questions.json      │
└─────────────────────────────────────┘
  ↓
questions.json 있음?
  ├─ YES → Slack에 질문 전송 → 워크플로우 종료
  │           ↓ (사용자 답변)
  │         events.js → GitHub dispatch (is_clarified: true)
  │           ↓
  │         Plan (질문 스킵) → Execute
  │
  └─ NO → Execute (Sonnet)
            ↓
          PR 생성 또는 기존 PR에 커밋
            ↓
          Slack 알림
```

---

## 7. 상태 머신

쓰레드는 3가지 상태를 가집니다:

| 상태 | 메타데이터 | 동작 |
|------|----------|------|
| **in_progress** | 없음 | "아직 작업 중이에요!" |
| **pending_question** | `<!-- pending_question:true -->` | 답변 처리 → 작업 재시작 |
| **pr_ready** | `PR: N \| Branch: xxx` | 추가 요청 가능 |

역순 스캔으로 최신 상태를 우선 감지합니다.

---

## 8. 트러블슈팅

### 8-1. URL verification 실패

**증상**: Slack 앱 설정에서 Request URL을 저장할 수 없음

**해결**:
1. Vercel 배포 로그 확인
2. Vercel Function 로그에서 에러 확인
3. `SLACK_SIGNING_SECRET` 환경 변수 확인

### 8-2. 모달 제출 후 반응 없음

**증상**: 모달 제출 후 Slack에 아무 메시지가 안 옴

**해결**:
1. Vercel Function 로그 확인 (`interactions.js`)
2. GitHub Actions 트리거 확인:
   ```bash
   gh api repos/owner/repo/actions/workflows/claude-code-request-v2.yml/runs
   ```
3. `GITHUB_TOKEN` 권한 확인 (repo 스코프 필요)

### 8-3. 질문 답변 후 "아직 작업 중" 메시지

**증상**: 질문에 답변했는데 "아직 작업 중이에요!" 메시지가 나옴

**원인**: `question_answered` 마커가 제대로 임베드되지 않음

**해결**:
1. `events.js`의 답변 처리 로직 확인
2. Slack 메시지 블록에 `question_answered:true` 포함 여부 확인

### 8-4. PR 완료 후 추가 요청이 새 PR 생성

**증상**: 추가 요청인데 기존 PR에 커밋이 안 되고 새 PR이 생성됨

**원인**: PR 메타데이터를 찾지 못함

**해결**:
1. PR 생성 알림 메시지에 `PR: N | Branch: xxx` 포함 확인
2. `findMetadataInThread()` 정규식 패턴 확인

### 8-5. PR 생성 후 `deploy-preview` 라벨이 안 붙음

**증상**: PR이 생성됐지만 `deploy-preview` 라벨이 없어서 Vercel 프리뷰 배포가 트리거되지 않음

**원인**: `PAT_TOKEN`에 `read:org` 스코프가 없으면 `gh` CLI가 조직 정보를 조회하지 못해 라벨 추가가 실패함. 에러는 `console.warn`으로 조용히 삼켜져 워크플로우 자체는 성공으로 표시됨.

**에러 메시지 예시**:
```
GraphQL: Your token has not been granted the required scopes to execute this query.
The 'login' field requires one of the following scopes: ['read:org']
```

**해결**:
1. https://github.com/settings/tokens 에서 `PAT_TOKEN`에 사용된 토큰 선택
2. `read:org` 스코프 추가 후 저장
3. GitHub Secrets의 `PAT_TOKEN` 값 업데이트 (토큰을 재생성한 경우)

---

## 9. 개발 및 테스트

### 로컬 개발

```bash
cd apps/slack-bot

# .env 파일 생성 (.env.example 참고)
cp .env.example .env

# Vercel CLI로 로컬 테스트
vercel dev
```

### ngrok으로 Slack 연동 테스트

```bash
# ngrok 실행
ngrok http 3000

# Slack 앱 Request URL을 ngrok URL로 변경
# https://xxxx.ngrok.io/api/slack/commands
```

---

## 10. 참고 자료

- [Slack API 문서](https://api.slack.com/)
- [Vercel Serverless Functions](https://vercel.com/docs/functions/serverless-functions)
- [명세서 전체](../../docs/INTERACTIVE-WORKFLOW-SPEC.md)
