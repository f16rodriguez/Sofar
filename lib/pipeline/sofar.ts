// So far generator (SPEC §5.7, §3.7; concept §3; M3).
//
// The last chapter is always "So far." — the book's open ledger: what the
// person keeps returning to and has not resolved, and what they say they
// want, in their words, rewritten monthly. It is regenerated, never revised;
// the revision proposer skips it, and there is one per person.
//
// It is prose, so it passes the chapter gates: every paragraph cites a row,
// naming permission holds, nothing says more than its rows. The receipts —
// how many times, since when, what cuts against it — are not prose. They are
// computed here from the rows and appended after the gates, so a count or a
// date is never the model's guess and never something the gate has to trust.

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { complete, loadPrompt } from "../llm";
import {
  validate,
  checkEntailmentFor,
  type Foundations,
  type MemoryRow,
  type PersonRow,
} from "./chapter";

export const SOFAR_TITLE = "So far.";

export const SoFarSchema = z.object({
  opening_md: z.string(),
  opening_sources: z.array(z.string()),
  lines: z.array(
    z.object({
      thread_id: z.string(),
      line_md: z.string(),
      contradicted_by_stance_id: z.string().nullable(),
    }),
  ),
});

interface ThreadRow {
  id: string;
  label: string;
  description: string | null;
  mention_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  source_quote: string | null;
}

interface StanceRow {
  id: string;
  statement: string;
  rationale: string | null;
  stated_at: string | null;
  superseded_by: string | null;
  source_quote: string | null;
}

export interface SoFarResult {
  written: boolean;
  reason?: string;
  body_md?: string;
  threads: number;
  attempts: number;
  /** What the gates rejected on the last attempt, when nothing was written. */
  issues?: { rule: string; detail: string }[];
  /** The rejected text, so a failure can be read without another paid run. */
  last_draft?: string;
}

/**
 * The editor records "what the book still needs" as threads so the question
 * generator can ask for it. Those are asks about the book, not things the
 * person keeps returning to, and the book never talks about itself.
 */
const EDITOR_NEED = /^(Missing|Ask):/;

/**
 * One line per open thread, but a ledger of forty lines is a list, not a
 * chapter. The threads come ordered by how often they return, so the cap
 * keeps the ones that keep coming back and lets the rest wait for the next
 * month.
 */
const MAX_THREADS = 12;

function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The receipt, from the rows. Plain text: the Book screen does not render markdown. */
function receipt(t: ThreadRow, against: StanceRow | undefined): string {
  const times =
    t.mention_count <= 1 ? "mentioned once" : `mentioned ${t.mention_count} times`;
  const since = monthYear(t.first_seen_at);
  const parts = [since ? `${times} since ${since}` : times];
  if (against) {
    parts.push(`against: “${against.statement.replace(/\s+/g, " ").trim()}”`);
  }
  return `(${parts.join("; ")})`;
}

const oneLine = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Regenerate the person's "So far." chapter from open threads and current
 * stances. One row per person: an existing chapter is replaced and goes back
 * to draft, so the Book screen canons it again on the next read.
 */
