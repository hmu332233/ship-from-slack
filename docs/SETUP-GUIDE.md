# Ship From Slack 설정 가이드

이 문서는 Ship From Slack을 처음 설정하는 사람이 한 번에 따라갈 수 있도록 Slack App, Vercel, GitHub Actions, 타겟 레포 설정을 하나의 흐름으로 정리한 가이드입니다.

## 1. 전체 구조 이해하기

Ship From Slack은 Slack에서 받은 요청을 GitHub Actions로 전달하고, Claude Agent가 타겟 레포를 수정한 뒤 Pull Request와 Preview 링크를 Slack 쓰레드로 돌려주는 구조입니다.

```text
Slack /request
  -> Vercel에 배포된 Slack Bot
  -> GitHub repository_dispatch
  -> 타겟 레포의 claude-code.yml
  -> Claude Agent 실행 및 PR 생성
  -> preview.yml이 있으면 Vercel Preview 배포
  -> Slack 쓰레드에 결과 안내
```

설정 대상은 크게 두 곳입니다.

| 대상 | 설정 내용 |
| --- | --- |
| Slack Bot 프로젝트 | Slack App 생성, Vercel 배포, Slack URL 연결 |
| 타겟 레포 | GitHub Actions workflow, Secrets, Claude 컨텍스트 설정 |

## 2. 준비물

설정을 시작하기 전에 아래 계정과 권한을 준비합니다.

| 준비물 | 필요한 이유 |
| --- | --- |
| Slack Workspace 관리자 권한 | Slack App 생성, Slash Command, Event Subscription 설정 |
| GitHub Personal Access Token | 타겟 레포 접근, workflow 트리거, PR 생성, 라벨 추가 |
| Anthropic API Key | Claude Agent 실행 |
| Vercel 계정 | Slack Bot 호스팅 및 Preview 배포 |
| 타겟 GitHub 레포 권한 | workflow와 Secrets 추가 |

GitHub Personal Access Token은 classic token 기준으로 `repo`, `workflow`, `read:org` 스코프가 필요합니다. 특히 `read:org`가 없으면 PR에 `deploy-preview` 라벨을 붙이는 과정이 실패할 수 있습니다.

## 3. Slack App 만들기

1. https://api.slack.com/apps 에 접속합니다.
2. **Create New App**을 누르고 **From scratch**를 선택합니다.
3. App Name을 정하고, 사용할 Workspace를 선택합니다.
4. **OAuth & Permissions** 메뉴에서 Bot Token Scopes를 추가합니다.

| Scope | 용도 |
| --- | --- |
| `commands` | `/request` Slash Command 처리 |
| `chat:write` | Slack 메시지 전송 |
| `chat:write.public` | 봇이 초대되지 않은 공개 채널에도 메시지 전송 |
| `app_mentions:read` | 쓰레드에서 봇 멘션 수신 |
| `channels:history` | 공개 채널 쓰레드 메시지 조회 |
| `groups:history` | 비공개 채널 쓰레드 메시지 조회 |
| `im:history` | DM 메시지 조회 |

5. **Install App** 메뉴에서 앱을 Workspace에 설치합니다.
6. 생성된 **Bot User OAuth Token**을 복사해 둡니다. 보통 `xoxb-`로 시작합니다.
7. **Basic Information > App Credentials**에서 **Signing Secret**을 복사해 둡니다.

## 4. Slack Bot을 Vercel에 배포하기

Slack Bot은 이 저장소의 `apps/slack-bot` 디렉터리에 있습니다. Vercel에서 새 프로젝트를 만들 때 아래처럼 설정합니다.

| 항목 | 값 |
| --- | --- |
| Repository | Ship From Slack 저장소 |
| Framework Preset | Other |
| Root Directory | `apps/slack-bot` |
| Build Command | 비워둠 |
| Output Directory | 비워둠 |

Vercel 프로젝트의 **Settings > Environment Variables**에 아래 값을 추가합니다.

| 변수 | 값 |
| --- | --- |
| `SLACK_BOT_TOKEN` | Slack App의 Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | Slack App의 Signing Secret |
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `GITHUB_REPO` | 요청을 처리할 타겟 레포, 예: `owner/repo` |

로컬에서 Vercel CLI로 배포한다면 다음 명령을 사용할 수 있습니다.

```sh
cd apps/slack-bot
pnpm install
pnpm exec vercel --prod
```

배포가 끝나면 Vercel URL을 기록합니다. 예시는 `https://slack-bot-xxxx.vercel.app` 형식입니다.

