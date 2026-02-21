# 사용 가이드: 타겟 레포에서 Claude Code Action 사용하기

이 문서는 자신의 레포에서 Claude Code Action의 Composite Action을 설정하는 방법을 안내합니다.

## 개요

타겟 레포에 **workflow 파일 1~2개**만 추가하면 Slack에서 코드 수정을 요청하고 자동으로 PR을 생성할 수 있습니다.

| Workflow | 용도 | 필수 여부 |
|----------|------|-----------|
| `claude-code.yml` | Slack 요청 → AI 코드 구현 → PR 생성 | 필수 |
| `preview.yml` | PR 생성 시 Preview 배포 (Vercel) | 선택 |

## 사전 요구 사항

- Slack Bot이 설정되어 있고 타겟 레포를 가리키도록 `GITHUB_REPO` 환경변수 설정 완료
- GitHub Actions Secrets 설정 완료

---

## Step 1: Agent Workflow 설정 (필수)

타겟 레포에 `.github/workflows/claude-code.yml` 파일을 생성합니다:

```yaml
name: Claude Code Request

on:
  repository_dispatch:
    types: [claude-code-request-v3]

permissions:
  contents: write
  pull-requests: write

jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - name: Parse branch from payload
        id: parse
        run: |
          branch=$(echo '${{ toJSON(github.event.client_payload) }}' | jq -r '.branch // "main"')
          echo "branch=$branch" >> $GITHUB_OUTPUT

      - name: Checkout target repo
        uses: actions/checkout@v4
        with:
          ref: ${{ steps.parse.outputs.branch }}
          fetch-depth: 0
          persist-credentials: false

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run Claude Agent
        id: claude
        uses: hmu332233/study.slack-claude-bot/apps/claude-agent@main
        with:
          client_payload: ${{ toJSON(github.event.client_payload) }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
          pat_token: ${{ secrets.PAT_TOKEN }}

      - name: Log Cost Summary
        if: always()
        run: |
          echo "## Cost Report" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Phase | Cost (USD) | Turns | Input Tokens | Output Tokens |" >> $GITHUB_STEP_SUMMARY
          echo "|-------|------------|-------|--------------|---------------|" >> $GITHUB_STEP_SUMMARY
          echo "| Plan | \$${{ steps.claude.outputs.plan_cost }} | ${{ steps.claude.outputs.plan_turns }} | ${{ steps.claude.outputs.plan_input_tokens }} | ${{ steps.claude.outputs.plan_output_tokens }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Execute | \$${{ steps.claude.outputs.execute_cost }} | ${{ steps.claude.outputs.execute_turns }} | ${{ steps.claude.outputs.execute_input_tokens }} | ${{ steps.claude.outputs.execute_output_tokens }} |" >> $GITHUB_STEP_SUMMARY
          echo "| **Total** | **\$${{ steps.claude.outputs.total_cost }}** | | | |" >> $GITHUB_STEP_SUMMARY
```

이 파일이 하는 일:
1. Slack Bot이 `repository_dispatch` 이벤트를 트리거하면 실행
2. 페이로드에서 브랜치를 파싱하고 타겟 레포를 체크아웃
3. `claude-agent` Composite Action을 실행하여 코드 분석, 구현, PR 생성
4. 비용 리포트를 GitHub Step Summary에 기록

---

## Step 2: Preview Workflow 설정 (선택)

PR 생성 시 자동으로 Vercel Preview 배포를 하려면 `.github/workflows/preview.yml`을 추가합니다:

```yaml
name: Preview Deploy

on:
  pull_request:
    types: [labeled, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  preview:
    runs-on: ubuntu-latest
    if: contains(github.event.pull_request.labels.*.name, 'deploy-preview')
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy Preview
        uses: hmu332233/study.slack-claude-bot/apps/preview-deploy@main
        with:
          provider: 'vercel'
          vercel_token: ${{ secrets.VERCEL_TOKEN }}
          vercel_org_id: ${{ secrets.VERCEL_ORG_ID }}
          vercel_project_id: ${{ secrets.VERCEL_PROJECT_ID }}
          slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
```

Preview가 동작하는 시나리오:

| 트리거 | 상황 |
|--------|------|
| `labeled` | claude-agent가 PR 생성 후 `deploy-preview` 라벨 추가 → 자동 preview |
| `synchronize` | `deploy-preview` 라벨이 있는 PR에 push (수동 커밋, follow-up 등) → preview 갱신 |

---

## Step 3: CLAUDE.md & Skills 설정

### CLAUDE.md

타겟 레포 루트에서 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)의 `/init` 명령어를 실행하면 프로젝트를 분석하여 `CLAUDE.md` 파일을 자동 생성해줍니다.

```sh
# 타겟 레포 루트에서
claude

# Claude Code 세션 안에서
/init
```

빌드 명령어, 기본 컨벤션 등 프로젝트의 기본 정보가 담기며, 필요에 따라 수정하세요.

> **팁:** `CLAUDE.md`는 항상 전체가 컨텍스트에 로딩됩니다. 길어질수록 비효율적이므로 핵심만 담으세요.

### Skills (권장)

