// apps/slack-bot/api/slack/commands.js
import { getRawBody, verifySlackSignature } from '../../lib/slack.js';

export const config = {
  api: { bodyParser: false },
};

/**
 * 모달 JSON 생성
 *
 * 대화형 요청 모드:
 * - 대화형 모드 안내 문구 포함
 * - 체크박스 없이 추가 질문 흐름을 기본 제공
 */
function createModal(triggerId) {
  return {
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: 'request_modal',
      title: {
        type: 'plain_text',
        text: '코드 수정 요청',
      },
      submit: {
        type: 'plain_text',
        text: '요청하기',
      },
      close: {
        type: 'plain_text',
        text: '취소',
      },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*요청 예시*\n• 버튼 색상을 파란색으로 변경해주세요\n• 헤더 타이틀을 "시작하기"로 수정해주세요\n• Footer에 이메일 문의 링크를 추가해주세요',
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '_대화형 모드: 정보가 부족한 경우 봇이 추가 질문을 드립니다._',
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'input',
          block_id: 'request_input',
          element: {
            type: 'plain_text_input',
            action_id: 'request_content',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: '수정할 내용을 입력해 주세요',
            },
          },
          label: {
            type: 'plain_text',
            text: '수정 요청 내용',
          },
        },
      ],
    },
  };
}

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
    const { trigger_id, channel_id, user_id, user_name } = parsedBody;

    const modalPayload = createModal(trigger_id);

    modalPayload.view.private_metadata = JSON.stringify({
      channel_id,
      user_id,
      user_name,
    });

    const response = await fetch('https://slack.com/api/views.open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify(modalPayload),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Failed to open modal:', result);
      return res.status(500).json({ error: 'Failed to open modal' });
    }

    return res.status(200).send('');
  } catch (error) {
    console.error('Error handling slash command:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
