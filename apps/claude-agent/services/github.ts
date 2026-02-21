import { execSync } from "child_process";
import type { ClientPayload, ExecuteResult, EnvConfig } from "../types.js";

export type PRCreationResult = {
  number: number;
  url: string;
};

/**
 * 새 PR을 생성합니다
 */
export async function createPullRequest(
  payload: ClientPayload,
  result: ExecuteResult,
  branch: string,
  env: EnvConfig,
): Promise<PRCreationResult> {
  // PR body 생성
  const body = buildPRBody(payload, result);

  // gh CLI로 PR 생성
  try {
    const output = execSync(
      `gh pr create --title "🤖 ${sanitize(result.pr_title)}" --body "${sanitize(body)}" --head "${branch}"`,
      { encoding: "utf-8", env: { ...process.env, GH_TOKEN: env.GITHUB_TOKEN } },
    );

    // PR URL 파싱
    const url = output.trim();
    const match = url.match(/\/pull\/(\d+)$/);
    const number = match ? parseInt(match[1], 10) : 0;

    return { number, url };
  } catch (error) {
    throw new Error(`Failed to create PR: ${error}`);
  }
}

/**
 * 기존 PR에 코멘트를 추가합니다
 */
export async function commentOnPR(
  payload: ClientPayload,
  result: ExecuteResult,
  env: EnvConfig,
): Promise<void> {
  const body = buildFollowUpComment(payload, result, env);

  try {
    execSync(
      `gh pr comment "${payload.pr_number}" --body "${sanitize(body)}"`,
      { encoding: "utf-8", env: { ...process.env, GH_TOKEN: env.GITHUB_TOKEN } },
    );
  } catch (error) {
    throw new Error(`Failed to comment on PR: ${error}`);
  }
}

/**
 * PR에 라벨을 추가합니다
 */
export async function addLabel(
  prNumber: number,
  label: string,
  env: EnvConfig,
): Promise<void> {
  try {
    execSync(
      `gh pr edit ${prNumber} --add-label "${label}"`,
      { encoding: "utf-8", env: { ...process.env, GH_TOKEN: env.PAT_TOKEN } },
    );
  } catch (error) {
    console.warn(`Failed to add label to PR: ${error}`);
    // 라벨 추가 실패는 치명적이지 않으므로 무시
  }
}

/**
 * PR body를 빌드합니다
 */
function buildPRBody(payload: ClientPayload, result: ExecuteResult): string {
  const filesFormatted = result.files_changed.map(f => `\`${f}\``).join(", ");

  return `## 📋 요약
${result.summary}

## ✅ 요구사항 체크리스트
${result.requirements_checklist}

## 📁 변경된 파일
${filesFormatted}

---

## 📝 원본 요청
> ${payload.prompt}

## 👤 요청자
${payload.requester}

<!-- slack_channel:${payload.slack_channel} -->
<!-- slack_thread:${payload.slack_thread_ts} -->`;
}

/**
 * Follow-up 코멘트를 빌드합니다
 */
function buildFollowUpComment(
  payload: ClientPayload,
  result: ExecuteResult,
  env: EnvConfig,
): string {
  const filesFormatted = result.files_changed.map(f => `\`${f}\``).join(", ");

  return `## 📝 추가 요청

> ${payload.prompt}

### 📋 변경 요약
${result.summary}

### 📁 변경된 파일
${filesFormatted}

---
**요청자**: ${payload.requester}
**작업 ID**: [\`${env.GITHUB_RUN_ID}\`](https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID})`;
}

/**
 * 문자열에서 쉘 이스케이프 처리
 */
function sanitize(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
}
