#!/usr/bin/env node
/**
 * write-to-gbrain.ts
 * Reads extracted decisions from stdin (JSON), writes them to GBrain pages.
 */

interface Decision {
  commit: string;
  date: string;
  files: string[];
  subject: string;
  decision_text: string;
  is_decision: boolean;
}

const GBRAIN = '/home/rclzen/.openclaw/workspace/skills/gbrain/bin/gbrain';

function execSync(cmd: string): string {
  const { execSync: _exec } = require('child_process');
  return _exec(cmd, { encoding: 'utf-8' });
}

function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

function slugForDecision(decision: Decision): string {
  const date = decision.date.split('T')[0];
  return `decision__${date}__${shortHash(decision.commit)}`;
}

function buildPage(decision: Decision): string {
  // Parse the LLM output — typically "DECISION: ...\nRATIONALE: ...\nIMPLICATION: ..."
  const lines = decision.decision_text.split('\n');
  let decisionLine = '';
  let rationaleLine = '';
  let implicationLine = '';

  for (const line of lines) {
    if (line.startsWith('DECISION:')) decisionLine = line.replace('DECISION:', '').trim();
    else if (line.startsWith('RATIONALE:')) rationaleLine = line.replace('RATIONALE:', '').trim();
    else if (line.startsWith('IMPLICATION:')) implicationLine = line.replace('IMPLICATION:', '').trim();
  }

  // Fallback: use the whole text if not structured
  if (!decisionLine) decisionLine = decision.subject;

  const files = decision.files.slice(0, 10).join(', ');
  const phase = detectPhase(decision.subject + ' ' + decisionLine);

  return `---
type: decision
date: ${decision.date.split('T')[0]}
commit: ${decision.commit}
phase: ${phase}
tags: [${phase}, decision]
---

# Decision: ${decisionLine}

**Commit:** \`${decision.commit}\`
**Date:** ${decision.date.split('T')[0]}
**Files:** ${files}

## What was decided
${decisionLine}

## Rationale
${rationaleLine || '(from commit message: ' + decision.subject + ')'}

## Implication
${implicationLine || 'See commit ' + decision.commit}

## Original commit message
${decision.subject}
`;
}

function detectPhase(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('triage') || t.includes('ai-triage')) return 'phase-1-ai-triage';
  if (t.includes('review') || t.includes('workbench') || t.includes('layout')) return 'phase-2-review-workbench';
  if (t.includes('e2e') || t.includes('test') || t.includes('playwright')) return 'phase-3-e2e';
  if (t.includes('db') || t.includes('database') || t.includes('reset')) return 'infrastructure';
  return 'general';
}

async function main() {
  const input = await readStdin();
  let decisions: Decision[];

  try {
    decisions = JSON.parse(input);
  } catch {
    console.error('Error: Could not parse JSON from stdin');
    process.exit(1);
  }

  if (!Array.isArray(decisions)) {
    console.error('Error: Expected JSON array');
    process.exit(1);
  }

  console.error(`\n=== Writing ${decisions.length} decisions to GBrain ===\n`);

  for (const decision of decisions) {
    if (!decision.is_decision) continue;

    const slug = slugForDecision(decision);
    const page = buildPage(decision);

    try {
      // Write the page via gbrain
      const tmpFile = `/tmp/gbrain_page_${Date.now()}.md`;
      require('fs').writeFileSync(tmpFile, page);

      execSync(`${GBRAIN} put "${slug}" < "${tmpFile}"`);
      console.error(`[CREATED] ${slug}`);

      // Embed it
      execSync(`${GBRAIN} embed ${slug}`);
      console.error(`[EMBEDDED] ${slug}`);
    } catch (err) {
      console.error(`[ERROR] ${slug}: ${err}`);
    }
  }

  console.error('\nDone.\n');
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
