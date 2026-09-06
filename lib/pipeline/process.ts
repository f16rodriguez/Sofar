// What happens after someone answers (SPEC §3.4).
//
// Until now the app recorded answers and nothing read them: audio was stored,
// transcribed, and left there, and the book only learned about it when the
// CLI was run by hand. This is the path from an answer to a book that has
// changed because of it — extraction, merge, a chapter when enough has
// accumulated, and a revision where new material contradicts what is already
// written.
//
// It runs after the session is closed, never inside the request that recorded
// the answer: a person who has just spoken should not be held on a spinner
// while three model calls resolve, and D1 keeps generation separate from
// delivery so there is somewhere to stand between the two.

import type { SupabaseClient } from "@supabase/supabase-js";
import { extract } from "./extract";
import { merge } from "./merge";
import {
  findAngles,
  writeChapter,
  type Foundations,
  type MemoryRow,
  type PersonRow,
} from "./chapter";
import { proposeRevision } from "./revision";
import { log } from "../log";

/**
 * Answers since the last chapter before the next one is written. SPEC §2 puts
 * it between three and seven; five is far enough in that a chapter has
 * something to be about, close enough that the book visibly moves.
 */
export const UNLOCK_THRESHOLD = 5;

/** The session as the pipeline reads it: what was asked, and what was said. */
export async function transcriptFromSession(
  db: SupabaseClient,
  sessionId: string,
): Promise<{ transcript: string; userId: string; kind: string; answerIds: string[] }> {
  const { data: session, error } = await db
    .from("sessions")
    .select("user_id, kind")
    .eq("id", sessionId)
    .single();
  if (error || !session) throw new Error(`no such session: ${sessionId}`);

  const { data: answers } = await db
    .from("answers")
    .select("id, transcript, question_id, created_at")
    .eq("session_id", sessionId)
    .order("created_at");

  const rows = (answers ?? []) as {
    id: string;
    transcript: string | null;
    question_id: string | null;
  }[];

  const questionIds = rows.map((a) => a.question_id).filter((id): id is string => Boolean(id));
  const questions = new Map<string, string>();
  if (questionIds.length > 0) {
    const { data: qs } = await db.from("questions").select("id, text").in("id", questionIds);
    for (const q of qs ?? []) questions.set(q.id as string, q.text as string);
  }

  const lines: string[] = [`=== ${String(session.kind).toUpperCase()} SESSION ===`, ""];
  for (const a of rows) {
    const q = a.question_id ? questions.get(a.question_id) : undefined;
    if (q) lines.push(`Q: ${q}`);
    lines.push(`A: ${a.transcript ?? ""}`, "");
  }

  return {
    transcript: lines.join("\n"),
    userId: session.user_id as string,
    kind: session.kind as string,
    answerIds: rows.map((a) => a.id),
  };
}

/** Block 0 as the writer sees it (SPEC §5.4 foundations). */
export async function loadFoundations(db: SupabaseClient, userId: string): Promise<Foundations> {
  const { data: user, error } = await db.from("users").select("*").eq("id", userId).single();
  if (error || !user) throw new Error(`no such user: ${userId}`);
  return {
    book_name: user.book_name,
    pronoun: user.pronoun ?? "they",
    age: user.age,
    birthplace: user.birthplace,
    current_city: user.current_city,
    prior_cities: user.prior_cities ?? [],
    occupation: user.occupation,
    household: user.household,
    family_of_origin: user.family_of_origin,
    style: user.style ?? "third",
  };
}

/**
 * The memory layer as prose sees it. memory_inferred and memory_unsaid are
 * deliberately absent: nothing inferred reaches prose (CLAUDE.md).
 */
