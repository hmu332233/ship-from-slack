import { execSync } from "child_process";
import type { EnvConfig } from "../types.js";

export function setRemoteAuth(env: EnvConfig): void {
  execSync(
    `git remote set-url origin https://x-access-token:${env.PAT_TOKEN}@github.com/${env.GITHUB_REPOSITORY}.git`
  );
  execSync(`git config user.email "github-actions[bot]@users.noreply.github.com"`);
  execSync(`git config user.name "github-actions[bot]"`);
}

export function createBranch(branch: string): void {
  execSync(`git checkout -b ${branch}`);
}

export function commitChanges(message: string, model: string): void {
  execSync("git add -A");
  const fullMessage = [
    message,
    "",
    `Co-authored-by: ${model} <noreply@anthropic.com>`,
  ].join("\n");
  execSync("git commit -F -", { input: fullMessage });
}

export function pushBranch(branch: string): void {
  execSync(`git push origin ${branch}`);
}

export function getCurrentBranch(): string {
  return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
}

export function hasChanges(): boolean {
  const status = execSync("git status --porcelain", { encoding: "utf-8" });
  return status.trim().length > 0;
}
