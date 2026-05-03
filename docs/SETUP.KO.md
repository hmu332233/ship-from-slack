# 설정 가이드

[English](SETUP.md)

이 문서는 Ship From Slack을 처음부터 끝까지 설정하는 가이드입니다. Slack App, Vercel에 배포된 bot, 타겟 레포의 GitHub Actions, secrets, 선택적 Preview 배포, 첫 테스트 요청까지 한 번에 다룹니다.

## 1. 준비물

시작하기 전에 아래 서비스 접근 권한이 필요합니다.

| 준비물 | 필요한 이유 |
| --- | --- |
| Slack workspace 관리자 권한 | Slack App, slash command, event subscriptions 생성 |
| GitHub repository 관리자 권한 | workflow와 repository secrets 추가 |
| GitHub Personal Access Token | workflow dispatch, branch push, PR 생성, 라벨 추가 |
| Anthropic API key | Claude Agent 실행 |
| Vercel 계정 | Slack bot 호스팅과 선택적 Preview 배포 |

GitHub Personal Access Token은 classic token 기준으로 `repo`, `workflow`, `read:org` 스코프가 필요합니다. `read:org`는 라벨 추가 과정에서 GitHub CLI가 조직 정보를 조회할 때 필요할 수 있습니다.

## 2. Slack App 만들기

1. https://api.slack.com/apps 를 엽니다.
2. **Create New App**을 선택한 뒤 **From scratch**를 선택합니다.
3. 요청을 받을 workspace를 선택합니다.
4. **OAuth & Permissions**를 열고 아래 Bot Token Scopes를 추가합니다.

| Scope | 용도 |
| --- | --- |
| `commands` | `/request` slash command 수신 |
| `chat:write` | bot 메시지 전송 |
| `chat:write.public` | bot이 아직 참여하지 않은 공개 채널에도 메시지 전송 |
| `app_mentions:read` | 쓰레드의 답변과 추가 요청 수신 |
| `channels:history` | 공개 채널 쓰레드 읽기 |
| `groups:history` | 비공개 채널 쓰레드 읽기 |
| `im:history` | DM 쓰레드 읽기 |

5. 앱을 workspace에 설치합니다.
6. **OAuth & Permissions**에서 **Bot User OAuth Token**을 복사합니다.
7. **Basic Information > App Credentials**에서 **Signing Secret**을 복사합니다.

## 3. Slack Bot 배포하기

`apps/slack-bot`을 위한 Vercel 프로젝트를 만듭니다.

| Vercel 설정 | 값 |
| --- | --- |
| Framework Preset | Other |
| Root Directory | `apps/slack-bot` |
| Build Command | 비워둠 |
| Output Directory | 비워둠 |

Vercel 환경 변수에 아래 값을 추가합니다.

| 변수 | 값 |
| --- | --- |
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | Slack App Signing Secret |
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `GITHUB_REPO` | `owner/repo` 형식의 타겟 레포 |

Vercel 대시보드로 배포하거나 CLI를 사용할 수 있습니다.

```sh
cd apps/slack-bot
pnpm install
pnpm exec vercel --prod
```

배포가 끝나면 Vercel URL을 기록해 둡니다. 이 가이드에서는 `https://<vercel-url>`로 표기합니다.

## 4. Slack URL 연결하기

Slack App 설정으로 돌아가서 각 endpoint를 배포된 bot에 연결합니다.

### Slash Command

새 slash command를 만듭니다.

| 항목 | 값 |
| --- | --- |
| Command | `/request` |
| Request URL | `https://<vercel-url>/api/slack/commands` |
| Short Description | Code change request |
| Usage Hint | Describe the change |

### Interactivity

**Interactivity**를 켜고 Request URL을 설정합니다.

```text
https://<vercel-url>/api/slack/interactions
```

### Event Subscriptions

**Event Subscriptions**를 켜고 Request URL을 설정합니다.

```text
https://<vercel-url>/api/slack/events
```

URL verification이 성공하면 아래 bot events를 구독합니다.

| Event | 용도 |
| --- | --- |
| `app_mention` | 쓰레드 답변과 추가 요청 수신 |
| `message.im` | DM 수신 |

Slack이 app permission 변경을 표시하면 workspace에 앱을 다시 설치합니다.

## 5. 타겟 레포에 Agent Workflow 추가하기

타겟 레포에 `.github/workflows/claude-code.yml`을 만듭니다. `OWNER/ship-from-slack`은 이 프로젝트를 호스팅하는 owner와 repo, 또는 fork한 저장소에 맞게 바꿉니다.