export async function loadMemory(
  db: SupabaseClient,
  userId: string,
): Promise<{ rows: MemoryRow[]; people: PersonRow[]; voice: Record<string, unknown> }> {
  const [people, places, events, stances, costs, voiceRow] = await Promise.all([
    db.from("memory_people").select("*").eq("user_id", userId),
    db.from("memory_places").select("*").eq("user_id", userId),
    db.from("memory_events").select("*").eq("user_id", userId),
    db.from("memory_stances").select("*").eq("user_id", userId),
    db.from("memory_costs").select("*").eq("user_id", userId),
    db.from("memory_voice").select("profile").eq("user_id", userId).maybeSingle(),
  ]);

  return {
    people: (people.data ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      relationship: p.relationship,
      quotes: Array.isArray(p.quotes) ? p.quotes : [],
      may_name_in_prose: p.may_name_in_prose,
      prose_reference: p.prose_reference,
    })),
    rows: [
      ...(places.data ?? []).map((r) => ({
        id: r.id as string,
        kind: "place",
        text: [r.label, r.when_text, r.what_happened].filter(Boolean).join(" — "),
        quote: (r.source_quote as string | null) ?? undefined,
      })),
      ...(events.data ?? []).map((r) => ({
        id: r.id as string,
        kind: "event",
        text: [r.what, r.when_text, r.where_text, r.outcome].filter(Boolean).join(" — "),
        quote: (r.source_quote as string | null) ?? undefined,
      })),
      ...(stances.data ?? []).map((r) => ({
        id: r.id as string,
        kind: "stance",
        text: [r.statement, r.rationale].filter(Boolean).join(" — because "),
        quote: (r.source_quote as string | null) ?? undefined,
      })),
      ...(costs.data ?? []).map((r) => ({
        id: r.id as string,
        kind: "cost",
        text: r.what_it_cost as string,
        quote: (r.source_quote as string | null) ?? undefined,
      })),
    ],
    voice: (voiceRow.data?.profile as Record<string, unknown>) ?? {},
  };
}

/** Answers recorded since the newest chapter was written. */
export async function answersSinceLastChapter(db: SupabaseClient, userId: string): Promise<number> {
  const { data: last } = await db
    .from("chapters")
    .select("created_at")
    .eq("user_id", userId)
    .neq("kind", "sofar")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let q = db.from("answers").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (last?.created_at) q = q.gt("created_at", last.created_at as string);
  const { count } = await q;
  return count ?? 0;
}

export interface ProcessResult {
  sessionId: string;
  userId?: string;
  answers: number;
  created?: Record<string, number>;
  refused?: number;
  /** Written this run, when the threshold was met. */
  chapter?: { number: number; title: string };
  /** How many more answers before the next chapter, when none was written. */
  answersUntilChapter?: number;
  revisions: number;
  skipped?: string;
}

/**
 * Read one closed session into the book.
 *
 * Idempotent by status: a session is only processed while it is `processing`,
 * and it lands on `done` or `failed`, so a job that runs twice does not pay
 * for the same session twice.
 */
