#!/usr/bin/env bash
# demo.sh — Decision Memory Agent Demo
# Runs the full pipeline: extract → write-to-gbrain → query

set -e

REPO="/home/rclzen/projects/inspection-to-action"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/src"

echo "============================================"
echo "  Decision Memory Agent — Demo"
echo "============================================"
echo ""

echo "[1/4] Extracting decisions from $REPO..."
echo "--------------------------------------------"
cd "$SCRIPT_DIR"
DECISIONS=$(npx ts-node "$SRC/extract-decisions.ts" --repo="$REPO" --commits=30 2>/dev/null)
EXTRACT_RC=$?
if [ $EXTRACT_RC -ne 0 ]; then
  echo "Extraction timed out or failed (exit $EXTRACT_RC)"
  echo "Trying with smaller commit count..."
  DECISIONS=$(npx ts-node "$SRC/extract-decisions.ts" --repo="$REPO" --commits=15 2>/dev/null) || true
fi
echo ""

echo "[2/4] Writing decisions to GBrain..."
echo "--------------------------------------------"
if [ -n "$DECISIONS" ] && [ "$DECISIONS" != "[]" ]; then
  echo "$DECISIONS" | npx ts-node "$SRC/write-to-gbrain.ts" 2>/dev/null || echo "(write step partial or skipped)"
else
  echo "(no decisions extracted)"
fi
echo ""

echo "[3/4] Demo Query 1: Why does the review workbench have a three-column layout?"
echo "--------------------------------------------"
npx ts-node "$SRC/query-decisions.ts" "why does the review workbench have a three-column layout?" 2>/dev/null || echo "(query unavailable)"
echo ""

echo "[4/4] Demo Query 2: What caused the e2e test flakiness and DB reset pattern?"
echo "--------------------------------------------"
npx ts-node "$SRC/query-decisions.ts" "what caused the e2e test flakiness that led to the DB reset pattern?" 2>/dev/null || echo "(query unavailable)"
echo ""

echo "============================================"
echo "  Demo complete"
echo "============================================"
