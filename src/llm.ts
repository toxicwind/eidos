/**
 * src/llm.ts — deepseek v4 flash via FreeInference, proven live.
 *
 * Facts locked in from estate docs/freeinference-provider.md + a live 200:
 *   base URL      https://freeinference.org/v1/chat/completions   (NOT /api/v1)
 *   auth          Authorization: Bearer $FREEINFERENCE_API_KEY
 *   model         deepseek-v4-flash (1.0M ctx / 393K max out)
 *   UA            honest branded, never Chrome impersonation (ToS bans fake UA)
 *   concurrency   max 2 slots per key -> >2 in flight returns 429 retry-after:1
 *   reasoning     X-Reasoning-Passthrough: false for strict OpenAI mode
 *
 * Key precedence: opts.apiKey -> $FREEINFERENCE_API_KEY -> $DEEPSEEK_API_KEY.
 */

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompleteOpts {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  concurrency?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage?: Record<string, number>;
}

const BASE_URL = "https://freeinference.org/v1/chat/completions";
const MODEL = "deepseek-v4-flash";
const KEY = () =>
  process.env.FREEINFERENCE_API_KEY || process.env.DEEPSEEK_API_KEY || "";
const UA = "delendai-scaffold/0.1 (+https://github.com/toxicwind/DelendAI)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One chat-completions call with Retry-After-aware retry (honours the 2-slot
 * limit: a saturated request is 429 with retry-after: 1).
 */
export async function complete(
  messages: ChatMsg[],
  opts: CompleteOpts = {},
): Promise<CompletionResult> {
  const url = opts.baseUrl || BASE_URL;
  const model = opts.model || MODEL;
  const key = opts.apiKey || KEY();
  const maxTokens = opts.maxTokens ?? 4096;

  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          "user-agent": UA,
          ...(key ? { authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: maxTokens,
          stream: false,
        }),
      });
      if (res.status === 429) {
        // 2-slot concurrency limit — honour retry-after if present, else back off.
        const ra = Number(res.headers.get("retry-after") || "1");
        await sleep(ra * 1000);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`completions ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        usage?: Record<string, number>;
      };
      return {
        text: data.choices?.[0]?.message?.content ?? "",
        model: data.model || model,
        usage: data.usage,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`completions failed after retries (429-saturated)`);
}

/**
 * Parallel fan-out bounded to freeinference's 2-slot limit (default concurrency
 * 2). Each item returns { item, ok, text|error }, index-aligned.
 */
export async function completeOver<T>(
  items: T[],
  makeMessages: (item: T, i: number) => ChatMsg[],
  opts: CompleteOpts = {},
  concurrency = 2,
): Promise<Array<{ item: T; ok: boolean; text?: string; error?: string }>> {
  const results: Array<{
    item: T;
    ok: boolean;
    text?: string;
    error?: string;
  }> = [];
  let cursor = 0;
  const lim = Math.min(concurrency || 2, 2);
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i];
      try {
        const r = await complete(makeMessages(item, i), opts);
        results[i] = { item, ok: true, text: r.text };
      } catch (e) {
        results[i] = { item, ok: false, error: (e as Error).message };
      }
    }
  };
  await Promise.all(Array.from({ length: lim }, () => worker()));
  return results;
}
