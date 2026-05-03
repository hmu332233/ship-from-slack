# Ship From Slack

[한국어](README.KO.md)

Ship From Slack turns a Slack thread into a workflow for small, reviewable code changes: describe the change, let an AI coding agent open a pull request, deploy a preview, and check the result from the same thread.

The point is not only to make the edit faster. It is to shorten the loop between asking for a small change and seeing the actual result, without scattering context across chat, GitHub, CI, and preview links.

Ship From Slack is for teams that handle frequent, small product or content changes. Someone starts with `/request` in Slack, the Slack app collects and routes the request, and the coding agent decides whether it has enough context before turning the request into a pull request in the target repository.

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

## Example Use Case

One practical use case is a team that receives frequent small product or content update requests in Slack. Instead of turning each request into a separate engineering handoff, Ship From Slack keeps the request, generated pull request, preview deployment, and follow-up confirmation in one thread.

In that setup, the value is not that every edit is fully automated. The value is that the team can check small changes quickly while engineers spend less time switching context between Slack, GitHub, CI, and preview environments.

## Example Flow

```text
/request Add "How do refunds work?" to the FAQ
  -> the Slack app sends the request to GitHub Actions
  -> the coding agent asks a follow-up question if it needs more context
  -> the coding agent opens a pull request when the request is clear enough
  -> the preview link is posted back to the same Slack thread
  -> the same person asks for a small follow-up change in the same thread
```

## Who It Helps

- People asking for changes can stay in Slack, review the preview, and refine the change without leaving the original thread.
- Repo owners can receive repeated small requests as pull requests that are scoped, reviewable, and tied back to the discussion.

## How It Works

For the person asking for a change, the Slack thread is the only surface they need to follow.

```text
Slack /request
  -> Slack app on Vercel
  -> GitHub repository_dispatch
  -> Target repository GitHub Actions workflow
  -> Claude Agent composite action
  -> Pull request
  -> Optional Vercel preview
  -> Slack thread update
```

The Slack thread is the workflow state. Thread metadata records whether the request is waiting for clarification, currently in progress, or ready for follow-up changes on an existing PR.

## Repository Layout

```text
apps/
  slack-bot/        Vercel serverless Slack app
  claude-agent/     GitHub composite action that plans, edits, and opens PRs
  preview-deploy/   GitHub composite action for Vercel preview deploys
docs/
  SETUP.md          End-to-end installation guide
  SETUP.KO.md       Korean version of the setup guide
  ARCHITECTURE.md   Contributor-oriented workflow and state model
```

## Quick Start

Read the full guide first if you are setting this up for a real repository:

[docs/SETUP.md](docs/SETUP.md)

At a high level, setup has five parts:

1. Create a Slack App with slash commands, interactivity, event subscriptions, and a bot token.
2. Deploy `apps/slack-bot` to Vercel.
3. Point the Slack app at the target repository with `GITHUB_REPO=owner/repo`.
4. Add `claude-code.yml` and optional `preview.yml` workflows to the target repository.
5. Add the required Slack, GitHub, Anthropic, and optional Vercel secrets.

Required Slack app environment variables:

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

Run the Slack app locally with Vercel:

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
