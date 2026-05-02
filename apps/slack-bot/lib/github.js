// apps/slack-bot/lib/github.js

/**
 * GitHub repository_dispatch 트리거
 */
export async function triggerGitHubAction(payload) {
  const [owner, repo] = process.env.GITHUB_REPO.split('/');

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
        event_type: 'claude-code-request',
        client_payload: payload,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to trigger GitHub Action: ${error}`);
  }
}