export async function generateSoFar(
  db: SupabaseClient,
  opts: { userId: string; foundations: Foundations },
): Promise<SoFarResult> {
  const [threadsQ, stancesQ, peopleQ, lastQ] = await Promise.all([
    db
      .from("memory_threads")
      .select("id, label, description, mention_count, first_seen_at, last_seen_at, source_quote")
      .eq("user_id", opts.userId)
      .eq("status", "open")
      .eq("off_record", false)
      .order("mention_count", { ascending: false })
      .order("last_seen_at", { ascending: false }),
    db
      .from("memory_stances")
      .select("id, statement, rationale, stated_at, superseded_by, source_quote")
      .eq("user_id", opts.userId)
      .order("stated_at", { ascending: true }),
    db
      .from("memory_people")
      .select("id, label, relationship, quotes, may_name_in_prose, prose_reference")
      .eq("user_id", opts.userId),
    db
      .from("chapters")
      .select("id, body_md, version")
      .eq("user_id", opts.userId)
      .eq("kind", "sofar")
      .maybeSingle(),
  ]);
  for (const q of [threadsQ, stancesQ, peopleQ, lastQ]) {
    if (q.error) throw new Error(`so far: read failed: ${q.error.code ?? q.error.message}`);
  }

  const allThreads = ((threadsQ.data ?? []) as ThreadRow[]).filter(
    (t) => !EDITOR_NEED.test(t.description ?? ""),
  );
  const threads = allThreads.slice(0, MAX_THREADS);
  const stances = (stancesQ.data ?? []) as StanceRow[];
  const current = stances.filter((s) => !s.superseded_by);
  const superseded = stances.filter((s) => s.superseded_by);
  const people: PersonRow[] = (peopleQ.data ?? []).map((p) => ({
    id: p.id,
    label: p.label,
    relationship: p.relationship,
    quotes: Array.isArray(p.quotes) ? p.quotes : [],
    may_name_in_prose: p.may_name_in_prose,
    prose_reference: p.prose_reference,
  }));
  const last = lastQ.data as { id: string; body_md: string; version: number } | null;

  if (threads.length === 0 && current.length === 0) {
    return { written: false, reason: "nothing open", threads: 0, attempts: 0 };
  }

  // What the gates check against. Threads and current stances only: a
  // superseded stance is shown to the writer as history, not as a source.
  const rows: MemoryRow[] = [
    ...threads.map((t) => ({
      id: t.id,
      kind: "thread",
      text: [t.label, t.description].filter(Boolean).join(" — "),
      quote: t.source_quote ?? undefined,
    })),
    ...current.map((s) => ({
      id: s.id,
      kind: "stance",
      text: [s.statement, s.rationale].filter(Boolean).join(" — "),
      quote: s.source_quote ?? undefined,
    })),
  ];
  const allowedIds = new Set([...rows.map((r) => r.id), ...people.map((p) => p.id)]);
  const threadById = new Map(threads.map((t) => [t.id, t]));
  const stanceById = new Map(current.map((s) => [s.id, s]));

  const words = (q: string | null) => (q ? `\n      THEIR WORDS: “${oneLine(q)}”` : "");
  const threadList =
    threads
      .map(
        (t) =>
          `- [${t.id}] ${t.label}${t.description ? ` — ${oneLine(t.description)}` : ""}${words(t.source_quote)}`,
      )
      .join("\n") || "(none)";
  const stanceList =
    current
      .map(
        (s) =>
          `- [${s.id}] ${s.statement}${s.rationale ? ` — ${oneLine(s.rationale)}` : ""}${words(s.source_quote)}`,
      )
      .join("\n") || "(none)";
  const supersededList =
    superseded
      .map((s) => `- ${s.statement} → since replaced by [${s.superseded_by}]`)
      .join("\n") || "(none)";
  const peopleList =
    people
      .map(
        (p) =>
          `- [${p.id}] ${p.label}${p.relationship ? ` (${p.relationship})` : ""} — ${
            p.may_name_in_prose ? "may be named" : `do not name; refer to as “${p.prose_reference ?? p.relationship ?? "them"}”`
          }`,
      )
      .join("\n") || "(none)";

  const basePrompt = [
    `OPEN THREADS — one line each, in this order${
      allThreads.length > threads.length
        ? ` (the ${threads.length} that return most; ${allThreads.length - threads.length} more wait)`
        : ""
    }\n${threadList}`,
    "",
    `WHAT THEY CURRENTLY SAY THEY WANT OR HOLD — current stances\n${stanceList}`,
    "",
    `WHAT THEY USED TO SAY — superseded, for your bearings only, not a source\n${supersededList}`,
    "",
    `PEOPLE\n${peopleList}`,
    "",
    `THE LAST “SO FAR.”\n${last?.body_md ?? "(none yet — this is the first)"}`,
    "",
    `FOUNDATIONS\n${JSON.stringify(opts.foundations)}`,
  ].join("\n");

  let feedback = "";
  let lastIssues: { rule: string; detail: string }[] = [];
  let lastDraft = "";
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const out = await complete({
      task: "sofar",
      system: loadPrompt("sofar"),
      prompt: feedback ? `${basePrompt}\n\n${feedback}` : basePrompt,
      schema: SoFarSchema,
      // A ledger, not a chapter: medium is enough, and thinking comes out of
      // maxTokens — the first run at 8k was cut off mid-JSON by its own
      // deliberation.
      effort: "medium",
      maxTokens: 24000,
    });

    // One line per thread, in order. The model can neither add nor drop one.
    const lines = threads.map((t) => out.lines.find((l) => l.thread_id === t.id));
    const missing = threads.filter((_, i) => !lines[i]);
    if (missing.length > 0) {
      feedback = `REJECTED: no line for ${missing.map((t) => `[${t.id}]`).join(", ")}. One line per thread, every thread, in the order given.`;
      continue;
    }

    // Gated as prose, without receipts: a receipt is the system's, and the
    // entailment gate must not be asked to trust it.
    const prose = [
      oneLine(out.opening_md),
      ...lines.map((l) => oneLine(l!.line_md)),
    ];
    // The opening rests on the whole ledger it was shown, so it cites the
    // whole ledger: the entailment gate then checks it against everything it
    // was allowed to draw on and nothing it was not. The model's own list is
    // kept only as attribution.
    const openingSources = [
      ...new Set([...rows.map((r) => r.id), ...out.opening_sources.filter((id) => allowedIds.has(id))]),
    ];
    const paragraph_sources = [
      openingSources,
      ...lines.map((l) => {
        const ids = [l!.thread_id];
        const a = l!.contradicted_by_stance_id;
        if (a && stanceById.has(a)) ids.push(a);
        return ids;
      }),
    ];
    const draft = {
      title: SOFAR_TITLE,
      body_md: prose.join("\n\n"),
      source_memory_ids: [...new Set(paragraph_sources.flat())],
      paragraph_sources,
    };
    const issues = [
      ...validate(draft, allowedIds, people),
      ...(await checkEntailmentFor(draft, rows, people, opts.foundations, {
        story: "Where things stand now: what is still open, and what they say they want.",
      })),
    ];
    if (issues.length > 0) {
      lastIssues = issues.map((i) => ({ rule: i.rule, detail: i.detail }));
      lastDraft = draft.body_md;
      feedback = `REJECTED — fix these and return the whole thing again:\n${issues
        .map((i) => `- ${i.rule}: ${i.detail}`)
        .join("\n")}`;
      continue;
    }

    // Passed. Now the receipts, from the rows.
    const body_md = [
      prose[0],
      ...lines.map((l, i) => {
        const t = threadById.get(threads[i].id)!;
        const a = l!.contradicted_by_stance_id;
        return `${prose[i + 1]} ${receipt(t, a ? stanceById.get(a) : undefined)}`;
      }),
    ].join("\n\n");

    const payload = {
      user_id: opts.userId,
      title: SOFAR_TITLE,
      kind: "sofar",
      number: null,
      body_md,
      status: "draft",
      canon_at: null,
      model: "claude-sonnet-5",
      source_memory_ids: draft.source_memory_ids,
      word_count: body_md.split(/\s+/).filter(Boolean).length,
    };
    const { error } = last
      ? await db
          .from("chapters")
          .update({ ...payload, version: last.version + 1 })
          .eq("id", last.id)
      : await db.from("chapters").insert(payload);
    if (error) throw new Error(`so far: write failed: ${error.code ?? error.message}`);

    return { written: true, body_md, threads: threads.length, attempts: attempt };
  }

  return {
    written: false,
    reason: `failed its gates after ${maxAttempts} attempts`,
    threads: threads.length,
    attempts: maxAttempts,
    issues: lastIssues,
    last_draft: lastDraft,
  };
}
