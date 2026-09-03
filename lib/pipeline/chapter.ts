// Chapter writer (SPEC §5.4) with the two gates that make the prose
// trustworthy:
//
//   1. Source citation — every paragraph must cite at least one memory row.
//      Unsourced output is rejected and regenerated (CLAUDE.md non-negotiable).
//   2. Naming — prose may never contain the name of a person whose row does
//      not permit naming (interview findings, Finding 5).
//
// Neither is a prompt instruction. Both are checked here, and a draft that
// fails is not returned.

import type { SupabaseClient } from "@supabase/supabase-js";
import { complete, loadPrompt, MODELS, type ModelTier } from "../llm";
import { ChapterSchema, EntailmentSchema, type ChapterDraft } from "./schema";

export interface Foundations {
  book_name: string | null;
  pronoun: "he" | "she" | "they";
  age: number | null;
  birthplace: string | null;
  current_city: string | null;
  prior_cities: string[];
  occupation: string | null;
  household: string | null;
  family_of_origin: string | null;
  style: "third" | "first";
}

export interface MemoryRow {
  id: string;
  kind: string;
  text: string;
}

export interface PersonRow {
  id: string;
  label: string;
  relationship: string | null;
  quotes: string[];
  may_name_in_prose: boolean;
  prose_reference: string | null;
}

export interface WriteChapterOptions {
  outline: string;
  rows: MemoryRow[];
  people: PersonRow[];
  foundations: Foundations;
  voice: Record<string, unknown>;
  /** Opus for the first three chapters (SPEC §5.4, phase0 §5). */
  model?: ModelTier;
  maxAttempts?: number;
  /** Called after each rejected attempt, so a failing run is diagnosable. */
  onAttempt?: (attempt: number, issues: ValidationIssue[]) => void;
}

export interface ValidationIssue {
  rule: "citation" | "naming" | "entailment";
  detail: string;
  /** Entailment only: which paragraph (0-based) and the offending claims, verbatim. */
  paragraph?: number;
  claims?: string[];
}

export interface WriteChapterResult {
  draft: ChapterDraft;
  model: string;
  attempts: number;
  /** Issues from rejected attempts, kept so failures are visible. */
  rejected: ValidationIssue[][];
  /** True if the final draft was produced by mechanical excision. */
  excised: boolean;
}