## 5. Slack App URL 연결하기

Vercel URL이 준비되면 Slack App 설정으로 돌아가서 URL을 연결합니다.

### Slash Command

**Slash Commands > Create New Command**에서 아래처럼 설정합니다.

| 항목 | 값 |
| --- | --- |
| Command | `/request` |
| Request URL | `https://<vercel-url>/api/slack/commands` |
| Short Description | 코드 수정 요청 |
| Usage Hint | 수정 요청 내용을 입력하세요 |

### Interactivity

**Interactivity & Shortcuts** 메뉴에서 Interactivity를 켜고 Request URL을 설정합니다.

```text
https://<vercel-url>/api/slack/interactions
```

### Event Subscriptions

**Event Subscriptions** 메뉴에서 Enable Events를 켜고 Request URL을 설정합니다.

```text
https://<vercel-url>/api/slack/events
```

URL verification이 성공하면 **Subscribe to bot events**에 아래 이벤트를 추가합니다.

| 이벤트 | 용도 |
| --- | --- |
| `app_mention` | 기존 요청 쓰레드에서 추가 요청 또는 질문 답변 수신 |
| `message.im` | DM 메시지 수신 |

설정을 저장한 뒤 앱 권한이 바뀌었다면 Workspace에 앱을 다시 설치합니다.

## 6. 타겟 레포에 Agent Workflow 추가하기

타겟 레포에 `.github/workflows/claude-code.yml` 파일을 추가합니다. 이 workflow는 Slack Bot이 보내는 `claude-code-request` 이벤트를 받아 Claude Agent를 실행합니다.

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
        uses: hmu332233/ship-from-slack/apps/claude-agent@main
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

이 저장소를 fork해서 운영한다면 `uses: hmu332233/ship-from-slack/apps/claude-agent@main`의 owner와 repo를 fork한 저장소에 맞게 바꿉니다.

## 7. Preview Workflow 추가하기

PR이 만들어질 때 Vercel Preview 배포까지 연결하려면 타겟 레포에 `.github/workflows/preview.yml`을 추가합니다.

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
        uses: hmu332233/ship-from-slack/apps/preview-deploy@main
        with:
          provider: 'vercel'
          vercel_token: ${{ secrets.VERCEL_TOKEN }}
          vercel_org_id: ${{ secrets.VERCEL_ORG_ID }}
          vercel_project_id: ${{ secrets.VERCEL_PROJECT_ID }}
          slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
```

이 workflow는 PR에 `deploy-preview` 라벨이 붙었을 때 실행됩니다. Claude Agent는 PR 생성 후 이 라벨을 추가하고, 이후 같은 PR에 추가 커밋이 push되면 Preview가 다시 배포됩니다.

## 8. GitHub Actions Secrets 설정하기

타겟 레포의 **Settings > Secrets and variables > Actions**에서 아래 Secrets를 추가합니다.

### 필수 Secrets

| Secret | 설명 |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude Agent 실행용 Anthropic API Key |
| `SLACK_BOT_TOKEN` | Slack App의 Bot User OAuth Token |
| `PAT_TOKEN` | GitHub Personal Access Token |

### Preview를 사용할 때 필요한 Secrets

| Secret | 설명 |
| --- | --- |
| `VERCEL_TOKEN` | Vercel 배포 토큰 |
| `VERCEL_ORG_ID` | Vercel Organization ID |
| `VERCEL_PROJECT_ID` | Vercel Project ID |

`PAT_TOKEN`은 workflow에서 직접 `pat_token: ${{ secrets.PAT_TOKEN }}` 형태로 전달합니다. `secrets: inherit` 방식이 아니라 각 input에 필요한 Secret을 명시해야 합니다.

## 9. Claude 컨텍스트 설정하기

Claude Agent가 타겟 레포를 더 정확히 수정하려면 프로젝트 규칙과 맥락을 알려주는 파일을 준비하는 것이 좋습니다.

타겟 레포 루트에서 Claude Code CLI를 실행한 뒤 `/init` 명령으로 `CLAUDE.md`를 생성합니다.

```sh
claude
```

Claude Code 세션 안에서 실행합니다.

```text
/init
```

`CLAUDE.md`에는 빌드 명령, 테스트 명령, 코드 컨벤션처럼 항상 필요한 핵심 정보만 담습니다. 추가로 브랜드 문구, 디자인 토큰, 페이지 구성처럼 필요할 때만 참고하면 되는 정보는 `.claude/skills/` 아래에 Skill로 나누는 것을 권장합니다.

```text
your-repo/
  .claude/
    skills/
      brand-guide/
        SKILL.md
      copy-text/
        SKILL.md
      design-tokens/
        SKILL.md
  .github/
    workflows/
      claude-code.yml
      preview.yml
  CLAUDE.md
