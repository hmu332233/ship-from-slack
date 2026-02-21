import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildExecuteSystemPrompt, buildExecuteUserPrompt } from "../prompts/execute-prompt.js";
export async function runExecute(env) {
    const systemPrompt = buildExecuteSystemPrompt();
    const prompt = buildExecuteUserPrompt();
    for await (const message of query({
        prompt,
        options: {
            systemPrompt,
            cwd: process.env.GITHUB_WORKSPACE || process.cwd(),
            model: "claude-sonnet-4-20250514",
            maxTurns: 50,
            allowedTools: ["Edit", "Write", "Read", "Bash", "Glob", "Grep", "TodoWrite"],
            permissionMode: "acceptEdits",
            settingSources: ["project"],
            outputFormat: {
                type: "json_schema",
                schema: {
                    type: "object",
                    properties: {
                        pr_title: { type: "string" },
                        pr_type: { type: "string", enum: ["feat", "fix", "refactor", "style", "docs", "chore"] },
                        pr_scope: { type: "string" },
                        summary: { type: "string" },
                        requirements_checklist: { type: "string" },
                        files_changed: { type: "array", items: { type: "string" } }
                    },
                    required: ["pr_title", "pr_type", "pr_scope", "summary", "requirements_checklist", "files_changed"]
                }
            }
        },
    })) {
        // 디버깅: 모든 메시지 출력
        console.log("[Execute Debug] Message:", JSON.stringify(message, null, 2));
        if (message.type === "result") {
            if (message.subtype === "success") {
                // Cost 정보 추출
                const cost = {
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
                return parseExecuteResult(message.structured_output, cost);
            }
            else {
                throw new Error(`Execute failed: ${message.subtype}, errors: ${message.errors?.join(", ")}`);
            }
        }
    }
    throw new Error("Execute phase completed without result");
}
function parseExecuteResult(raw, cost) {
    if (!raw || typeof raw !== "object") {
        throw new Error("Invalid execute result: not an object");
    }
    const result = raw;
    return {
        pr_title: String(result.pr_title || ""),
        pr_type: result.pr_type,
        pr_scope: String(result.pr_scope || ""),
        summary: String(result.summary || ""),
        requirements_checklist: String(result.requirements_checklist || ""),
        files_changed: Array.isArray(result.files_changed) ? result.files_changed.map(String) : [],
        cost,
    };
}
