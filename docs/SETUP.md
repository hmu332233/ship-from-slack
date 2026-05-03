# Setup Guide

This guide sets up Ship From Slack end to end: Slack App, Vercel-hosted bot, GitHub Actions in the target repository, secrets, optional preview deployment, and a first test request.

## 1. Prerequisites

You need access to these services before you start.

| Requirement | Why it is needed |
| --- | --- |
| Slack workspace admin access | Create the Slack App, slash command, and event subscriptions |
| GitHub repository admin access | Add workflows and repository secrets |
| GitHub Personal Access Token | Dispatch workflows, push branches, create PRs, and add labels |
| Anthropic API key | Run the Claude Agent |
| Vercel account | Host the Slack bot and optionally deploy previews |

The GitHub Personal Access Token should be a classic token with `repo`, `workflow`, and `read:org`. The `read:org` scope is needed because GitHub CLI operations can require organization reads while adding labels.

## 2. Create The Slack App

1. Open https://api.slack.com/apps.
2. Choose **Create New App**, then **From scratch**.
3. Select the workspace where requests will be created.
4. Open **OAuth & Permissions** and add these Bot Token Scopes.

| Scope | Purpose |
| --- | --- |
| `commands` | Receive `/request` slash commands |
| `chat:write` | Post bot messages |
| `chat:write.public` | Post to public channels where the bot is not already a member |
| `app_mentions:read` | Receive answers and follow-up requests in threads |
| `channels:history` | Read public channel threads |
| `groups:history` | Read private channel threads |
| `im:history` | Read DM threads |

5. Install the app to the workspace.
6. Copy the **Bot User OAuth Token** from **OAuth & Permissions**.
7. Copy the **Signing Secret** from **Basic Information > App Credentials**.

## 3. Deploy The Slack Bot

Create a Vercel project for `apps/slack-bot`.

| Vercel setting | Value |
| --- | --- |
| Framework Preset | Other |
| Root Directory | `apps/slack-bot` |
| Build Command | Leave empty |
| Output Directory | Leave empty |

Add these Vercel environment variables.

| Variable | Value |
| --- | --- |
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | Slack App Signing Secret |
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `GITHUB_REPO` | Target repository in `owner/repo` format |

You can deploy with the Vercel dashboard or with the CLI.

```sh
cd apps/slack-bot
pnpm install
pnpm exec vercel --prod
```

After deployment, keep the Vercel URL. The rest of this guide uses `https://<vercel-url>`.

## 4. Connect Slack URLs

Return to the Slack App settings and connect each endpoint to the deployed bot.

### Slash Command

Create a new slash command.

| Field | Value |
| --- | --- |
| Command | `/request` |
| Request URL | `https://<vercel-url>/api/slack/commands` |
| Short Description | Code change request |
| Usage Hint | Describe the change |

### Interactivity

Turn on **Interactivity** and set the Request URL.

```text
https://<vercel-url>/api/slack/interactions
```

### Event Subscriptions

Turn on **Event Subscriptions** and set the Request URL.

```text
https://<vercel-url>/api/slack/events
```

After URL verification succeeds, subscribe to these bot events.

| Event | Purpose |
| --- | --- |
| `app_mention` | Receive thread answers and follow-up requests |
| `message.im` | Receive direct messages |

If Slack shows that app permissions changed, reinstall the app to the workspace.

## 5. Add The Agent Workflow To The Target Repository

Create `.github/workflows/claude-code.yml` in the target repository. Replace `OWNER/ship-from-slack` with the owner and repository that host your fork or installation of this project.

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

## 6. Optional: Add Preview Deployment

Create `.github/workflows/preview.yml` in the target repository if you want Vercel previews for generated pull requests.

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

The preview workflow runs when the agent adds the `deploy-preview` label, and again when new commits are pushed to a labeled PR.

## 7. Add Target Repository Secrets

Add these secrets in the target repository under **Settings > Secrets and variables > Actions**.

| Secret | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | Claude Agent API access |
| `SLACK_BOT_TOKEN` | Yes | Slack notifications from GitHub Actions |
| `PAT_TOKEN` | Yes | Push branches, open PRs, add labels, and access workflows |
| `VERCEL_TOKEN` | Preview only | Vercel preview deployment |
| `VERCEL_ORG_ID` | Preview only | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Preview only | Vercel project ID |

## 8. Add Target Repository Context

The agent needs enough project context to make focused changes. In the target repository, create or maintain a short `CLAUDE.md` with the commands, conventions, and boundaries that should always be loaded.

If you use Claude Code locally, you can generate a first draft.

```sh
claude
```

Then run this inside the Claude Code session.

```text
/init
```

Keep `CLAUDE.md` concise. Put larger or more specialized context in `.claude/skills/` so the agent can load it only when relevant.

## 9. Test The Flow

Run `/request` in Slack and submit a small, low-risk change request.

```text
Add an FAQ entry: "How do refunds work?"
Answer: "Full refunds are available before the course starts."
```

Confirm each stage.

| Stage | Where to check |
| --- | --- |
| Request accepted | Slack thread |
| Workflow dispatched | Target repository Actions tab |
| Pull request created | Target repository Pull Requests |
| Preview deployed | PR comment or Slack thread |
| Follow-up accepted | Same Slack thread with a bot mention |

To test clarification, submit an intentionally incomplete request such as `Change the deadline`. The bot should ask what deadline and what date to use.

## Troubleshooting

### Slash Command Or Event Verification Fails

Confirm that the Vercel deployment is live, the endpoint path is exact, and `SLACK_SIGNING_SECRET` matches the Slack App.

### Modal Submission Has No Slack Response

Check Vercel Function logs for `interactions.js`. Then check whether a `claude-code.yml` run appeared in the target repository. If no run appears, check `GITHUB_TOKEN`, `GITHUB_REPO`, and the target workflow trigger.

### `repository_dispatch` Does Not Run

Confirm that `GITHUB_REPO` points to the target repository and that the target workflow listens for this event.

```yaml
on:
  repository_dispatch:
    types: [claude-code-request]
```

### PR Is Created But Preview Does Not Deploy

Check that `.github/workflows/preview.yml` exists, the PR has the `deploy-preview` label, and the Vercel secrets are present.

### `deploy-preview` Label Is Missing

Confirm that `PAT_TOKEN` includes `repo`, `workflow`, and `read:org`. If you regenerate the token, update the repository secret as well.

### Answering A Clarification Does Nothing

Confirm that `app_mention` is subscribed in Slack Event Subscriptions and that the answer was posted inside the original request thread while mentioning the bot.
