/** Clarification Q&A 단일 엔트리 */
export type ClarificationEntry = {
  questions: string[];
  answer: string;
};

/** Slack bot에서 repository_dispatch로 전달되는 payload */
export type ClientPayload = {
  prompt: string;                                // 원본 요청
  clarification_history?: ClarificationEntry[];  // Q&A 이력
  requester: string;
  slack_channel: string;
  slack_thread_ts: string;
  is_followup?: boolean;
  branch?: string;
  pr_number?: string;
};

/** Cost 정보 */
export type CostInfo = {
  totalCostUsd: number;
  durationMs: number;
  durationApiMs: number;
  numTurns: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
  modelUsage: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costUSD: number;
  }>;
};

/** Plan 단계의 structured output (SDK 응답) */
export type PlanOutput = {
  needs_clarification: boolean;
  questions: string[];
  plan_written: boolean;
};

/** Plan 단계 결과 (내부 사용) */
export type PlanResult = {
  needsClarification: boolean;
  questions?: string[];       // clarification이 필요한 경우
  sessionId?: string;         // 세션 ID (로깅용)
  cost?: CostInfo;            // Cost 정보
};

/** PR 타입 (union type) */
export type PRType = "feat" | "fix" | "refactor" | "style" | "docs" | "chore";

/** Execute 단계의 structured output */
export type ExecuteResult = {
  pr_title: string;
  pr_type: PRType;
  pr_scope: string;
  summary: string;
  requirements_checklist: string;
  files_changed: string[];
  cost?: CostInfo;            // Cost 정보
};

/** 환경 변수 */
export type EnvConfig = {
  ANTHROPIC_API_KEY: string;
  CLIENT_PAYLOAD: string;
  SLACK_BOT_TOKEN: string;
  GITHUB_TOKEN: string;
  PAT_TOKEN: string;
  GITHUB_REPOSITORY: string;
  GITHUB_RUN_ID: string;
};

/** 환경 변수 파싱 */
export function getEnvConfig(): EnvConfig {
  const required = [
    "ANTHROPIC_API_KEY",
    "CLIENT_PAYLOAD",
    "SLACK_BOT_TOKEN",
    "GITHUB_TOKEN",
    "PAT_TOKEN",
    "GITHUB_REPOSITORY",
    "GITHUB_RUN_ID",
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return process.env as unknown as EnvConfig;
}

/** Client payload 파싱 */
export function parseClientPayload(json: string): ClientPayload {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`Failed to parse CLIENT_PAYLOAD: ${error}`);
  }
}
