"use strict"; // CJS-free: run via bun. ESM below.
/**
 * src/delendai-bridge.ts — completions via DelendAI's REAL llm-client
 * (freeinference deepseek). Single completions source: shells to
 * borrow/delendai/packages/cli/src/complete-bridge.mjs which imports
 * DelendAI's callLlm. Removes the duplicate fetch in src/llm.ts.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DELENDAI_BRIDGE =
  "/home/toxic/estate/ranch/borrowed/delendai/packages/cli/src/complete-bridge.mjs";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

async function completeOne(prompt: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    "bun",
    [DELENDAI_BRIDGE, prompt, "deepseek-v4-flash"],
    {
      timeout: 90_000,
      env: { ...process.env },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (stderr) throw new Error(stderr.trim());
  return stdout.trim();
}

/**
 * Drop-in for completeOver: parallel fan-out at bounded concurrency (default 2
 * = freeinference slot limit). Index-aligned results.
 */
export async function completeOver<T>(
  items: T[],
  makeMessages: (item: T, i: number) => ChatMsg[],
  _opts: { concurrency?: number } = {},
  concurrency = 2,
): Promise<Array<{ item: T; ok: boolean; text?: string; error?: string }>> {
  const results: Array<{
    item: T;
    ok: boolean;
    text?: string;
    error?: string;
  }> = [];
  let cursor = 0;
  const lim = Math.min(concurrency ?? _opts?.concurrency ?? 2, 2);
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i];
      try {
        const msgs = makeMessages(item, i);
        const prompt = msgs.map((m) => `${m.role}: ${m.content}`).join("\n");
        const text = await completeOne(prompt);
        results[i] = { item, ok: true, text };
      } catch (e) {
        results[i] = { item, ok: false, error: (e as Error).message };
      }
    }
  };
  await Promise.all(Array.from({ length: lim }, () => worker()));
  return results;
}
