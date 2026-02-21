// apps/slack-bot/api/slack/interactions.js
import { getRawBody, verifySlackSignature, postRequestMessage } from '../../lib/slack.js';
import { triggerGitHubAction } from '../../lib/github.js';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawBody = await getRawBody(req);

    if (!verifySlackSignature(req, rawBody)) {
      console.error('Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const parsedBody = Object.fromEntries(new URLSearchParams(rawBody));
    const payload = JSON.parse(parsedBody.payload);

    if (payload.type !== 'view_submission') {
      return res.status(200).send('');
    }

    const { view, user } = payload;
    const privateMetadata = JSON.parse(view.private_metadata);
    const requestContent = view.state.values.request_input.request_content.value;
    const { channel_id, user_name } = privateMetadata;

    console.log('[v2] Processing request:', {
      user: user_name,
      channel: channel_id,
      content: requestContent.substring(0, 100),
    });

    // "요청 접수" 메시지 전송 (thread_ts 획득)
    const threadTs = await postRequestMessage(channel_id, user_name, requestContent);

    // GitHub Actions 트리거 (v2 워크플로우)
    const githubPayload = {
      prompt: requestContent,
      requester: user_name,
      slack_channel: channel_id,
      slack_thread_ts: threadTs,
    };

    console.log('[v2] Triggering GitHub Action:', JSON.stringify(githubPayload, null, 2));

    await triggerGitHubAction(githubPayload);

    return res.status(200).send('');
  } catch (error) {
    console.error('Error handling interaction:', error);
    return res.status(200).json({
      response_action: 'errors',
      errors: {
        request_input: '처리 중 오류가 발생했습니다. 다시 시도해 주세요.',
      },
    });
  }
}
