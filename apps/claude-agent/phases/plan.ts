import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ClientPayload, PlanResult, PlanOutput, CostInfo } from "../types.js";
import { buildPlanSystemPrompt, buildPlanUserPrompt } from "../prompts/plan-prompt.js";

export async function runPlan(payload: ClientPayload): Promise<PlanResult> {
  const systemPrompt = buildPlanSystemPrompt(
    payload.clarification_history?.length || 0,
    payload.is_followup || false
  );
  const prompt = buildPlanUserPrompt(payload);

  let sessionId = "";

  for await (const message of query({
    prompt,
    options: {
      systemPrompt,
      cwd: process.env.GITHUB_WORKSPACE || process.cwd(),
      // model: "claude-opus-4-20250514",
      model: "claude-sonnet-4-20250514",
      maxTurns: 50,
      allowedTools: ["Read", "Glob", "Grep", "Write", "Bash"],
      permissionMode: "acceptEdits",
      settingSources: ["project"],  // CLAUDE.md 로드
      outputFormat: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            needs_clarification: { type: "boolean" },
            questions: { type: "array", items: { type: "string" } },
            plan_written: { type: "boolean" }
          },
          required: ["needs_clarification", "questions", "plan_written"]
        }
      }
    },
  })) {
    // 디버깅: 모든 메시지 출력
    console.log("[Plan Debug] Message:", JSON.stringify(message, null, 2));
    
    // 세션 ID 캡처 (로깅용)
    if (message.type === "system" && message.subtype === "init") {
      sessionId = message.session_id;
    }

    // 결과 처리
    if (message.type === "result") {
      if (message.subtype === "success") {
        const output = message.structured_output as PlanOutput;
        
        // Cost 정보 추출
        const cost: CostInfo = {
          totalCostUsd: message.total_cost_usd,
          durationMs: message.duration_ms,
          durationApiMs: message.duration_api_ms,
          numTurns: message.num_turns,
          usage: {
            inputTokens: message.usage.inputTokens,
            outputTokens: message.usage.outputTokens,
            cacheReadInputTokens: message.usage.cacheReadInputTokens,
            cacheCreationInputTokens: message.usage.cacheCreationInputTokens,
          },
          modelUsage: message.modelUsage,
        };
        
        if (output.needs_clarification) {
          return {
            needsClarification: true,
            questions: output.questions,
            sessionId,
            cost,
          };
        }

        return {
          needsClarification: false,
          sessionId,
          cost,
        };
      } else {
        // 에러 처리
        throw new Error(`Plan failed: ${message.subtype}, errors: ${message.errors?.join(", ")}`);
      }
    }
  }

  throw new Error("Plan phase completed without result");
}
