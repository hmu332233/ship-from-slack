import { parseClientPayload, getEnvConfig } from "./types.js";
import { runPlan } from "./phases/plan.js";
import { runExecute } from "./phases/execute.js";
import { sendClarificationToSlack, notifyPRCreated, notifyFollowUpCompleted, notifyError } from "./services/slack.js";
import { createPullRequest, commentOnPR, addLabel } from "./services/github.js";
import { commitChanges, pushBranch, setRemoteAuth, createBranch, hasChanges } from "./services/git.js";
import { appendFileSync } from "fs";

async function main() {
  const env = getEnvConfig();
  const payload = parseClientPayload(env.CLIENT_PAYLOAD);

  try {
    // ========================================
    // Phase 1: Plan (Opus)
    // ========================================
    console.log("[v3] Starting Plan phase...");
    const planResult = await runPlan(payload);

    // ========================================
    // Clarification 분기
    // ========================================
    if (planResult.needsClarification) {
      console.log("[v3] Clarification needed, sending questions to Slack");
      await sendClarificationToSlack(planResult.questions!, payload, env);
      return; // 워크플로우 종료
    }

    // ========================================
    // Phase 2: Execute (Sonnet)
    // ========================================
    console.log("[v3] Starting Execute phase...");
    const executeResult = await runExecute(env);

    // ========================================
    // Cost 집계 및 GitHub Output 출력
    // ========================================
    const planCost = planResult.cost?.totalCostUsd || 0;
    const executeCost = executeResult.cost?.totalCostUsd || 0;
    const totalCost = planCost + executeCost;
    
    const planTurns = planResult.cost?.numTurns || 0;
    const executeTurns = executeResult.cost?.numTurns || 0;
    
    const planInputTokens = planResult.cost?.usage.inputTokens || 0;
    const planOutputTokens = planResult.cost?.usage.outputTokens || 0;
    const executeInputTokens = executeResult.cost?.usage.inputTokens || 0;
    const executeOutputTokens = executeResult.cost?.usage.outputTokens || 0;

    console.log(`[v3] Cost Summary:`);
    console.log(`  Plan: $${planCost.toFixed(4)} (${planTurns} turns)`);
    console.log(`  Execute: $${executeCost.toFixed(4)} (${executeTurns} turns)`);
    console.log(`  Total: $${totalCost.toFixed(4)}`);

    // GitHub Action Output으로 전달
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `plan_cost=${planCost}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `execute_cost=${executeCost}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `total_cost=${totalCost}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `plan_turns=${planTurns}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `execute_turns=${executeTurns}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `plan_input_tokens=${planInputTokens}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `plan_output_tokens=${planOutputTokens}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `execute_input_tokens=${executeInputTokens}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `execute_output_tokens=${executeOutputTokens}\n`);
    }

    // ========================================
    // Phase 3: Git + PR
    // ========================================
    console.log("[v3] Creating PR...");
    await setRemoteAuth(env);

    if (payload.is_followup) {
      // Follow-up: 기존 브랜치에 push
      if (hasChanges()) {
        const model = Object.keys(executeResult.cost?.modelUsage || {})[0] || "claude";
        await commitChanges(executeResult.pr_title, model);
        await pushBranch(payload.branch!);
      }
      await commentOnPR(payload, executeResult, env);
      await notifyFollowUpCompleted(payload, executeResult, env);
    } else {
      // 새 PR: 브랜치 생성 및 push
      const branch = payload.branch || `claude-code/${env.GITHUB_RUN_ID}`;
      await createBranch(branch);
      if (!hasChanges()) {
        throw new Error("Execute 단계에서 파일 변경사항이 없습니다.");
      }
      const model = Object.keys(executeResult.cost?.modelUsage || {})[0] || "claude";
      await commitChanges(executeResult.pr_title, model);
      await pushBranch(branch);
      const prResult = await createPullRequest(payload, executeResult, branch, env);
      await addLabel(prResult.number, "deploy-preview", env);
      await notifyPRCreated(payload, executeResult, prResult, branch, env);
    }

    console.log("[v3] Done!");
  } catch (error) {
    // ========================================
    // 단계별 에러 핸들링
    // ========================================
    console.error("[v3] Error:", error);
    await notifyError(payload, error as Error, env);
    process.exit(1);
  }
}

main();
