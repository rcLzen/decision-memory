#!/usr/bin/env node
/**
 * extract-decisions.ts
 * Reads git history, extracts architectural/design decisions.
 * Uses simple-git default format (works reliably with maxCount + --no-merges).
 */

import simpleGit, { SimpleGit } from 'simple-git';

const LLM_URL = 'http://127.0.0.1:11434/api/generate';
const LLM_MODEL = 'gemma4:latest';

interface CommitInfo {
  hash: string;
  date: string;
  subject: string;
  body: string;
  files: string[];
}

interface Decision {
  commit: string;
  date: string;
  files: string[];
  subject: string;
  decision_text: string;
  is_decision: boolean;
}

const DECISION_PATTERNS = [
  /why[:\s]/i, /because[:\s]/i, /decision[:\s]/i,
  /alternatives?\s+(considered|were)/i, /chose\s+\w+\s+over/i,
  /required\s+because/i, /decided\s+to/i, /pattern\s+was\s+chosen/i,
  /architectural/i, /design\s+(decision|pattern|principle)/i,
  /this\s+approach\s+was\s+chosen/i, /constraint[:\s]/i,
  /rationale/i, /reasoning/i, /reversal/i, /undoing\s+previous/i,
  /phase\s*\d/i, /ui[:\s]/i, /redesign/i, /e2e/i, /flaky/i,
  /split-stage/i, /review\s*flow/i, /webhook/i, /copilot/i, /triage/i
];

function isExplicitDecision(commit: CommitInfo): boolean {
  const text = `${commit.subject} ${commit.body}`.toLowerCase();
  return DECISION_PATTERNS.some(p => p.test(text));
}

async function getCommits(git: SimpleGit, count: number): Promise<CommitInfo[]> {
  // Use default format — reliable with simple-git
  const log = await git.log({ maxCount: count, '--no-merges': null });

  const commits: CommitInfo[] = [];
  for (const entry of log.all) {
    const lines = entry.message.split('\n');
    const subject = lines[0] || '';
    const body = lines.slice(1).join('\n').trim();

    // Get file list per commit — only the filenames from --stat
    const statOut = await git.show([entry.hash, '--stat', '--format=%f']);
    const files: string[] = [];
    for (const line of statOut.split('\n')) {
      const m = line.match(/^\s*(.+?)\s*\|/);
      if (m) files.push(m[1].trim());
    }

    commits.push({
      hash: entry.hash,
      date: entry.date,
      subject,
      body,
      files
    });
  }
  return commits;
}

async function callLLM(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: LLM_MODEL, prompt, stream: false, think: false }),
      signal: controller.signal as any
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`LLM failed: ${response.status}`);
    return (await response.json() as { response: string }).response;
  } catch (err: any) {
    clearTimeout(timeout);
    throw err.name === 'AbortError' ? new Error('LLM timed out') : err;
  }
}

function buildBatchPrompt(commits: CommitInfo[]): string {
  const commitList = commits.map((c, i) =>
`${i + 1}. HASH: ${c.hash}
DATE: ${c.date}
SUBJECT: ${c.subject}
${c.body ? 'BODY:\n' + c.body + '\n' : ''}
FILES: ${c.files.join(', ')}
---`).join('\n');

  return `You are analyzing git commits for architectural and design decisions.

A decision commit typically:
- Explains WHY something was done (not just what)
- Mentions alternatives considered or rejected
- Describes a constraint or requirement that drove the choice
- Represents a significant phase, redesign, or architectural choice
- Addresses a systemic problem (flaky tests, deterministic failures)

Look for markers: "Why:", "Because:", "Phase", "Redesign", "e2e", "flaky", "split-stage", "webhook", "copilot", "triage"

Commits to analyze:
${commitList}

For each commit, respond with ONE line:
- DECISION: [HASH] — [one sentence rationale]
- NOT_A_DECISION: [HASH] — brief reason or "routine"

Select maximum 6 decisions. Be selective.`;
}

async function main() {
  const repoPath = process.argv.find(arg => arg.startsWith('--repo='))?.split('=')[1] || process.cwd();
  const commitCount = parseInt(process.argv.find(arg => arg.startsWith('--commits='))?.split('=')[1] || '20');

  console.error(`\n=== Decision Extraction ===`);
  console.error(`Repo: ${repoPath} | Commits: ${commitCount}\n`);

  const git: SimpleGit = simpleGit(repoPath);
  const commits = await getCommits(git, commitCount);
  console.error(`Fetched ${commits.length} commits`);

  const keywordHits = commits.filter(isExplicitDecision);
  console.error(`Keyword candidates: ${keywordHits.length}`);
  keywordHits.slice(0, 5).forEach(c => console.error(`  -> ${c.hash.slice(0, 8)}: ${c.subject.slice(0, 70)}`));

  console.error('\nSending to LLM...');
  let llmResponse = '';
  try {
    llmResponse = await callLLM(buildBatchPrompt(commits));
    console.error(`Response: ${llmResponse.length} chars`);
  } catch (err) {
    console.error(`LLM failed: ${err}`);
    console.log('[]');
    return;
  }

  const decisions: Decision[] = [];
  const lines = llmResponse.split('\n').filter(l => l.trim());

  for (const line of lines) {
    if (line.startsWith('DECISION:')) {
      const rest = line.replace('DECISION:', '').trim();
      // Match: "HASH — rationale" or "HASH - rationale" or "HASH  rationale"
      const match = rest.match(/^([a-f0-9]{7,40})\s*[-–—]\s*(.+)/i) ||
                   rest.match(/^([a-f0-9]{7,40})\s{2,}(.+)/i);
      if (match) {
        const hash = match[1];
        const rationale = match[2].trim();
        const commit = commits.find(c => c.hash.startsWith(hash));
        if (commit) {
          decisions.push({
            commit: commit.hash,
            date: commit.date,
            files: commit.files,
            subject: commit.subject,
            decision_text: rationale,
            is_decision: true
          });
        }
      }
    }
  }

  // Add keyword hits LLM may have missed
  for (const c of keywordHits) {
    if (!decisions.find(d => d.commit === c.hash)) {
      decisions.push({
        commit: c.hash, date: c.date, files: c.files,
        subject: c.subject,
        decision_text: `Decision via keyword: ${c.subject}`,
        is_decision: true
      });
    }
  }

  console.error(`\n=== Results: ${decisions.length} decisions from ${commits.length} commits ===`);
  decisions.forEach(d => console.error(`  [${d.commit.slice(0, 8)}] ${d.decision_text.slice(0, 80)}`));

  console.log(JSON.stringify(decisions, null, 2));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
