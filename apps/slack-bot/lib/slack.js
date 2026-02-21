// apps/slack-bot/lib/slack.js
import crypto from 'crypto';

/**
 * Raw body 읽기 (Vercel bodyParser 비활성화 시)
 */
export async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString();
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', reject);
  });
}

/**
 * Slack 요청 서명 검증 (HMAC-SHA256)
 */
export function verifySlackSignature(req, body) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const timestamp = req.headers['x-slack-request-timestamp'];
  const slackSignature = req.headers['x-slack-signature'];

  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - timestamp) > 60 * 5) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBasestring).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
}

/**
 * Slack 채널에 메시지 전송
 *
 * @param {string} channelId - Slack 채널 ID
 * @param {string} threadTs - 쓰레드 타임스탬프
 * @param {string} text - 메시지 텍스트
 * @param {Array} blocks - Slack Block Kit 블록 배열
 * @param {Object} [metadata] - 메시지 메타데이터 (선택적)
 * @param {string} metadata.event_type - 이벤트 타입
 * @param {Object} metadata.event_payload - 이벤트 페이로드
 * @returns {Promise<Object>} - Slack API 응답
 */
export async function postMessage(channelId, threadTs, text, blocks, metadata) {
  const body = {
    channel: channelId,
    thread_ts: threadTs,
    text,
    blocks,
  };

  if (metadata) {
    body.metadata = metadata;
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!result.ok) {
    throw new Error(`Failed to post message: ${result.error}`);
  }

  return result;
}

/**
 * Slack 채널에 "요청 접수" 메시지 전송
 *
 * @returns {string} thread_ts - 생성된 메시지의 timestamp (쓰레드 앵커)
 */
export async function postRequestMessage(channelId, userName, requestContent) {
  const MAX_CONTENT_LENGTH = 2500;
  const truncatedContent =
    requestContent.length > MAX_CONTENT_LENGTH
      ? requestContent.slice(0, MAX_CONTENT_LENGTH) +
        '...\n\n_(내용이 길어 생략되었습니다. 전체 내용은 작업에 반영됩니다.)_'
      : requestContent;

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      channel: channelId,
      text: '요청이 접수되었습니다.',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*요청이 접수되었습니다.*\n\n*요청자:* <@${userName}>\n*내용:* ${truncatedContent}`,
          },
        },
      ],
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    throw new Error(`Failed to post message: ${result.error}`);
  }

  return result.ts;
}

/**
 * 쓰레드 메시지에서 메타데이터 검색 (역순 스캔)
 *
 * 반환 타입:
 * - { type: 'pr_ready', pr_number, branch }      - PR 생성 완료 상태
 * - { type: 'pending_question', original_payload } - 질문 대기 상태
 * - { type: 'in_progress' }                        - 아직 작업 중
 *
 * 역순 스캔 이유:
 * 하나의 쓰레드에서 pending_question → pr_ready 순서로 상태가 변할 수 있음.
 * 가장 최신 메시지부터 스캔해야 현재 상태를 정확히 반영.
 *
 * 예: [질문 메시지(과거)] → [PR 생성(최신)]
 *     역순 스캔 시 PR 생성을 먼저 발견 → pr_ready 반환 (올바름)
 *     정순 스캔 시 질문 메시지를 먼저 발견 → pending_question 반환 (잘못됨)
 */
export async function findMetadataInThread(channelId, threadTs) {
  const response = await fetch(
    `https://slack.com/api/conversations.replies?channel=${channelId}&ts=${threadTs}&include_all_metadata=true`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
    }
  );

  const result = await response.json();

  if (!result.ok) {
    throw new Error(`Failed to fetch thread messages: ${result.error}`);
  }

  const messages = result.messages;

  // 역순 스캔 - 최신 상태가 현재 상태
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];

    // Slack metadata 기반 상태 판별
    if (message.metadata?.event_type) {
      const eventType = message.metadata.event_type;
      console.log('Found Slack metadata:', eventType);

      // 1. PR 생성 완료 상태
      if (eventType === 'pr_ready') {
        const { pr_number, branch } = message.metadata.event_payload;
        console.log('Found PR ready:', { pr_number, branch });
        return { type: 'pr_ready', pr_number, branch };
      }

      // 2. 질문 답변 완료 (답변 처리 후 ~ PR 완료 전 구간)
      if (eventType === 'question_answered') {
        console.log('Question answered, treating as in_progress');
        return { type: 'in_progress' };
      }

      // 3. 질문 대기 상태
      if (eventType === 'pending_question') {
        console.log('Found pending question with payload');
        return {
          type: 'pending_question',
          payload: message.metadata.event_payload, // 원문 그대로 반환
        };
      }
    }
  }

  // 4. 아직 작업 중
  console.log('No metadata found in thread, status: in_progress');
  return { type: 'in_progress' };
}