`CLAUDE.md` 외에 `.claude/skills/`에 **프로젝트의 맥락 정보를 Skill로 만들어두는 것을 권장합니다.** Skills는 필요할 때만 선택적으로 로딩되므로 컨텍스트를 효율적으로 사용할 수 있습니다.

AI가 코드를 잘 짜려면 프로젝트의 맥락을 알아야 합니다. 예를 들어 랜딩페이지 프로젝트라면 브랜드 가이드, 서비스 소개 문구, 요금제 정보 같은 것들을 Skill로 넣어두면 AI가 참조하여 더 정확한 결과물을 만들어냅니다.

```
your-repo/
├── .claude/
│   └── skills/
│       ├── brand-guide/           # 브랜드 톤앤매너, 색상, 폰트
│       │   └── SKILL.md
│       ├── copy-text/             # 서비스 소개 문구, 카피라이팅 원칙
│       │   └── SKILL.md
│       ├── page-sections/         # 섹션 구성, 각 섹션의 목적과 내용
│       │   └── SKILL.md
│       ├── product-info/          # 서비스/제품 설명, 요금제, 기능 목록
│       │   └── SKILL.md
│       └── design-tokens/         # 간격, 반응형 breakpoint, 애니메이션 규칙
│           └── SKILL.md
├── .github/
│   └── workflows/
│       └── claude-code.yml
└── CLAUDE.md
```

---

## Step 4: GitHub Secrets 설정

타겟 레포의 **Settings → Secrets and variables → Actions**에서 다음 Secrets를 추가합니다.

### Agent Workflow용 (필수)

| Secret | 설명 |
|--------|------|
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token |
| `PAT_TOKEN` | GitHub Personal Access Token |

**`PAT_TOKEN` 필요 스코프:**

| 스코프 | 용도 |
|--------|------|
| `repo` | git push, PR 생성, 라벨 추가 |
| `workflow` | GitHub Actions 워크플로우 트리거 |
| `read:org` | 라벨 추가 시 필요 (없으면 `deploy-preview` 라벨이 안 붙음) |

> **참고:** Composite Action은 `secrets: inherit`가 아닌, workflow에서 직접 `${{ secrets.XXX }}`로 전달합니다. Step 1, 2의 예시를 참고하세요.

### Preview Workflow용 (선택)

| Secret | 설명 |
|--------|------|
| `VERCEL_TOKEN` | Vercel 배포 토큰 |
| `VERCEL_ORG_ID` | Vercel Organization ID |
| `VERCEL_PROJECT_ID` | Vercel Project ID |

---

## 사용 방법

### 새 요청

Slack에서:

```
/request
```

모달에 수정 요청 입력 → AI가 분석하고 PR을 생성합니다.

### 질문이 오면

AI가 정보가 부족하다고 판단하면 Slack 쓰레드에 질문을 보냅니다:

```
확인할 게 있어요!
• 어떤 날짜로 변경할까요?
```

쓰레드에서 답변:

```
@봇 3월 15일로 변경해주세요
```

### 추가 요청

PR이 생성된 후 같은 쓰레드에서:

```
@봇 버튼 색상도 파란색으로 바꿔줘
```

기존 PR에 추가 커밋이 생성됩니다.

---

## 전체 파일 구조 요약

타겟 레포에 추가되는 파일:

```
your-repo/
├── .claude/
│   └── skills/                 # (권장) 프로젝트 맥락 정보
│       └── ...
├── .github/
│   └── workflows/
│       ├── claude-code.yml     # (필수) ~50줄
│       └── preview.yml         # (선택) ~20줄
└── CLAUDE.md                   # /init으로 자동 생성
```

---

## 트러블슈팅

### repository_dispatch가 트리거되지 않음

**원인**: Slack Bot의 `GITHUB_REPO` 환경변수가 타겟 레포를 가리키지 않음

**해결**: Slack Bot (Vercel) 환경변수에서 `GITHUB_REPO`를 타겟 레포 (`owner/repo`)로 변경

### PR에 deploy-preview 라벨이 안 붙음

**원인**: `PAT_TOKEN`에 `read:org` 스코프 없음

**해결**: GitHub 토큰 설정에서 `read:org` 스코프 추가. 자세한 내용은 [Slack Bot README 트러블슈팅](../apps/slack-bot/README.md#8-5-pr-생성-후-deploy-preview-라벨이-안-붙음) 참조.

### Preview 배포가 트리거되지 않음

**원인**: `preview.yml`이 없거나, `deploy-preview` 라벨이 붙지 않음

**해결**:
1. `preview.yml` 파일이 `.github/workflows/` 에 있는지 확인
2. PR에 `deploy-preview` 라벨이 있는지 확인
3. Vercel 관련 Secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`)가 설정되어 있는지 확인

### Clarification 답변 후 반응 없음

**원인**: Slack Bot의 이벤트 구독이 제대로 설정되지 않음

**해결**: Slack 앱 설정에서 Event Subscriptions의 `app_mention` 이벤트가 활성화되어 있는지 확인. 자세한 설정 방법은 [Slack Bot README](../apps/slack-bot/README.md) 참조.
