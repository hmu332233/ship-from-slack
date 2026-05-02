// apps/slack-bot/api/slack/events.js
import { getRawBody, verifySlackSignature, findMetadataInThread, postMessage } from '../../lib/slack.js';
import { triggerGitHubAction } from '../../lib/github.js';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 에러 핸들러용 - try 바깥에 선언
  let parsedEvent = null;

  try {
    const rawBody = await getRawBody(req);
    const body = JSON.parse(rawBody);

    // URL verification challenge
    if (body.type === 'url_verification') {
      return res.status(200).json({ challenge: body.challenge });
    }

    // 서명 검증
    if (!verifySlackSignature(req, rawBody)) {
      console.error('Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 이벤트 필터링
    const eventType = body.event?.type;
    const channelType = body.event?.channel_type;
    const isAppMention = eventType === 'app_mention';
    const isDM = eventType === 'message' && channelType === 'im';

    if (body.type !== 'event_callback' || (!isAppMention && !isDM)) {
      return res.status(200).send('');
    }

    if (
      body.event.bot_id ||
      body.event.subtype === 'bot_message' ||
      (body.event.subtype && body.event.subtype !== 'file_share')
    ) {
      return res.status(200).send('');
    }

    const event = body.event;
    parsedEvent = event;
    const { channel, thread_ts, ts, text, user } = event;

    console.log('[slack-bot] Received event:', {
      type: eventType,
      channel,
      thread_ts,
      ts,
      user,
      text: text.substring(0, 100),
    });

    // 쓰레드 외부 멘션 체크
    if (!thread_ts) {
      await postMessage(channel, ts, '추가 요청은 기존 스레드에서 멘션해 주세요.', [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*추가 요청은 기존 스레드에서 멘션해 주세요.*\n\n새로운 요청은 `/request` 명령어를 이용해 주세요.',
          },
        },
      ]);
      return res.status(200).send('');
    }

    // 멘션 제거 후 요청 내용 추출
    const mentionPattern = /<@[A-Z0-9]+>/g;
    const requestContent = text.replace(mentionPattern, '').trim();

    // 쓰레드 메타데이터 조회 (역순 스캔)
    const metadata = await findMetadataInThread(channel, thread_ts);

    console.log('[slack-bot] Thread metadata:', metadata.type);

    switch (metadata.type) {
      // ===== 질문에 대한 답변 처리 =====
      case 'pending_question': {
        if (!requestContent) {
          await postMessage(channel, thread_ts, '답변 내용이 비어 있습니다.', [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*답변 내용이 비어 있습니다.*\n\n위 질문에 대한 답변을 입력해 주세요.',
              },
            },
          ]);
          return res.status(200).send('');
        }

        // 원본 payload 복원 (event_payload에서 직접 읽기)
        const rawPayload = metadata.payload;
        const originalPayload = {
          prompt: rawPayload.prompt,
          clarification_history: JSON.parse(rawPayload.clarification_history || '[]'),
          questions: JSON.parse(rawPayload.questions || '[]'),
          is_followup: rawPayload.is_followup === 'true',
          branch: rawPayload.branch,
          pr_number: rawPayload.pr_number,
        };

        // 답변 확인 메시지 (question_answered metadata 포함)
        await postMessage(
          channel,
          thread_ts,
          '답변 확인되었습니다. 작업을 시작합니다.',
          [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*답변 확인되었습니다.*\n\n*답변:* ${requestContent}\n\n작업을 시작합니다.`,
              },
            },
          ],
          {
            event_type: 'question_answered',
            event_payload: {},
          }
        );

        // 기존 clarification history 복원 또는 새로 생성
        const existingHistory = originalPayload.clarification_history || [];
        const hasQuestions = originalPayload.questions && originalPayload.questions.length > 0;
        
        // 새로운 Q&A 엔트리 추가
        const newEntry = hasQuestions
          ? {
              questions: originalPayload.questions,
              answer: requestContent,
            }
          : null;
        
        const updatedHistory = newEntry 
          ? [...existingHistory, newEntry]
          : existingHistory;

        const payload = {
          prompt: originalPayload.prompt,  // 원본 요청 유지
          clarification_history: updatedHistory,
          requester: user,
          slack_channel: channel,
          slack_thread_ts: thread_ts,
          // 원본 payload에서 follow-up 정보 복원
          is_followup: originalPayload.is_followup || false,
          branch: originalPayload.branch || undefined,
          pr_number: originalPayload.pr_number || undefined,
        };

        console.log('[slack-bot] Triggering with clarified prompt:', JSON.stringify(payload, null, 2));
        await triggerGitHubAction(payload);
        break;
      }

      // ===== 추가 요청 (PR 완료 후) =====
      case 'pr_ready': {
        if (!requestContent) {
          await postMessage(channel, thread_ts, '요청 내용이 비어 있습니다.', [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*요청 내용이 비어 있습니다.*\n\n예: `@봇 버튼 색상을 파란색으로 변경해주세요`',
              },
            },
          ]);
          return res.status(200).send('');
        }

        await postMessage(channel, thread_ts, '추가 요청이 접수되었습니다.', [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*추가 요청이 접수되었습니다.*\n\n*내용:* ${requestContent}\n\n작업을 진행합니다.`,
            },
          },
        ]);

        const payload = {
          prompt: requestContent,
          requester: user,
          slack_channel: channel,
          slack_thread_ts: thread_ts,
          branch: metadata.branch,
          pr_number: metadata.pr_number,
          is_followup: true,
        };

        console.log('[slack-bot] Triggering follow-up:', JSON.stringify(payload, null, 2));
        await triggerGitHubAction(payload);
        break;
      }

      // ===== 아직 작업 중 =====
      case 'in_progress': {
        await postMessage(channel, thread_ts, '현재 작업이 진행 중입니다.', [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*현재 작업이 진행 중입니다.*\n\n완료 후 안내드리겠습니다. 잠시만 기다려 주세요.',
            },
          },
        ]);
        break;
      }

      default:
        console.log('[slack-bot] Unexpected metadata type:', metadata.type);
        break;
    }

    return res.status(200).send('');
  } catch (error) {
    console.error('Error handling event:', error);

    if (parsedEvent?.channel) {
      try {
        await postMessage(
          parsedEvent.channel,
          parsedEvent.thread_ts || parsedEvent.ts,
          '처리 중 오류가 발생했습니다.',
          [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*처리 중 오류가 발생했습니다.*\n\n번거로우시겠지만 다시 요청해 주세요.',
              },
            },
          ]
        );
      } catch (notifyError) {
        console.error('Failed to send error notification:', notifyError);
      }
    }

    return res.status(200).send('');
  }
}
