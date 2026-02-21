import type { ClientPayload, ExecuteResult, EnvConfig, PlanResult } from "../types.js";
import type { PRCreationResult } from "./github.js";

/**
 * Clarification 질문을 Slack에 전송합니다
 */
export async function sendClarificationToSlack(
  questions: string[],
  payload: ClientPayload,
  env: EnvConfig,
): Promise<void> {
  const questionsFormatted = questions.map(q => `• ${q}`).join("\n");

  const questionText = `*확인이 필요한 사항이 있습니다.*\n\n${questionsFormatted}`;

  const slackPayload = {
    channel: payload.slack_channel,
    thread_ts: payload.slack_thread_ts,
    text: "확인이 필요한 사항이 있습니다.",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: questionText },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "답변을 주시면 작업을 진행하겠습니다." }],
      },
    ],
    metadata: {
      event_type: "pending_question",
      event_payload: {
        // 각 필드를 직접 저장 (base64 인코딩 불필요)
        prompt: payload.prompt,
        clarification_history: JSON.stringify(payload.clarification_history || []),
        questions: JSON.stringify(questions),
        is_followup: String(payload.is_followup || false),
        branch: payload.branch || "",
        pr_number: payload.pr_number || "",
      },
    },
  };

  await postSlackMessage(slackPayload, env.SLACK_BOT_TOKEN);
}

/**
 * PR 생성 알림을 Slack에 전송합니다
 */
export async function notifyPRCreated(
  payload: ClientPayload,
  result: ExecuteResult,
  prResult: PRCreationResult,
  branch: string,
  env: EnvConfig,
): Promise<void> {
  const mrkdwnText = `*PR이 생성되었습니다.*

<${prResult.url}|#${prResult.number} ${result.pr_title}>

Preview 배포가 진행 중입니다. 잠시만 기다려 주세요.

PR: ${prResult.number} | Branch: ${branch}`;

  const slackPayload = {
    channel: payload.slack_channel,
    thread_ts: payload.slack_thread_ts,
    text: "PR이 생성되었습니다.",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: mrkdwnText },
      },
    ],
    metadata: {
      event_type: "pr_ready",
      event_payload: {
        pr_number: String(prResult.number),
        branch: branch,
      },
    },
  };

  await postSlackMessage(slackPayload, env.SLACK_BOT_TOKEN);
}

/**
 * Follow-up 완료 알림을 Slack에 전송합니다
 */
export async function notifyFollowUpCompleted(
  payload: ClientPayload,
  result: ExecuteResult,
  env: EnvConfig,
): Promise<void> {
  const prUrl = `https://github.com/${env.GITHUB_REPOSITORY}/pull/${payload.pr_number}`;

  const mrkdwnText = `*추가 작업이 완료되었습니다.*

<${prUrl}|#${payload.pr_number} ${result.pr_title}>

Preview 배포가 진행 중입니다. 잠시만 기다려 주세요.

PR: ${payload.pr_number} | Branch: ${payload.branch}`;

  const slackPayload = {
    channel: payload.slack_channel,
    thread_ts: payload.slack_thread_ts,
    text: "추가 작업이 완료되었습니다.",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: mrkdwnText },
      },
    ],
    metadata: {
      event_type: "pr_ready",
      event_payload: {
        pr_number: String(payload.pr_number),
        branch: String(payload.branch),
      },
    },
  };

  await postSlackMessage(slackPayload, env.SLACK_BOT_TOKEN);
}

/**
 * 에러 알림을 Slack에 전송합니다
 */
export async function notifyError(
  payload: ClientPayload,
  error: Error,
  env: EnvConfig,
): Promise<void> {
  const mrkdwnText = `*작업 중 오류가 발생했습니다.*

요청하신 작업을 처리하는 과정에서 에러가 발생했습니다.

**에러 메시지**: ${error.message}

[GitHub Actions 로그 확인](https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID})`;

  const slackPayload = {
    channel: payload.slack_channel,
    thread_ts: payload.slack_thread_ts,
    text: "작업 중 오류가 발생했습니다.",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: mrkdwnText },
      },
    ],
  };

  try {
    await postSlackMessage(slackPayload, env.SLACK_BOT_TOKEN);
  } catch (slackError) {
    console.error("Failed to send error notification to Slack:", slackError);
    // Slack 알림 실패는 무시 (이미 에러 상태이므로)
  }
}

/**
 * Slack 메시지를 전송하는 공통 함수
 */
async function postSlackMessage(payload: any, token: string): Promise<void> {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json() as { ok: boolean; error?: string };
  if (!result.ok) {
    throw new Error(`Slack API error: ${result.error}`);
  }
}