```yaml
name: Claude Code Request

on:
  repository_dispatch:
    types: [claude-code-request]

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
        uses: OWNER/ship-from-slack/apps/claude-agent@main
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

## 6. 선택 사항: Preview 배포 추가하기

생성된 Pull Request에 Vercel Preview를 붙이고 싶다면 타겟 레포에 `.github/workflows/preview.yml`을 만듭니다.

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
        uses: OWNER/ship-from-slack/apps/preview-deploy@main
        with:
          provider: vercel
          vercel_token: ${{ secrets.VERCEL_TOKEN }}
          vercel_org_id: ${{ secrets.VERCEL_ORG_ID }}
          vercel_project_id: ${{ secrets.VERCEL_PROJECT_ID }}
          slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
```

Preview workflow는 agent가 `deploy-preview` 라벨을 추가했을 때 실행되고, 라벨이 붙은 PR에 새 commit이 push될 때 다시 실행됩니다.

## 7. 타겟 레포 Secrets 추가하기

타겟 레포의 **Settings > Secrets and variables > Actions**에 아래 secrets를 추가합니다.

| Secret | 필수 여부 | 용도 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | 필수 | Claude Agent API 접근 |
| `SLACK_BOT_TOKEN` | 필수 | GitHub Actions에서 Slack 알림 전송 |
| `PAT_TOKEN` | 필수 | branch push, PR 생성, 라벨 추가, workflow 접근 |
| `VERCEL_TOKEN` | Preview 사용 시 | Vercel Preview 배포 |
| `VERCEL_ORG_ID` | Preview 사용 시 | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Preview 사용 시 | Vercel project ID |

## 8. 타겟 레포 컨텍스트 추가하기

에이전트가 정확히 수정하려면 프로젝트 컨텍스트가 필요합니다. 타겟 레포에는 항상 로드되어야 하는 명령, 컨벤션, 경계 조건을 담은 짧은 `CLAUDE.md`를 만들거나 유지하세요.

Claude Code를 로컬에서 사용한다면 첫 초안을 만들 수 있습니다.

```sh
claude
```

Claude Code 세션 안에서 아래 명령을 실행합니다.

```text
/init
```

`CLAUDE.md`는 간결하게 유지하세요. 더 크거나 특화된 컨텍스트는 `.claude/skills/`에 넣어 필요한 경우에만 agent가 로드할 수 있게 하는 편이 좋습니다.

## 9. 전체 흐름 테스트하기

Slack에서 `/request`를 실행하고 작고 위험이 낮은 변경 요청을 제출합니다.

```text
FAQ 항목을 추가해줘: "환불은 어떻게 진행되나요?"
답변: "강의 시작 전까지는 전액 환불이 가능합니다."
```

각 단계를 확인합니다.

| 단계 | 확인 위치 |
| --- | --- |
| 요청 접수 | Slack 쓰레드 |
| workflow dispatch | 타겟 레포 Actions 탭 |
| Pull Request 생성 | 타겟 레포 Pull Requests |
| Preview 배포 | PR 댓글 또는 Slack 쓰레드 |
| 추가 요청 처리 | 같은 Slack 쓰레드에서 bot mention |

확인 질문 흐름을 테스트하려면 `마감일을 바꿔줘`처럼 의도적으로 정보가 부족한 요청을 제출합니다. 봇이 어떤 마감일인지, 어떤 날짜로 바꿀지 질문해야 합니다.

## Troubleshooting

### Slash Command 또는 Event Verification 실패

Vercel 배포가 활성화되어 있는지, endpoint path가 정확한지, `SLACK_SIGNING_SECRET`이 Slack App과 일치하는지 확인합니다.

### 모달 제출 후 Slack 응답이 없음

Vercel Function logs에서 `interactions.js`를 확인합니다. 그 다음 타겟 레포에서 `claude-code.yml` 실행이 생성됐는지 확인합니다. 실행이 없다면 `GITHUB_TOKEN`, `GITHUB_REPO`, target workflow trigger를 확인합니다.

### `repository_dispatch`가 실행되지 않음

`GITHUB_REPO`가 타겟 레포를 가리키는지, 타겟 workflow가 아래 이벤트를 수신하는지 확인합니다.

```yaml
on:
  repository_dispatch:
    types: [claude-code-request]
```

### PR은 생성됐지만 Preview가 배포되지 않음

`.github/workflows/preview.yml`이 있는지, PR에 `deploy-preview` 라벨이 있는지, Vercel secrets가 모두 있는지 확인합니다.

### `deploy-preview` 라벨이 없음

`PAT_TOKEN`에 `repo`, `workflow`, `read:org`가 포함되어 있는지 확인합니다. 토큰을 재생성했다면 repository secret도 함께 갱신하세요.

### 확인 질문에 답했는데 반응이 없음

Slack Event Subscriptions에 `app_mention`이 구독되어 있는지 확인하고, 답변이 원래 요청 쓰레드 안에서 bot을 mention한 상태로 작성됐는지 확인합니다.
