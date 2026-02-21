/** 환경 변수 파싱 */
export function getEnvConfig() {
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
    return process.env;
}
/** Client payload 파싱 */
export function parseClientPayload(json) {
    try {
        return JSON.parse(json);
    }
    catch (error) {
        throw new Error(`Failed to parse CLIENT_PAYLOAD: ${error}`);
    }
}
