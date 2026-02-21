/**
 * Execute 단계의 시스템 프롬프트를 빌드합니다.
 * 에이전트의 역할과 구현 지침을 정의합니다.
 */
export function buildExecuteSystemPrompt() {
    return EXECUTE_INSTRUCTION;
}
/**
 * Execute 단계의 유저 프롬프트를 빌드합니다.
 * plan.md를 읽고 구현을 시작하도록 트리거합니다.
 */
export function buildExecuteUserPrompt() {
    return "`.claude/plan.md`를 읽고 계획대로 구현을 시작하세요.";
}
const EXECUTE_INSTRUCTION = `## Execute Phase Instructions

**IMPORTANT: Do NOT ask the user any questions during this phase. All necessary information is already included in the plan.md file. 
If anything is unclear, make your best judgment based on what's specified in the plan and proceed with implementation.**

1. Read the \`.claude/plan.md\` file and implement according to the plan
2. NEVER use git commands (git add, git commit, git push, etc.) - the system will handle commits automatically

### Structured Output

After completing the work, return the following information as structured output:

- \`pr_title\` (string): PR title (format: type(scope): description)
- \`pr_type\` (string): PR type (one of: feat, fix, refactor, style, docs, chore)
- \`pr_scope\` (string): PR scope
- \`summary\` (string): Summary of changes in 1-2 sentences
- \`requirements_checklist\` (string): Markdown checklist format
- \`files_changed\` (string[]): Array of changed file paths

Always respond in Korean.`;
