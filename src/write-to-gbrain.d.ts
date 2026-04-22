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
declare const GBRAIN = "/home/rclzen/.openclaw/workspace/skills/gbrain/bin/gbrain";
declare function shortHash(hash: string): string;
declare function slugForDecision(decision: Decision): string;
declare function buildPage(decision: Decision): string;
declare function detectPhase(text: string): string;
declare function readStdin(): Promise<string>;
