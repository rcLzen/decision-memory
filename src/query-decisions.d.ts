#!/usr/bin/env node
/**
 * query-decisions.ts
 * CLI: npx ts-node query-decisions.ts "your question here"
 * Uses GBrain query to find relevant decision pages, then synthesizes via LLM.
 */
declare const GBRAIN = "/home/rclzen/.openclaw/workspace/skills/gbrain/bin/gbrain";
interface GbrainResult {
    slug: string;
    title?: string;
    snippet?: string;
}
declare function gbrainQuery(question: string, limit?: number): GbrainResult[];
declare function gbrainGetPage(slug: string): string;
declare function callLLM(prompt: string): Promise<string>;
declare function buildSynthesizePrompt(question: string, pages: {
    slug: string;
    content: string;
}[]): string;
