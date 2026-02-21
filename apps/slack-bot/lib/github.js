// apps/slack-bot/lib/github.js

/**
 * GitHub repository_dispatch 트리거
 *
 * 환경 변수 WORKFLOW_VERSION으로 v2/v3 전환 제어:
 * - WORKFLOW_VERSION=v3 → claude-code-request-v3 (SDK 기반)
 * - 기본값 또는 WORKFLOW_VERSION=v2 → claude-code-request-v2 (YAML 기반)
 */
export async function triggerGitHubAction(payload) {
  const [owner, repo] = process.env.GITHUB_REPO.split('/');

  // 환경 변수로 v2/v3 전환 제어
  const eventType = process.env.WORKFLOW_VERSION === 'v3'
    ? 'claude-code-request-v3'
    : 'claude-code-request-v2';

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: payload,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to trigger GitHub Action: ${error}`);
  }
}