export function paragraphsOf(bodyMd: string): string[] {
  return bodyMd
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Names that must never appear in prose, with the phrase to use instead. */
function forbiddenNames(people: PersonRow[]): { name: string; use: string }[] {
  return people
    .filter((p) => !p.may_name_in_prose)
    .flatMap((p) => {
      // A withheld person's label is usually already a relationship phrase
      // ("his daughter") and carries no name to forbid. Guard the real names
      // the transcript exposed for them, if any.
      const candidates = [p.label]
        .filter((l) => /^[A-Z][a-z]+/.test(l) && !/\s(his|her|their)\s/i.test(l))
        .filter((l) => !/^(His|Her|Their|The)\b/.test(l));
      return candidates.map((name) => ({
        name,
        use: p.prose_reference ?? p.relationship ?? "the relationship",
      }));
    });
}

export function validate(
  draft: ChapterDraft,
  allowedIds: Set<string>,
  people: PersonRow[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const paragraphs = paragraphsOf(draft.body_md);

  if (draft.paragraph_sources.length !== paragraphs.length) {
    issues.push({
      rule: "citation",
      detail: `${paragraphs.length} paragraphs but ${draft.paragraph_sources.length} source lists`,
    });
  }

  draft.paragraph_sources.forEach((sources, i) => {
    const valid = sources.filter((id) => allowedIds.has(id));
    if (valid.length === 0) {
      const opening = (paragraphs[i] ?? "").slice(0, 70);
      issues.push({
        rule: "citation",
        detail: `paragraph ${i + 1} cites no known memory row — "${opening}…"`,
      });
    }
  });

  for (const { name, use } of forbiddenNames(people)) {
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (pattern.test(draft.body_md)) {
      issues.push({
        rule: "naming",
        detail: `names "${name}", who may not be named — use "${use}"`,
      });
    }
  }

  return issues;
}

/**
 * Gate 3 — entailment. Citation proves a paragraph points at a row; it does
 * not prove the paragraph says only what the row says. Draft one cited real
 * rows and then wrote past them ("what he left out was any request…",
 * "he skipped it"). This asks Sonnet, per paragraph, whether every claim is
 * contained in the cited rows, and rejects the draft if any is not.
 */
async function checkEntailment(
  draft: ChapterDraft,
  sources: Map<string, string>,
  foundations: Foundations,
): Promise<ValidationIssue[]> {
  const paragraphs = paragraphsOf(draft.body_md);
  const blocks = paragraphs.map((text, i) => {
    const cited = (draft.paragraph_sources[i] ?? [])
      .map((id) => sources.get(id))
      .filter((t): t is string => !!t);
    return [
      `PARAGRAPH ${i}`,
      text,
      "",
      "CITED ROWS",
      cited.length ? cited.map((t) => `- ${t}`).join("\n") : "- (none)",
    ].join("\n");
  });

  const verdict = await complete({
    task: "entailment",
    system: loadPrompt("entailment"),
    prompt: [
      "FOUNDATIONS — available to every paragraph as a source",
      JSON.stringify(foundations),
      "",
      "---",
      "",
      blocks.join("\n\n---\n\n"),
    ].join("\n"),
    schema: EntailmentSchema,
    // The product's honesty rests on this call. Medium effort passed a
    // paragraph whose facts came from a different chapter's block.
    effort: "high",
    maxTokens: 8000,
  });

  return verdict.paragraphs
    .filter((p) => !p.supported)
    .map((p) => ({
      rule: "entailment" as const,
      detail:
        `paragraph ${p.index + 1} says what its sources do not: ` +
        p.unsupported_claims.map((c) => `"${c}"`).join(" | "),
      paragraph: p.index,
      claims: p.unsupported_claims,
    }));
}

function sentencesOf(paragraph: string): string[] {
  const parts = paragraph.match(/[^.!?]+(?:[.!?]+["”’)\]]*)?/g) ?? [paragraph];
  return parts.map((x) => x.trim()).filter(Boolean);
}

function wordOverlap(sentence: string, claim: string): number {
  const words = (t: string) =>
    new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3));
  const c = words(claim);
  if (c.size === 0) return 0;
  const sWords = words(sentence);
  let hit = 0;
  for (const w of c) if (sWords.has(w)) hit++;
  return hit / c.size;
}

/**
 * Last resort after the model's repairs are exhausted: remove every sentence
 * that carries a rejected claim, mechanically. The model keeps rephrasing a
 * synthesis it is proud of; code does not. A choppier paragraph that says
 * nothing false is the correct result — the prose rules say so.
 */
export function excise(draft: ChapterDraft, issues: ValidationIssue[]): ChapterDraft {
  const claimsByParagraph = new Map<number, string[]>();
  for (const i of issues) {
    if (i.rule !== "entailment" || i.paragraph === undefined) continue;
    claimsByParagraph.set(i.paragraph, [
      ...(claimsByParagraph.get(i.paragraph) ?? []),
      ...(i.claims ?? []),
    ]);
  }

  const paragraphs = paragraphsOf(draft.body_md);
  const body: string[] = [];
  const sources: string[][] = [];
  paragraphs.forEach((p, idx) => {
    const claims = claimsByParagraph.get(idx);
    let text = p;
    if (claims && claims.length > 0) {
      text = sentencesOf(p)
        .filter((sent) => !claims.some((c) => sent.includes(c) || wordOverlap(sent, c) >= 0.6))
        .join(" ");
    }
    if (text.trim().length > 0) {
      body.push(text);
      sources.push(draft.paragraph_sources[idx] ?? []);
    }
  });

  return { ...draft, body_md: body.join("\n\n"), paragraph_sources: sources };
}

function describePeople(people: PersonRow[]): string {
  return people
    .map((p) => {
      const how = p.may_name_in_prose
        ? `NAME THEM: "${p.label}"`
        : `DO NOT NAME. Refer to them only as "${p.prose_reference ?? p.relationship ?? "this person"}"`;
      const quotes = p.quotes.length
        ? ` Said: ${p.quotes.map((q) => JSON.stringify(q)).join("; ")}`
        : "";
      return `- [${p.id}] ${p.relationship ?? "unstated"} — ${how}.${quotes}`;
    })
    .join("\n");
}

export async function writeChapter(
  opts: WriteChapterOptions,
): Promise<WriteChapterResult> {
  const allowedIds = new Set([
    ...opts.rows.map((r) => r.id),
    ...opts.people.map((p) => p.id),
  ]);
  const maxAttempts = opts.maxAttempts ?? 4; // 1 generation + 3 repairs
  const rejected: ValidationIssue[][] = [];

  // id → the text the entailment gate will hold each paragraph to.
  const sources = new Map<string, string>();
  for (const r of opts.rows) sources.set(r.id, `(${r.kind}) ${r.text}`);
  for (const p of opts.people) {
    const name = p.may_name_in_prose ? p.label : (p.prose_reference ?? p.label);
    const quotes = p.quotes.length ? ` Said: ${p.quotes.map((q) => `"${q}"`).join("; ")}` : "";
    sources.set(p.id, `(person) ${name} — ${p.relationship ?? "unstated"}.${quotes}`);
  }

  const rowsBlock = opts.rows
    .map((r) => `- [${r.id}] (${r.kind}) ${r.text}`)
    .join("\n");

  const base = [
    `OUTLINE INSTRUCTION\n${opts.outline}`,
    "",
    `FOUNDATIONS\n${JSON.stringify(opts.foundations, null, 2)}`,
    "",
    `VOICE PROFILE\n${JSON.stringify(opts.voice, null, 2)}`,
    "",
    `PEOPLE — naming permission is absolute\n${describePeople(opts.people)}`,
    "",
    `MEMORY ROWS — the entire world of this chapter\n${rowsBlock}`,
  ].join("\n");

  // One generation, then repairs. Regenerating on every rejection asks the
  // model to be creative again, and it re-interprets somewhere new each time;
  // the first run of the gate went 15 → 3 rejections over three full rewrites
  // and still failed. Repair keeps the draft and cuts exactly what was named.
  let draft: ChapterDraft | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (draft === null) {
      draft = await complete({
        task: "chapter_major",
        model: opts.model,
        system: loadPrompt("chapter"),
        prompt: base,
        schema: ChapterSchema,
        maxTokens: 32000,
      });
    } else {
      const last = rejected[rejected.length - 1];
      draft = await complete({
        task: "chapter_major",
        model: opts.model,
        system: [loadPrompt("chapter"), "", loadPrompt("chapter-repair")].join("\n"),
        prompt: [
          "REJECTED CLAIMS — remove or rewrite only these:",
          ...last.map((i) => `- ${i.rule}: ${i.detail}`),
          "",
          "DRAFT",
          JSON.stringify(draft),
          "",
          base,
        ].join("\n"),
        schema: ChapterSchema,
        // Surgery, not composition.
        effort: "medium",
        maxTokens: 16000,
      });
    }

    let issues = validate(draft, allowedIds, opts.people);
    if (issues.length === 0) {
      issues = await checkEntailment(draft, sources, opts.foundations);
    }
    if (issues.length === 0) {
      return {
        draft: { ...draft, source_memory_ids: [...new Set(draft.paragraph_sources.flat())] },
        model: MODELS[opts.model ?? "opus"],
        attempts: attempt,
        rejected,
        excised: false,
      };
    }
    rejected.push(issues);
    opts.onAttempt?.(attempt, issues);
  }

  // Model repairs exhausted. If what remains is entailment only, cut it.
  const last = rejected[rejected.length - 1];
  if (draft && last.every((i) => i.rule === "entailment")) {
    const cut = excise(draft, last);
    const recheck = [
      ...validate(cut, allowedIds, opts.people),
      ...(await checkEntailment(cut, sources, opts.foundations)),
    ];
    if (recheck.length === 0) {
      return {
        draft: { ...cut, source_memory_ids: [...new Set(cut.paragraph_sources.flat())] },
        model: MODELS[opts.model ?? "opus"],
        attempts: maxAttempts + 1,
        rejected,
        excised: true,
      };
    }
    rejected.push(recheck);
    opts.onAttempt?.(maxAttempts + 1, recheck);
  }

  throw new Error(
    `Chapter rejected after ${maxAttempts} attempts: ` +
      rejected[rejected.length - 1].map((i) => `${i.rule} — ${i.detail}`).join("; "),
  );
}