```

## 10. 동작 확인하기

설정을 마친 뒤 Slack에서 `/request`를 실행하고 모달에 작은 변경 요청을 입력합니다.

```text
FAQ에 "환불 절차는 어떻게 되나요?" 질문을 추가하고,
답변은 "교육 시작 전까지 전액 환불 가능합니다."로 넣어줘
```

정상 동작하면 다음 흐름을 확인할 수 있습니다.

| 단계 | 확인 위치 |
| --- | --- |
| 요청 접수 메시지 | Slack 쓰레드 |
| GitHub Actions 실행 | 타겟 레포의 Actions 탭 |
| PR 생성 | 타겟 레포 Pull Requests |
| Preview 배포 | PR 댓글 또는 Slack 쓰레드 |
| 추가 요청 처리 | 같은 Slack 쓰레드에서 봇 멘션 |

추가 요청은 PR 생성 후 같은 쓰레드에서 봇을 멘션해 보냅니다.

```text
@봇 답변 문구를 조금 더 친절하게 바꿔줘
```

정보가 부족한 요청을 보내면 봇이 질문을 남기고, 같은 쓰레드에서 답변하면 작업이 이어집니다.

## 11. 최종 체크리스트

설정이 끝났는지 아래 항목을 확인합니다.

| 항목 | 확인 |
| --- | --- |
| Slack App이 Workspace에 설치됨 | Bot User OAuth Token이 발급됨 |
| Vercel Slack Bot 환경 변수가 설정됨 | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO` |
| Slack Slash Command URL이 연결됨 | `/api/slack/commands` |
| Slack Interactivity URL이 연결됨 | `/api/slack/interactions` |
| Slack Event Subscription URL이 연결됨 | `/api/slack/events` |
| 타겟 레포에 `claude-code.yml`이 있음 | `repository_dispatch.types`에 `claude-code-request` 포함 |
| 타겟 레포에 필수 Secrets가 있음 | `ANTHROPIC_API_KEY`, `SLACK_BOT_TOKEN`, `PAT_TOKEN` |
| Preview 사용 시 `preview.yml`과 Vercel Secrets가 있음 | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| `PAT_TOKEN` 스코프가 충분함 | `repo`, `workflow`, `read:org` |
| `/request` 테스트가 성공함 | Slack 쓰레드, Actions 실행, PR 생성 확인 |

## 12. 자주 막히는 지점

### Slash Command나 Event URL verification이 실패함

Vercel 배포가 완료됐는지, URL 경로가 정확한지, `SLACK_SIGNING_SECRET`이 올바른지 확인합니다. Event Subscriptions의 URL은 `/api/slack/events`여야 합니다.

### 모달 제출 후 Slack에 반응이 없음

Vercel Function 로그에서 `interactions.js` 오류를 확인합니다. 그 다음 타겟 레포 Actions 탭에서 `claude-code.yml` 실행이 생성됐는지 봅니다. 실행이 없다면 Vercel의 `GITHUB_TOKEN`, `GITHUB_REPO` 값을 확인합니다.

### `repository_dispatch`가 실행되지 않음

Slack Bot의 `GITHUB_REPO`가 타겟 레포를 가리키는지 확인합니다. 타겟 레포의 `.github/workflows/claude-code.yml`에는 아래 이벤트 타입이 있어야 합니다.

```yaml
on:
  repository_dispatch:
    types: [claude-code-request]
```

### PR은 생성됐지만 Preview가 배포되지 않음

타겟 레포에 `preview.yml`이 있는지, PR에 `deploy-preview` 라벨이 붙었는지, Vercel Secrets가 모두 있는지 확인합니다.

### PR에 `deploy-preview` 라벨이 붙지 않음

`PAT_TOKEN`에 `read:org` 스코프가 없을 때 라벨 추가가 실패할 수 있습니다. GitHub token 설정에서 `repo`, `workflow`, `read:org` 스코프를 모두 포함했는지 확인하고, 토큰을 재생성했다면 GitHub Actions Secret도 갱신합니다.

### 질문에 답변했는데 후속 작업이 시작되지 않음

Slack Event Subscriptions에 `app_mention`이 추가되어 있는지 확인합니다. 답변은 기존 요청 쓰레드 안에서 봇을 멘션해 보내야 합니다.
