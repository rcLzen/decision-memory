#!/usr/bin/env node
"use strict";
/**
 * query-decisions.ts
 * CLI: npx ts-node query-decisions.ts "your question here"
 * Uses GBrain query to find relevant decision pages, then synthesizes via LLM.
 */
const GBRAIN = '/home/rclzen/.openclaw/workspace/skills/gbrain/bin/gbrain';
function execSync(cmd) {
    const { execSync: _exec } = require('child_process');
    return _exec(cmd, { encoding: 'utf-8' });
}
function gbrainQuery(question, limit = 10) {
    try {
        const raw = execSync(`${GBRAIN} query "${question}" --limit ${limit} 2>&1`);
        const results = [];
        // Parse gbrain query output — it returns pages with slugs
        // Format is typically: slug | title | snippet
        for (const line of raw.split('\n')) {
            const parts = line.split('|').map(p => p.trim());
            if (parts.length >= 1 && parts[0]) {
                const slug = parts[0];
                if (slug && !slug.startsWith('=') && slug !== 'Slug' && slug !== '---') {
                    results.push({
                        slug,
                        title: parts[1] || '',
                        snippet: parts[2] || ''
                    });
                }
            }
        }
        return results;
    }
    catch {
        return [];
    }
}
function gbrainGetPage(slug) {
    try {
        return execSync(`${GBRAIN} get "${slug}" 2>&1`);
    }
    catch {
        return '';
    }
}
async function callLLM(prompt) {
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
    if (!response.ok)
        throw new Error(`LLM failed: ${response.status}`);
    const data = await response.json();
    return data.response;
}
function buildSynthesizePrompt(question, pages) {
    const context = pages.map(p => `
=== Decision: ${p.slug} ===
${p.content}
`).join('\n---\n');
    return `You are a senior software architect answering a question about a codebase's history.

QUESTION: ${question}

CONTEXT — Relevant decisions from the project memory:

${context}

TASK: Based on the decision context above, answer the question in 2-3 paragraphs.
Synthesize across the decisions to give a coherent answer that explains:
1. What was decided
2. Why it was decided that way
3. What the outcome was

If no relevant decisions exist, say: "I couldn't find enough context in the decision memory to answer this question."

Be specific — reference the commit hashes, file names, and rationales where available.`;
}
async function main() {
    const question = process.argv.slice(2).join(' ');
    if (!question) {
        console.error('Usage: npx ts-node query-decisions.ts "your question here"');
        process.exit(1);
    }
    console.error(`\n=== Decision Memory Query ===`);
    console.error(`Question: ${question}\n`);
    // Step 1: GBrain query
    const results = gbrainQuery(question, 8);
    console.error(`GBrain found ${results.length} relevant pages\n`);
    if (results.length === 0) {
        console.log('No relevant decisions found. Try rephrasing the question.');
        return;
    }
    // Step 2: Fetch page content for top results
    const pages = [];
    for (const r of results.slice(0, 5)) {
        const content = gbrainGetPage(r.slug);
        if (content) {
            pages.push({ slug: r.slug, content });
        }
    }
    if (pages.length === 0) {
        console.log('Could not retrieve decision pages.');
        return;
    }
    // Step 3: LLM synthesis
    const prompt = buildSynthesizePrompt(question, pages);
    const answer = await callLLM(prompt);
    console.log('\n--- ANSWER ---');
    console.log(answer);
    console.log('--- END ---\n');
    console.error(`\nSources:`);
    for (const p of pages) {
        console.error(`  - ${p.slug}`);
    }
}
main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
//# sourceMappingURL=query-decisions.js.map