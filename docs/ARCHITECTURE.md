# Architecture

Ship From Slack has three runtime pieces: a Slack bot, a Claude Agent composite action, and an optional preview deployment action. The target repository owns the workflows that call those actions.

## Components

| Component | Path | Responsibility |
| --- | --- | --- |
| Slack Bot | `apps/slack-bot` | Receives Slack commands, opens the request modal, tracks thread state, and dispatches GitHub Actions |
| Claude Agent | `apps/claude-agent` | Plans the requested change, asks clarification questions when needed, edits code, commits, and creates or updates a PR |
| Preview Deploy | `apps/preview-deploy` | Deploys a Vercel preview for labeled PRs and posts the preview URL |
| Target repository workflows | `.github/workflows/*.yml` in the target repo | Connect repository events, secrets, and project code to the actions in this repository |

## Request Lifecycle

```text
1. User runs /request in Slack.
2. Slack Bot opens a modal and receives the request text.
3. Slack Bot sends repository_dispatch with client_payload.
4. Target repository runs claude-code.yml.
5. Claude Agent plans the change.
6. If the request is unclear, Claude Agent posts questions to the Slack thread.
7. User answers in the same thread by mentioning the bot.
8. Slack Bot dispatches the workflow again with clarification_history.
9. Claude Agent implements the change and opens or updates a PR.
10. Optional preview workflow deploys a Vercel preview and reports the URL.
```

## Slack Thread State

The system uses the Slack thread as the state store. There is no database. Bot messages include Slack metadata, and the bot scans the thread from newest to oldest to find the current state.

| State | Meaning | Stored metadata |
| --- | --- | --- |
| `pending_question` | The agent needs more information before editing | Original prompt, questions, clarification history, branch, PR number |
| `question_answered` | The user answered and the workflow is running again | Marker that prevents duplicate follow-up handling while work is in progress |
| `pr_ready` | A PR exists and the thread can accept follow-up requests | PR number and branch |
| `in_progress` | No terminal state is available yet | Fallback when no newer actionable state is found |

The newest metadata wins. This matters because one thread can move from `pending_question` to `pr_ready`; scanning from oldest to newest would incorrectly treat old questions as still active.

## Client Payload

The Slack Bot sends a `client_payload` to GitHub Actions. The Claude Agent reads it from `CLIENT_PAYLOAD`.

```ts
type ClientPayload = {
  prompt: string;
  requester: string;
  slack_channel: string;
  slack_thread_ts: string;
  clarification_history?: ClarificationEntry[];
  is_followup?: boolean;
  branch?: string;
  pr_number?: string;
};

type ClarificationEntry = {
  questions: string[];
  answer: string;
};
```

For a first request, the payload contains the prompt, requester, channel, and thread timestamp. For a clarification answer, the original prompt is preserved and the answer is appended to `clarification_history`. For a follow-up request after a PR exists, `is_followup`, `branch`, and `pr_number` tell the agent to commit to the existing branch instead of opening a new PR.

## Planning And Execution

The Claude Agent runs in two phases.

| Phase | Main files | Behavior |
| --- | --- | --- |
| Plan | `apps/claude-agent/phases/plan.ts`, `apps/claude-agent/prompts/plan-prompt.ts` | Decide whether the request is clear enough; write a plan or return clarification questions |
| Execute | `apps/claude-agent/phases/execute.ts`, `apps/claude-agent/prompts/execute-prompt.ts` | Apply the plan, commit changes, push, and create or update a PR |

Clarification is limited so the workflow does not loop indefinitely. After the limit is reached, the agent proceeds with reasonable assumptions and records those assumptions in the plan.

## Pull Requests And Follow-Ups

For a new request, the agent creates a branch and opens a PR. The Slack notification stores `pr_ready` metadata with the PR number and branch.

For a follow-up, the Slack Bot recovers the PR number and branch from thread metadata, then dispatches another run. The agent inspects the existing branch before planning the new change, commits to the same branch, and comments on the same PR.

## Preview Deployment

Preview deployment is optional. If the target repository includes the preview workflow, the agent adds a `deploy-preview` label after creating a PR. The preview workflow deploys to Vercel, comments on the PR, and posts the preview URL to the Slack thread when Slack metadata is available in the PR body.

## Contributor Notes

Keep behavior changes synchronized across code and docs. Update [SETUP.md](SETUP.md) when environment variables, secrets, workflow YAML, or install steps change. Update this file when payload shape, thread state, action boundaries, or follow-up behavior changes.
