# Contributing

Thanks for helping improve Ship From Slack. This project is small enough that the best contributions are usually focused: one bug fix, one workflow improvement, one documentation improvement, or one behavior change at a time.

## Project Structure

```text
apps/slack-bot/        Slack App endpoints for Vercel
apps/claude-agent/     GitHub composite action that plans and implements changes
apps/preview-deploy/   GitHub composite action for Vercel previews
docs/                  Setup and architecture documentation
```

Start with [README.md](README.md), then read [docs/SETUP.md](docs/SETUP.md) if your change affects installation or [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) if it affects request flow, payloads, or thread state.

## Local Setup

Install dependencies from the workspace root.

```sh
pnpm install
```

Run the Slack bot locally with Vercel.

```sh
cd apps/slack-bot
cp .env.example .env
pnpm exec vercel dev
```

Type-check the Claude Agent.

```sh
pnpm --filter claude-agent typecheck
```

Build the Claude Agent when changing TypeScript used by the composite action.

```sh
pnpm --filter claude-agent build
```

## Environment Files

Use `.env.example` files as templates. Do not commit real tokens, workspace IDs, repository secrets, or generated local environment files.

## Documentation Expectations

Update documentation in the same PR when a change affects setup, required secrets, Slack App scopes, workflow YAML, action inputs, payload shape, or user-visible behavior.

Documentation should stay contributor-friendly:

- README explains what the project is and where to go next.
- `docs/SETUP.md` is the single end-to-end installation guide.
- `docs/ARCHITECTURE.md` explains internals needed for code changes.
- Avoid duplicating long workflow examples across multiple documents.

## Pull Request Checklist

Before opening a PR, check the relevant items.

- The change is scoped and described clearly.
- `pnpm --filter claude-agent typecheck` passes when agent code changed.
- `pnpm --filter claude-agent build` was run when composite action TypeScript changed.
- Setup docs were updated when environment variables, secrets, scopes, or workflow YAML changed.
- Architecture docs were updated when payloads, Slack thread state, or follow-up behavior changed.
- New docs link from README or an existing docs page when they are part of the public documentation set.

## Reporting Issues

When reporting a setup or workflow issue, include the failing stage, relevant logs with secrets removed, the target repository workflow snippet, and whether the failure happened in Slack, Vercel, GitHub Actions, PR creation, or preview deployment.
