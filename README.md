# Decision Memory Agent

Extracts architectural and design decisions from git history using an LLM, stores them in GBrain, and lets you query them conversationally.

## How it works

1. **`extract-decisions.ts`** — reads git log, sends commits in batches to an LLM, identifies decision commits
2. **`write-to-gbrain.ts`** — writes extracted decisions as GBrain pages (optional storage layer)
3. **`query-decisions.ts`** — queries GBrain for decisions matching a natural language question

## Requirements

- Node.js 18+
- TypeScript (`npm install -g typescript ts-node`)
- Ollama running locally (or swap `OLLAMA_URL` in scripts for an API-based LLM)
- GBrain (optional, for persistent storage and semantic search)

## Setup

```bash
npm install
```

## Usage

```bash
# Extract decisions from a repo (last 20 commits)
npx ts-node src/extract-decisions.ts --repo=/path/to/repo --commits=20

# Write extracted decisions to GBrain
npx ts-node src/extract-decisions.ts --repo=/path/to/repo --commits=20 | npx ts-node src/write-to-gbrain.ts

# Query decisions from GBrain
npx ts-node src/query-decisions.ts "Why does the review workbench have a three-column layout?"
```

## LLM Configuration

Set the model via environment variable or edit the script constants:

```bash
export OLLAMA_MODEL=gemma4:latest   # default
```

Tested with: `gemma4:latest`, `qwen3.5:9b` (via Ollama)

## Demo

```bash
./demo.sh
```

## Extracted decision shape

```json
{
  "commit": "bd7f772f6dd1c2e8141c7b905daa8b8d6008dbf7",
  "date": "2026-03-20T16:45:14-05:00",
  "files": ["src/Api/Program.cs"],
  "subject": "Make e2e deterministic by resetting DB before Playwright runs",
  "decision_text": "This addresses a systemic issue by making e2e tests deterministic...",
  "is_decision": true
}
```

## Notes

- Extraction uses keyword pre-filtering (Phase N, redesign, e2e, webhook, etc.) to reduce LLM call volume before sending to the model
- The LLM call uses a 120s timeout; larger repos should use smaller batch sizes
- GBrain embedding requires `OPENAI_API_KEY` set (or configured embedding provider) — without it, GBrain writes pages but search/semantic query won't return results
