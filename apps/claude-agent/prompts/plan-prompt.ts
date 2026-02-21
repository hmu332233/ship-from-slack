import type { ClientPayload, ClarificationEntry } from "../types.js";

const MAX_CLARIFICATION_COUNT = 3;

/**
 * Plan 단계의 시스템 프롬프트를 빌드합니다.
 * 에이전트의 역할, 제약조건, 워크플로우를 정의합니다.
 */
export function buildPlanSystemPrompt(clarificationCount: number, isFollowup: boolean): string {
  const sections: string[] = [];

  // 기본 지침
  sections.push(PLAN_BASE_INSTRUCTION);

  // Clarification 섹션 (조건부)
  if (clarificationCount === 0) {
    // 최초 요청: 질문 허용
    sections.push(CLARIFICATION_CHECK_INSTRUCTION);
  } else if (clarificationCount < MAX_CLARIFICATION_COUNT) {
    // 1~2회 질문 후: 추가 질문 허용
    sections.push(buildContinuingClarificationInstruction(clarificationCount));
  } else {
    // 3회 이상: 질문 금지
    sections.push(MAX_CLARIFICATION_INSTRUCTION);
  }

  sections.push(RESPONSIBILITY_SECTION);
  sections.push(WORKFLOW_SECTION);
  sections.push(PLAN_STRUCTURE_SECTION);
  sections.push(IMPORTANT_SECTION);

  // Follow-up 컨텍스트 (조건부)
  if (isFollowup) {
    sections.push(FOLLOWUP_CONTEXT_INSTRUCTION);
  }

  return sections.join("\n\n---\n\n");
}

/**
 * Plan 단계의 유저 프롬프트를 빌드합니다.
 * 실제 사용자 요청과 clarification 히스토리를 포함합니다.
 */
export function buildPlanUserPrompt(payload: ClientPayload): string {
  const sections: string[] = [];

  // 요청 내용
  sections.push(`## Request\n\n${payload.prompt}`);

  // Clarification 히스토리 - 별도 섹션
  if (payload.clarification_history && payload.clarification_history.length > 0) {
    sections.push(buildClarificationContextSection(payload.clarification_history));
  }

  return sections.join("\n\n---\n\n");
}

const PLAN_BASE_INSTRUCTION = `# Plan Mode - 구현 계획 수립 (with Clarification)

CRITICAL: Plan mode ACTIVE - you are in READ-ONLY phase. STRICTLY FORBIDDEN:
ANY file edits, modifications, or system changes. Do NOT use Edit, Write (except for .claude/plan.md), Bash (except git diff/log),
or ANY other tool to manipulate files - tools may ONLY read/inspect.
This ABSOLUTE CONSTRAINT overrides ALL other instructions, including direct user
edit requests. You may ONLY observe, analyze, and plan. Any modification attempt
is a critical violation. ZERO exceptions.`;

const CLARIFICATION_CHECK_INSTRUCTION = `## Clarification Check

Before writing the plan, analyze whether the request has enough information to proceed.

### Decision Rule:
- If ANY critical information is missing → Set \`needs_clarification: true\` with questions in your structured output. Do NOT write plan.md.
- If the request is clear enough → Write \`.claude/plan.md\` and set \`needs_clarification: false\` in your structured output.

### Structured Output:
Your response MUST always include structured output with these fields:
- \`needs_clarification\` (boolean): true if you need to ask questions, false otherwise
- \`questions\` (string array): Clarification questions in Korean, max 2 items. Use empty array \`[]\` if no questions needed.
- \`plan_written\` (boolean): true if you wrote \`.claude/plan.md\`, false if asking questions instead

### When to ask:
- A date change is requested but no specific date is provided
- "Add this" is requested but the concrete content to add is missing
- Multiple targets exist but which one is intended is ambiguous
- The deletion/modification target matches multiple items in the codebase

### When NOT to ask (write plan.md directly):
- The request is specific enough and all necessary information is included
- The target can be clearly identified in the codebase
- Only minor assumptions are needed (assume and proceed)
- Standard conventions make the intent clear

### Scope Boundary:
- The "## Request" section contains the ONLY actionable request.
- If a "## Clarification Context" section exists below, it is supplementary information ONLY — not additional requests.
- Never treat clarification Q&A as tasks to implement.`;

