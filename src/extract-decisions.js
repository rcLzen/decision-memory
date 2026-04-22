#!/usr/bin/env node
"use strict";
/**
 * extract-decisions.ts
 * Reads git history, uses LLM to extract architectural/design decisions.
 * Input: repo path, commit count
 * Output: JSON array of { commit, date, files, message, decision_text }
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const simple_git_1 = __importDefault(require("simple-git"));
async function getCommits(git, count) {
    const log = await git.log({ maxCount: count, '--no-merges': null });
    const commits = [];
    for (const entry of log.all) {
        const show = await git.show([entry.hash, '--stat', '--format=%B']);
        const lines = show.split('\n');
        const files = [];
        let inStats = false;
        let bodyLines = [];
        for (const line of lines) {
            if (line.includes('|')) {
                inStats = true;
                const file = line.split('|')[0].trim();
                if (file)
                    files.push(file);
            }
            else if (inStats && line.trim() === '') {
                inStats = false;
            }
            else if (!inStats && line.trim() !== '' && !line.includes('diff --git')) {
                bodyLines.push(line.trim());
            }
        }
        commits.push({
            hash: entry.hash,
            date: entry.date,
            subject: entry.message.split('\n')[0],
            body: bodyLines.join('\n').trim(),
            files
        });
    }
    return commits;
}
function buildPrompt(commit) {
    return `You are analyzing a git commit for architectural or design decisions.

COMMIT: ${commit.hash}
DATE: ${commit.date}
SUBJECT: ${commit.subject}
BODY: ${commit.body || '(no body)'}
FILES CHANGED: ${commit.files.join(', ')}

TASK: Does this commit encode an architectural or design decision?
A decision commit typically:
- Explains WHY something was done (not just what)
- Mentions alternatives considered
- Describes a constraint or requirement that drove the choice
- Documents a reversal with reasoning
- References an architectural pattern or design principle

Look for explicit decision markers like: "Why:", "Because:", "Alternatives considered:", "Decision:", "Chose X over Y because", "Required because", "This pattern was chosen to"

If YES: Extract the decision in this format:
DECISION: <one sentence describing what was decided>
RATIONALE: <why this was decided, including alternatives considered if any>
IMPLICATION: <what this means for the codebase going forward>

If NO: Reply with exactly:
NO_DECISION

Be concise. Only output the decision block or NO_DECISION.`;
}
function parseDecision(raw, commit) {
    const isDecision = !raw.includes('NO_DECISION');
    return {
        commit: commit.hash,
        date: commit.date,
        files: commit.files,
        subject: commit.subject,
        decision_text: raw.trim(),
        is_decision: isDecision
    };
}
async function callLLM(prompt) {
    // Use local Ollama — no think mode
    const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'qwen3.5:9b',
            prompt,
            stream: false,
            think: false
        })
    });
    if (!response.ok) {
        throw new Error(`LLM call failed: ${response.status}`);
    }
    const data = await response.json();
    return data.response;
}
async function main() {
    const repoPath = process.argv.find(arg => arg.startsWith('--repo='))?.split('=')[1] || process.cwd();
    const commitCount = parseInt(process.argv.find(arg => arg.startsWith('--commits='))?.split('=')[1] || '30');
    console.error(`\n=== Decision Extraction ===`);
    console.error(`Repo: ${repoPath}`);
    console.error(`Commits: ${commitCount}\n`);
    const git = (0, simple_git_1.default)(repoPath);
    const commits = await getCommits(git, commitCount);
    console.error(`Fetched ${commits.length} commits\n`);
    const decisions = [];
    for (const commit of commits) {
        const prompt = buildPrompt(commit);
        try {
            const raw = await callLLM(prompt);
            const decision = parseDecision(raw, commit);
            decisions.push(decision);
            if (decision.is_decision) {
                console.error(`[DECISION] ${commit.hash.slice(0, 7)} — ${commit.subject}`);
            }
            else {
                console.error(`[SKIP]     ${commit.hash.slice(0, 7)} — ${commit.subject}`);
            }
        }
        catch (err) {
            console.error(`[ERROR]    ${commit.hash.slice(0, 7)} — ${err}`);
        }
    }
    const extracted = decisions.filter(d => d.is_decision);
    console.error(`\n=== Extraction Complete ===`);
    console.error(`Decisions found: ${extracted.length}/${commits.length}\n`);
    // Output as JSON for piping
    console.log(JSON.stringify(extracted, null, 2));
}
main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
//# sourceMappingURL=extract-decisions.js.map