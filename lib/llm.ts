// All LLM calls go through this module (CLAUDE.md conventions): typed
// input/output schemas, the shared system preamble, model routing per SPEC §5,
// and prompt caching on the memory context. Prompts live in /prompts as
// versioned markdown — no prompt strings inline in code.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

// Model tiers. SPEC §5 asks for Haiku 4.5 / Sonnet 5 / Opus-class; the opus
// tier maps to the current Opus-class model. One place to change.
export const MODELS = {
  opus: "claude-opus-5",
  sonnet: "claude-sonnet-5",
  haiku: "claude-haiku-4-5",
} as const;

export type ModelTier = keyof typeof MODELS;

// Routing per SPEC §5. Prose model floor is Sonnet-class; Haiku only for the
// interviewer, daily question generation, and classification (CLAUDE.md).
export const TASK_TIER = {
  interviewer: "haiku", // §5.1
  extraction: "sonnet", // §5.2 (onboarding runs use the opus override)
  entity_resolution: "sonnet", // §5.3
  chapter: "sonnet", // §5.4
  chapter_major: "opus", // §5.4 — first three, spine, arc rewrites
  revision_proposer: "sonnet", // §5.5
  daily_question: "haiku", // §5.6
  sofar: "sonnet", // §5.7
  spine: "opus", // §5.8
} as const satisfies Record<string, ModelTier>;

export type Task = keyof typeof TASK_TIER;

let _client: Anthropic | null = null;
function client(): Anthropic {
  return (_client ??= new Anthropic());
}

// --- prompt loading ---------------------------------------------------------

const promptCache = new Map<string, string>();

export function loadPrompt(name: string): string {
  const cached = promptCache.get(name);
  if (cached) return cached;
  const file = path.join(process.cwd(), "prompts", `${name}.md`);
  if (!fs.existsSync(file)) {
    throw new Error(`Prompt not found: prompts/${name}.md`);
  }
  const text = fs.readFileSync(file, "utf8").trim();
  promptCache.set(name, text);
  return text;
}

// Every prompt gets the same system preamble: the interviewer/prose rules from
// sofar-phase0-interview.md §2 and §5, verbatim (SPEC §5). Founder-supplied —
// never invented or paraphrased.
export function loadPreamble(): string {
  try {
    return loadPrompt("preamble");
  } catch {
    throw new Error(
      "prompts/preamble.md is missing. It must contain §2 and §5 of " +
        "sofar-phase0-interview.md verbatim (founder-supplied).",
    );
  }
}

// --- completion -------------------------------------------------------------

export interface CompleteOptions<T> {
  task: Task;
  /** The user-turn content for this call. */
  prompt: string;
  /** Task-specific system prompt, usually loadPrompt("<task>"). */
  system?: string;
  /** Existing memory summary — passed as a cached block (SPEC §1, §5.2). */
  memoryContext?: string;
  /**
   * Large input reused across several calls in one run (a transcript across
   * extraction passes). Sent as a cached block so it is paid for once.
   */
  cachedInput?: string;
  /** Zod schema for JSON output; omit for plain text. */
  schema?: z.ZodType<T>;
  maxTokens?: number;
  /** Override the routed tier (e.g. extraction → opus during onboarding). */
  model?: ModelTier;
  /**
   * M0 acceptance only. The pipeline always includes the preamble; the
   * founder-supplied rules file is a hard dependency of M1.
   */
  includePreamble?: boolean;
}

function systemBlocks(opts: CompleteOptions<unknown>): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [];
  if (opts.includePreamble !== false) {
    // Stable across every call — always cacheable.
    blocks.push({
      type: "text",
      text: loadPreamble(),
      cache_control: { type: "ephemeral" },
    });
  }
  if (opts.system) {
    blocks.push({ type: "text", text: opts.system });
  }
  if (opts.memoryContext) {
    // Stable across the calls of one pipeline run — the cached block.
    blocks.push({
      type: "text",
      text: opts.memoryContext,
      cache_control: { type: "ephemeral" },
    });
  }
  if (opts.cachedInput) {
    blocks.push({
      type: "text",
      text: opts.cachedInput,
      cache_control: { type: "ephemeral" },
    });
  }
  return blocks;
}

export async function complete(opts: CompleteOptions<never> & { schema?: undefined }): Promise<string>;
export async function complete<T>(opts: CompleteOptions<T> & { schema: z.ZodType<T> }): Promise<T>;
export async function complete<T>(opts: CompleteOptions<T>): Promise<T | string> {
  const model = MODELS[opts.model ?? TASK_TIER[opts.task]];
  const maxTokens = opts.maxTokens ?? 8192;
  const system = systemBlocks(opts);
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: opts.prompt },
  ];

  // Always stream. Extraction and chapter calls carry a large max_tokens and
  // can run past the SDK's non-streaming timeout; streaming also keeps long
  // Opus turns from dying on an HTTP deadline.
  try {
    if (opts.schema) {
      const stream = client().messages.stream({
        model,
        max_tokens: maxTokens,
        ...(system.length > 0 ? { system } : {}),
        messages,
        output_config: { format: zodOutputFormat(opts.schema) },
      });
      const response = await stream.finalMessage();
      if (response.parsed_output == null) {
        // Name the reason: a truncated response (max_tokens) and a declined
        // one look identical from a null parse, and need opposite fixes.
        const why =
          response.stop_reason === "max_tokens"
            ? `output hit the ${maxTokens}-token cap and was truncated`
            : response.stop_reason === "refusal"
              ? `model declined (${response.stop_details?.category ?? "unspecified"})`
              : `stop_reason=${response.stop_reason}`;
        throw new Error(`LLM task "${opts.task}" returned unparseable output: ${why}`);
      }
      return response.parsed_output;
    }

    const stream = client().messages.stream({
      model,
      max_tokens: maxTokens,
      ...(system.length > 0 ? { system } : {}),
      messages,
    });
    const response = await stream.finalMessage();
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  } catch (err) {
    // SPEC §7: never let request content (transcripts, memory) leak into
    // error reports. API error messages are server-generated and safe.
    if (err instanceof Anthropic.APIError) {
      throw new Error(
        `LLM task "${opts.task}" failed (${err.status ?? "network"}): ${err.message}`,
      );
    }
    throw err;
  }
}