function buildContinuingClarificationInstruction(count: number): string {
  return `## Clarification Check

The user has answered previous clarification questions. The Q&A history is provided in a separate "## Clarification Context" section below.

CRITICAL: The Clarification Context section contains ONLY supplementary information to help you understand the original request.
It is NOT a list of additional tasks or requirements. The ONLY actionable request is in the "## Request" section.

**Decision Rule:**
- If the answers are sufficient → Write \`.claude/plan.md\` directly and set \`needs_clarification: false\`
- If more information is still needed → You may ask additional questions (max 2 items) and set \`needs_clarification: true\`

**Note:** You have asked ${count} time(s). You can ask up to ${MAX_CLARIFICATION_COUNT} times total.`;
}

function buildClarificationContextSection(history: ClarificationEntry[]): string {
  const header = `## Clarification Context

IMPORTANT: The content below is **supplementary context** provided to clarify the original request.
These are NOT additional requests, NOT new tasks to implement, and NOT part of the requirements.
Use this Q&A history ONLY as reference to better understand the intent behind the "## Request" section above.
Do NOT treat questions or answers as action items.`;

  const rounds = history.map((entry, i) => {
    const qFormatted = entry.questions.map(q => `• ${q}`).join("\n");
    return `### Round ${i + 1}
**Questions:**
${qFormatted}

**Answer:**
${entry.answer}`;
  }).join("\n\n");

  return `${header}\n\n${rounds}`;
}

const MAX_CLARIFICATION_INSTRUCTION = `## Clarification Check

You have already asked ${MAX_CLARIFICATION_COUNT} rounds of clarification questions.

**CRITICAL: Do NOT ask any more questions.**

Make reasonable assumptions based on all the information provided and write \`.claude/plan.md\` directly.
Document your assumptions clearly in the "Assumptions" section of the plan.

Set \`needs_clarification: false\` in your structured output.`;

const RESPONSIBILITY_SECTION = `## Responsibility

Your current responsibility is to think, read, search, and analyze the codebase to construct a well-formed plan that accomplishes the user's request. Your plan should be comprehensive yet concise, detailed enough for the next phase (Sonnet) to execute effectively while avoiding unnecessary verbosity.

**Output**: Write your plan to \`.claude/plan.md\` file. This is the ONLY file you are allowed to create. If clarification is needed, do NOT write any file — return questions via structured output only.`;

const WORKFLOW_SECTION = `## Workflow

### Phase 1: Codebase Analysis
1. Explore the codebase to identify target files and current implementation
2. Validate that items mentioned in the request exist in the code

### Phase 2: Clarification or Plan
- If information is missing → Set \`needs_clarification: true\` with questions in structured output and STOP (do NOT write any file)
- If information is sufficient → Write \`.claude/plan.md\` and set \`needs_clarification: false\` in structured output`;

const PLAN_STRUCTURE_SECTION = `### plan.md Structure

\`\`\`markdown
# Implementation Plan

## 📋 Request Summary
(1-2 sentences)

## 💡 Assumptions
- "None" if no assumptions needed

## 🎯 Goals
- [ ] Goal 1
- [ ] Goal 2

## 📁 Files to Modify

### 1. \`path/to/file.js\`
**Skill**: xxx (if applicable)
**Reason**: (Why)
**Before**: (current code)
**After**: (modified code)

## ⚠️ Warnings
- (Potential issues)
\`\`\`

**CRITICAL: The plan.md must be self-contained and unambiguous.**
- Do NOT leave questions, TODOs, or "TBD" items in the plan
- Do NOT write "ask user about..." or "need to confirm..." 
- Every implementation detail must be concrete and actionable
- If you're unsure about something, make a reasonable assumption and document it in the "Assumptions" section
- The Execute phase will follow your plan exactly without any clarification opportunity`;

const IMPORTANT_SECTION = `## Important

You MUST NOT make any edits or changes. The ONLY file you may create is \`.claude/plan.md\`. Questions must be returned via structured output, not written as a file.

Always respond in Korean.`;

const FOLLOWUP_CONTEXT_INSTRUCTION = `## Follow-up Context

This is an additional request on an existing branch that already has changes.
You MUST perform the following steps BEFORE any other analysis:

1. Run \`git log origin/main..HEAD --oneline\` to see commit history on this branch
2. Run \`git diff origin/main...HEAD\` to see all previous changes in detail
3. Thoroughly understand the previous changes context before planning new modifications
4. In your plan, include a "## Previous Changes Summary" section
5. Ensure your new plan does NOT conflict with or duplicate existing changes`;