export async function processSession(
  db: SupabaseClient,
  sessionId: string,
  opts: { writeChapters?: boolean } = {},
): Promise<ProcessResult> {
  const { data: session } = await db
    .from("sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { sessionId, answers: 0, revisions: 0, skipped: "no such session" };
  if (session.status !== "processing") {
    return { sessionId, answers: 0, revisions: 0, skipped: `status is ${session.status}` };
  }

  const { transcript, userId, answerIds } = await transcriptFromSession(db, sessionId);
  if (answerIds.length === 0) {
    await db.from("sessions").update({ status: "done" }).eq("id", sessionId);
    return { sessionId, userId, answers: 0, revisions: 0, skipped: "nothing was answered" };
  }

  try {
    const foundations = await loadFoundations(db, userId);
    const { extraction, dropped } = await extract({ transcript });
    if (dropped.length > 0) {
      // Items whose quote was not in the transcript verbatim. Counted, never
      // quoted: SPEC §7 keeps transcript content out of logs.
      log.info("session.extract.dropped", { sessionId, dropped: dropped.length });
    }

    // Rows carry the last answer of the session: extraction reads the whole
    // transcript at once, so a finer attribution than "this sitting" would be
    // a guess, and a wrong answer id is worse than a coarse one.
    const merged = await merge(db, userId, answerIds[answerIds.length - 1], extraction);
    const { rows, people, voice } = await loadMemory(db, userId);
    const newIds = new Set(merged.placed.map((r) => r.id));
    const rowById = new Map(rows.map((r) => [r.id, r]));

    const result: ProcessResult = {
      sessionId,
      userId,
      answers: answerIds.length,
      created: merged.created,
      refused: merged.refused,
      revisions: 0,
    };

    // --- a chapter, when enough has accumulated (SPEC §3.4) ---------------
    const since = await answersSinceLastChapter(db, userId);
    if (opts.writeChapters === false || since < UNLOCK_THRESHOLD) {
      result.answersUntilChapter = Math.max(0, UNLOCK_THRESHOLD - since);
    } else {
      const written = await writeNextChapter(db, { userId, rows, people, foundations, voice, answerIds });
      if (written) result.chapter = written;
      else result.answersUntilChapter = 0;
    }

    // --- revisions against what is already canon (SPEC §5.5) --------------
    const { data: canon } = await db
      .from("chapters")
      .select("id, title, body_md, source_memory_ids")
      .eq("user_id", userId)
      .eq("status", "canon")
      .neq("kind", "sofar");

    for (const chapter of canon ?? []) {
      const sourceIds: string[] = (chapter.source_memory_ids as string[]) ?? [];
      const sourceRows = sourceIds.map((id) => rowById.get(id)).filter((r): r is MemoryRow => Boolean(r));
      const newRows = rows.filter((r) => newIds.has(r.id) && !sourceIds.includes(r.id));
      if (sourceRows.length === 0 || newRows.length === 0) continue;

      const proposal = await proposeRevision(db, {
        userId,
        chapter: {
          id: chapter.id as string,
          title: chapter.title as string,
          body_md: chapter.body_md as string,
          source_memory_ids: sourceIds,
        },
        newRows,
        sourceRows,
        people,
        foundations,
        triggerAnswerIds: answerIds,
      });
      if (proposal.proposed) result.revisions += 1;
    }

    await db.from("sessions").update({ status: "done" }).eq("id", sessionId);
    log.info("session.processed", {
      sessionId,
      answers: result.answers,
      chapter: Boolean(result.chapter),
      revisions: result.revisions,
    });
    return result;
  } catch (err) {
    await db.from("sessions").update({ status: "failed" }).eq("id", sessionId);
    log.error("session.process", err, { sessionId });
    throw err;
  }
}

/**
 * The next chapter, chosen by the editor rather than by an outline.
 *
 * The first three chapters have outlines because a book needs a beginning
 * (D3); after that the record decides what is worth a chapter, and the
 * editor's own line becomes the brief. Sonnet, not Opus: the prose floor is
 * Sonnet-class and only the opening chapters and rewrites earn Opus
 * (CLAUDE.md).
 */
async function writeNextChapter(
  db: SupabaseClient,
  opts: {
    userId: string;
    rows: MemoryRow[];
    people: PersonRow[];
    foundations: Foundations;
    voice: Record<string, unknown>;
    answerIds: string[];
  },
): Promise<{ number: number; title: string } | null> {
  const { data: declinedRows } = await db
    .from("memory_threads")
    .select("label")
    .eq("user_id", opts.userId)
    .eq("off_record", true);
  const declined = (declinedRows ?? []).map((t: { label: string }) => t.label);

  const angles = await findAngles({ rows: opts.rows, people: opts.people, foundations: opts.foundations, declined });

  // What has already been written, so a chapter is not written twice.
  const { data: existing } = await db
    .from("chapters")
    .select("number, title, source_memory_ids")
    .eq("user_id", opts.userId)
    .neq("kind", "sofar");
  const used = new Set((existing ?? []).flatMap((c) => (c.source_memory_ids as string[]) ?? []));
  const numbers = (existing ?? []).map((c) => Number(c.number ?? 0));
  const next = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;

  // The best angle the book does not already cover: writable, and mostly made
  // of rows no chapter has used.
  const candidates = angles
    .filter((a) => a.writable && a.rows.length > 0)
    .map((a) => ({ angle: a, fresh: a.rows.filter((id) => !used.has(id)).length }))
    .filter((c) => c.fresh >= 2)
    .sort((a, b) => b.fresh - a.fresh);
  const chosen = candidates[0]?.angle;
  if (!chosen) return null;

  const kept = opts.rows.filter((r) => chosen.rows.includes(r.id));
  const result = await writeChapter({
    outline: [
      `CHAPTER ${next} — one thing, whole.`,
      "Open in scene: a real moment, at a real time, in a real place, from the rows.",
      "Stay on the one thing the editor's line names. A chapter is not a summary",
      "of everything that has happened since the last one.",
      "End where the record ends. If it ends unresolved, leave it unresolved —",
      "do not supply an ending the person has not lived yet.",
    ].join("\n"),
    story: chosen.line,
    rows: kept,
    people: opts.people,
    foundations: opts.foundations,
    voice: opts.voice,
  });

  const words = result.draft.body_md.split(/\s+/).filter(Boolean).length;
  const { error } = await db.from("chapters").insert({
    user_id: opts.userId,
    number: next,
    title: result.draft.title,
    kind: "chapter",
    body_md: result.draft.body_md,
    status: "draft",
    model: result.model,
    source_answer_ids: opts.answerIds,
    source_memory_ids: result.draft.source_memory_ids,
    word_count: words,
  });
  if (error) throw new Error(`chapter insert failed: ${error.code ?? error.message}`);
  return { number: next, title: result.draft.title };
}
