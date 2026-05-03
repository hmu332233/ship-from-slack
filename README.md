# Ship From Slack

[한국어](README.KO.md)

Slack threads for small code changes: clarify the request, run an AI coding agent, open a pull request, and send the preview back to Slack.

Ship From Slack is for teams that handle frequent, small product or content changes. A requester starts with `/request` in Slack, the bot asks follow-up questions when the request is unclear, and the agent turns the final request into a pull request in the target repository.

<img src="./docs/example.png" width="420" alt="Slack thread showing a request, clarification, pull request, and preview link" />

## What It Does

- Accepts code-change requests from Slack with a `/request` command.
- Keeps clarification, follow-up requests, PR metadata, and preview links in one Slack thread.
- Triggers GitHub Actions with `repository_dispatch`.
- Runs the Claude Agent composite action against the target repository.
- Creates or updates a pull request instead of pushing directly to production.
- Optionally deploys a Vercel preview and posts the result back to Slack.

## When To Use It

Ship From Slack works best for small, reviewable changes such as copy updates, FAQ edits, simple UI tweaks, landing-page adjustments, and follow-up polish on an existing PR.

It is not a production auto-deploy system, a replacement for code review, or a good fit for large architectural changes that need upfront design work.

## How It Works

```text
Slack /request
  -> Slack Bot on Vercel
  -> GitHub repository_dispatch
  -> Target repository GitHub Actions workflow
  -> Claude Agent composite action
  -> Pull request
  -> Optional Vercel preview
  -> Slack thread update
```

The Slack thread is the workflow state. Bot messages store whether the request is waiting for clarification, currently in progress, or ready for follow-up changes on an existing PR.

## Repository Layout

```text
apps/
  slack-bot/        Vercel serverless Slack app
  claude-agent/     GitHub composite action that plans, edits, and opens PRs
  preview-deploy/   GitHub composite action for Vercel preview deploys
docs/
  SETUP.md          End-to-end installation guide
  ARCHITECTURE.md   Contributor-oriented workflow and state model
```

## Quick Start

Read the full guide first if you are setting this up for a real repository:

[docs/SETUP.md](docs/SETUP.md)

At a high level, setup has five parts:

1. Create a Slack App with slash commands, interactivity, event subscriptions, and a bot token.
2. Deploy `apps/slack-bot` to Vercel.
3. Point the bot at the target repository with `GITHUB_REPO=owner/repo`.
4. Add `claude-code.yml` and optional `preview.yml` workflows to the target repository.
5. Add the required Slack, GitHub, Anthropic, and optional Vercel secrets.

Required Slack Bot environment variables:

| Variable | Purpose |
| --- | --- |
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | Slack App Signing Secret |
| `GITHUB_TOKEN` | GitHub Personal Access Token that can dispatch workflows |
| `GITHUB_REPO` | Target repository in `owner/repo` format |

Required target repository secrets:

| Secret | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude Agent API access |
| `SLACK_BOT_TOKEN` | Slack notifications from Actions |
| `PAT_TOKEN` | Git push, PR creation, labels, and workflow access |

Preview deployments also require `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.

## Local Development

Install dependencies from the workspace root:

```sh
pnpm install
```

Run the Slack bot locally with Vercel:

```sh
cd apps/slack-bot
cp .env.example .env
pnpm exec vercel dev
```

Type-check the Claude Agent:

```sh
pnpm --filter claude-agent typecheck
```

## Documentation

| Document | Use it for |
| --- | --- |
| [Setup Guide](docs/SETUP.md) | Installing Slack, Vercel, GitHub Actions, secrets, and first test |
| [Setup Guide (Korean)](docs/SETUP.KO.md) | Korean version of the end-to-end setup guide |
| [Architecture](docs/ARCHITECTURE.md) | Understanding request states, payloads, and component boundaries |
| [Contributing](CONTRIBUTING.md) | Local development, contribution flow, and PR expectations |

## Contributing

Issues and pull requests are welcome. Before opening a PR, read [CONTRIBUTING.md](CONTRIBUTING.md), keep changes scoped, and update docs when setup behavior or workflow behavior changes.

## License

MIT. See [LICENSE](LICENSE).
