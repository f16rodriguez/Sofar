// Revision proposer (SPEC §5.5, M3).
//
// New memory arrives; a canon chapter may no longer be true. This proposes —
// never applies. The person accepts or declines in the Book screen, and
// declining changes nothing.
//
// A proposed revision is prose, so it passes the same gates as a chapter: it
// cites its sources, it may not name someone whose row forbids it, and it may
// not say more than its sources say. A revision that invents would be worse
// than the original, because it arrives with the authority of a correction.

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

export const RevisionSchema = z.object({
  should_revise: z.boolean(),
  rationale_one_line: z.string(),
  proposed_body_md: z.string(),
  paragraph_sources: z.array(z.array(z.string())),
});

export interface CanonChapter {
  id: string;
  title: string;
  body_md: string;
  source_memory_ids: string[];
}

export interface ProposeResult {
  proposed: boolean;
  rationale?: string;
  reason?: string;
}

/**
 * Consider one canon chapter against the memory that has arrived since.
 * Writes at most one proposal — the acceptance test says exactly one, and a
 * second proposal on the same chapter would make the first meaningless.
 */
export async function proposeRevision(
  db: SupabaseClient,
  opts: {
    userId: string;
    chapter: CanonChapter;
    /** Rows written or matched by the run that just finished. */
    newRows: MemoryRow[];
    /** The rows the chapter was written from. */
    sourceRows: MemoryRow[];
    people: PersonRow[];
    foundations: Foundations;
    triggerAnswerIds: string[];
  },
): Promise<ProposeResult> {
  // One open proposal per chapter, ever.
  const { data: existing } = await db
    .from("chapter_revisions")
    .select("id")
    .eq("chapter_id", opts.chapter.id)
    .eq("status", "proposed")
    .maybeSingle();
  if (existing) return { proposed: false, reason: "a proposal is already open" };

  const describe = (rows: MemoryRow[]) =>
    rows
      .map((r) =>
        r.quote
          ? `- [${r.id}] (${r.kind}) ${r.text}\n      HIS WORDS: "${r.quote.replace(/\s+/g, " ").trim()}"`
          : `- [${r.id}] (${r.kind}) ${r.text}`,
      )
      .join("\n");

  const verdict = await complete({
    task: "revision_proposer",
    system: loadPrompt("revision-proposer"),
    prompt: [
      `THE CHAPTER AS IT STANDS — "${opts.chapter.title}"`,
      opts.chapter.body_md,
      "",
      `WHAT IT WAS WRITTEN FROM\n${describe(opts.sourceRows)}`,
      "",
      `WHAT HAS BEEN SAID SINCE\n${describe(opts.newRows)}`,
      "",
      `FOUNDATIONS\n${JSON.stringify(opts.foundations)}`,
    ].join("\n"),
    schema: RevisionSchema,
    effort: "high",
    maxTokens: 16000,
  });

  if (!verdict.should_revise || verdict.proposed_body_md.trim().length === 0) {
    return { proposed: false, reason: "the chapter still holds" };
  }

  // Same gates as any chapter. A revision that fails them is not offered.
  const allRows = [...opts.sourceRows, ...opts.newRows];
  const allowedIds = new Set([
    ...allRows.map((r) => r.id),
    ...opts.people.map((p) => p.id),
  ]);
  const draft = {
    title: opts.chapter.title,
    body_md: verdict.proposed_body_md,
    source_memory_ids: [...new Set(verdict.paragraph_sources.flat())],
    paragraph_sources: verdict.paragraph_sources,
  };

  const issues = [
    ...validate(draft, allowedIds, opts.people),
    ...(await checkEntailmentFor(draft, allRows, opts.people, opts.foundations, {
      story: verdict.rationale_one_line,
    })),
  ];
  if (issues.length > 0) {
    return {
      proposed: false,
      reason: `revision failed its own gates (${issues.map((i) => i.rule).join(", ")})`,
    };
  }

  const { error } = await db.from("chapter_revisions").insert({
    chapter_id: opts.chapter.id,
    user_id: opts.userId,
    proposed_body_md: draft.body_md,
    rationale: verdict.rationale_one_line,
    trigger_answer_ids: opts.triggerAnswerIds,
    status: "proposed",
    model: "claude-sonnet-5",
  });
  if (error) throw new Error(`revision insert failed: ${error.code ?? error.message}`);

  return { proposed: true, rationale: verdict.rationale_one_line };
}

// --- the decision -----------------------------------------------------------
// Accepting replaces the chapter body and bumps its version; the chapter
// stays canon. Declining marks the proposal declined and touches nothing
// else — not the chapter, not the memory that triggered it. That asymmetry
// is M3's acceptance test, and it is why there is no third option here.

export type Decision = "accepted" | "declined";

export type DecideResult =
  | { ok: true; status: Decision }
  | { ok: false; reason: "not found" | "already decided" };

export async function decideRevision(
  db: SupabaseClient,
  userId: string,
  revisionId: string,
  decision: Decision,
): Promise<DecideResult> {
  const { data: revision, error } = await db
    .from("chapter_revisions")
    .select("id, chapter_id, proposed_body_md, status")
    .eq("id", revisionId)
    .eq("user_id", userId)
    .single();
  if (error || !revision) return { ok: false, reason: "not found" };
  if (revision.status !== "proposed") return { ok: false, reason: "already decided" };

  const decidedAt = new Date().toISOString();

  if (decision === "declined") {
    // Nothing else moves. This is the whole of a decline.
    const { error: e } = await db
      .from("chapter_revisions")
      .update({ status: "declined", decided_at: decidedAt })
      .eq("id", revisionId);
    if (e) throw new Error(`revision decline failed: ${e.code ?? e.message}`);
    return { ok: true, status: "declined" };
  }

  const { data: chapter } = await db
    .from("chapters")
    .select("version")
    .eq("id", revision.chapter_id)
    .eq("user_id", userId)
    .single();

  const body = revision.proposed_body_md as string;
  const { error: ce } = await db
    .from("chapters")
    .update({
      body_md: body,
      version: (chapter?.version ?? 1) + 1,
      word_count: body.split(/\s+/).filter(Boolean).length,
      status: "canon",
      canon_at: decidedAt,
    })
    .eq("id", revision.chapter_id)
    .eq("user_id", userId);
  if (ce) throw new Error(`revision apply failed: ${ce.code ?? ce.message}`);

  const { error: re } = await db
    .from("chapter_revisions")
    .update({ status: "accepted", decided_at: decidedAt })
    .eq("id", revisionId);
  if (re) throw new Error(`revision accept failed: ${re.code ?? re.message}`);

  return { ok: true, status: "accepted" };
}
