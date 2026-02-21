import { execSync } from "child_process";
export function setRemoteAuth(env) {
    execSync(`git remote set-url origin https://x-access-token:${env.PAT_TOKEN}@github.com/${env.GITHUB_REPOSITORY}.git`);
    execSync(`git config user.email "github-actions[bot]@users.noreply.github.com"`);
    execSync(`git config user.name "github-actions[bot]"`);
}
export function createBranch(branch) {
    execSync(`git checkout -b ${branch}`);
}
export function commitChanges(message, model) {
    execSync("git add -A");
    const fullMessage = [
        message,
        "",
        `Co-authored-by: ${model} <noreply@anthropic.com>`,
    ].join("\n");
    execSync("git commit -F -", { input: fullMessage });
}
export function pushBranch(branch) {
    execSync(`git push origin ${branch}`);
}
export function getCurrentBranch() {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
}
export function hasChanges() {
    const status = execSync("git status --porcelain", { encoding: "utf-8" });
    return status.trim().length > 0;
}
