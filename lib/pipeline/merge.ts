// Merge (SPEC §5.3): fold a new extraction into the user's existing memory
// without duplicating what is already there.
//
// SPEC specifies embedding similarity > 0.88 plus a model confirm. No
// embedding provider is chosen yet (the Anthropic API offers none, and adding
// a second vendor is a decision, not an implementation detail), so this uses
// deterministic token similarity for the obvious cases and asks Sonnet about
// the genuinely ambiguous ones. The embedding columns stay null and the
// thresholds below are the seam where they slot in.
//
// This is what makes the pipeline idempotent: running the same transcript
// twice must not double the memory layer (M1 acceptance test).

import type { SupabaseClient } from "@supabase/supabase-js";
import { complete, loadPrompt } from "../llm";
import * as memory from "../memory";
import { SameEntitySchema, type Extraction } from "./schema";

const CERTAIN = 0.85; // at or above: same thing, no model call
const PLAUSIBLE = 0.5; // between: ask the model

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return a.trim() === b.trim() ? 1 : 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / new Set([...ta, ...tb]).size;
}

interface Existing {
  id: string;
  text: string;
}

/** Find an existing row this item is the same as, or null to create it. */
async function resolve(
  item: string,
  existing: Existing[],
  kind: string,
): Promise<string | null> {
  let best: { row: Existing; score: number } | null = null;
  for (const row of existing) {
    const score = similarity(item, row.text);
    if (!best || score > best.score) best = { row, score };
  }
  if (!best || best.score < PLAUSIBLE) return null;
  if (best.score >= CERTAIN) return best.row.id;

  const verdict = await complete({
    task: "entity_resolution",
    system: loadPrompt("entity-resolution"),
    prompt: [
      `Kind: ${kind}`,
      `Existing: ${best.row.text}`,
      `New: ${item}`,
      "",
      "Are these the same one, referred to twice?",
    ].join("\n"),
    schema: SameEntitySchema,
    maxTokens: 1000,
  });
  return verdict.same ? best.row.id : null;
}

async function load(
  db: SupabaseClient,
  table: string,
  userId: string,
  column: string,
): Promise<Existing[]> {
  const { data, error } = await db
    .from(table)
    .select(`id, ${column}`)
    .eq("user_id", userId);
  if (error) throw new Error(`load ${table} failed: ${error.code ?? error.message}`);
  // The column is interpolated, so supabase-js cannot type the row shape.
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    text: (r[column] as string) ?? "",
  }));
}

export interface PlacedRow {
  id: string;
  kind: "person" | "place" | "event" | "stance" | "cost";
  /** Offset into the transcript, so rows can be clustered by block. */
  span_start: number;
}

export interface MergeResult {
  created: Record<string, number>;
  matched: Record<string, number>;
  /** label → row id, for every person now on record. */
  peopleIds: Map<string, string>;
  memoryIds: string[];
  /** Every row this extraction produced or matched, with its transcript position. */
  placed: PlacedRow[];
}

export async function merge(
  db: SupabaseClient,
  userId: string,
  answerId: string,
  extraction: Extraction,
): Promise<MergeResult> {
  const created: Record<string, number> = {};
  const matched: Record<string, number> = {};

  // When was this said? Every stance carries the timestamp of the answer it
  // came from — the belief-change interludes (concept §3) need to know when a
  // belief was held, not just that it was.
  const { data: answer } = await db
    .from("answers")
    .select("created_at")
    .eq("id", answerId)
    .single();
  const statedAt: string = answer?.created_at ?? new Date().toISOString();
  const memoryIds: string[] = [];
  const placed: PlacedRow[] = [];
  const bump = (rec: Record<string, number>, k: string) => (rec[k] = (rec[k] ?? 0) + 1);

  // --- people -------------------------------------------------------------
  const peopleIds = new Map<string, string>();
  const existingPeople = await load(db, "memory_people", userId, "label");
  for (const person of extraction.people) {
    const hit = await resolve(person.label, existingPeople, "person");
    if (hit) {
      peopleIds.set(person.label, hit);
      memoryIds.push(hit);
      placed.push({ id: hit, kind: "person", span_start: person.span_start });
      bump(matched, "people");
      continue;
    }
    const [id] = await memory.insertPeople(db, [
      {
        user_id: userId,
        label: person.label,
        relationship: person.relationship ?? undefined,
        first_answer_id: answerId,
        quotes: person.quotes,
        source_quote: person.source_quote,
        may_name_in_prose: person.may_name_in_prose,
        prose_reference: person.prose_reference ?? undefined,
      },
    ]);
    peopleIds.set(person.label, id);
    existingPeople.push({ id, text: person.label });
    memoryIds.push(id);
    placed.push({ id, kind: "person", span_start: person.span_start });
    bump(created, "people");
  }

  // --- places -------------------------------------------------------------
  const existingPlaces = await load(db, "memory_places", userId, "label");
  for (const place of extraction.places) {
    const hit = await resolve(place.label, existingPlaces, "place");
    if (hit) {
      memoryIds.push(hit);
      placed.push({ id: hit, kind: "place", span_start: place.span_start });
      bump(matched, "places");
      continue;
    }
    const [id] = await memory.insertPlaces(db, [
      {
        user_id: userId,
        label: place.label,
        when_text: place.when_text ?? undefined,
        what_happened: place.what_happened ?? undefined,
        source_quote: place.source_quote,
        answer_id: answerId,
      },
    ]);
    existingPlaces.push({ id, text: place.label });
    memoryIds.push(id);
    placed.push({ id, kind: "place", span_start: place.span_start });
    bump(created, "places");
  }

  // --- events -------------------------------------------------------------
  const eventIds = new Map<string, string>();
  const existingEvents = await load(db, "memory_events", userId, "what");
  for (const event of extraction.events) {
    const hit = await resolve(event.what, existingEvents, "event");
    if (hit) {
      eventIds.set(event.what, hit);
      memoryIds.push(hit);
      placed.push({ id: hit, kind: "event", span_start: event.span_start });
      bump(matched, "events");
      continue;
    }
    const [id] = await memory.insertEvents(db, [
      {
        user_id: userId,
        what: event.what,
        when_text: event.when_text ?? undefined,
        when_date: event.when_date ?? undefined,
        where_text: event.where_text ?? undefined,
        who: event.who.map((l) => peopleIds.get(l)).filter((v): v is string => !!v),
        outcome: event.outcome ?? undefined,
        answer_id: answerId,
        span_start: event.span_start,
        span_end: event.span_end,
        source_quote: event.source_quote,
      },
    ]);
    eventIds.set(event.what, id);
    existingEvents.push({ id, text: event.what });
    memoryIds.push(id);
    placed.push({ id, kind: "event", span_start: event.span_start });
    bump(created, "events");
  }

  // --- stances ------------------------------------------------------------
  const stanceIds = new Map<string, string>();
  const existingStances = await load(db, "memory_stances", userId, "statement");
  for (const stance of extraction.stances) {
    const hit = await resolve(stance.statement, existingStances, "stance");
    if (hit) {
      stanceIds.set(stance.statement, hit);
      memoryIds.push(hit);
      placed.push({ id: hit, kind: "stance", span_start: stance.span_start });
      bump(matched, "stances");
      continue;
    }
    const [id] = await memory.insertStances(db, [
      {
        user_id: userId,
        statement: stance.statement,
        rationale: stance.rationale ?? undefined,
        source_quote: stance.source_quote,
        origin_event_id: stance.origin_event
          ? eventIds.get(stance.origin_event)
          : undefined,
        stated_at: statedAt,
        answer_id: answerId,
      },
    ]);
    stanceIds.set(stance.statement, id);
    existingStances.push({ id, text: stance.statement });
    memoryIds.push(id);
    placed.push({ id, kind: "stance", span_start: stance.span_start });
    bump(created, "stances");
  }

  // --- costs --------------------------------------------------------------
  const existingCosts = await load(db, "memory_costs", userId, "what_it_cost");
  for (const cost of extraction.costs) {
    const stanceId = stanceIds.get(cost.stance_statement);
    if (!stanceId) continue; // a cost with no stance has nothing to attach to
    const hit = await resolve(cost.what_it_cost, existingCosts, "cost");
    if (hit) {
      placed.push({ id: hit, kind: "cost", span_start: cost.span_start });
      bump(matched, "costs");
      continue;
    }
    const [id] = await memory.insertCosts(db, [
      {
        user_id: userId,
        stance_id: stanceId,
        what_it_cost: cost.what_it_cost,
        source_quote: cost.source_quote,
        answer_id: answerId,
      },
    ]);
    existingCosts.push({ id, text: cost.what_it_cost });
    memoryIds.push(id);
    placed.push({ id, kind: "cost", span_start: cost.span_start });
    bump(created, "costs");
  }

  // --- threads: mentioned twice without resolution → increment ------------
  const existingThreads = await load(db, "memory_threads", userId, "label");
  const now = new Date().toISOString();
  for (const thread of extraction.open_threads) {
    const hit = await resolve(thread.label, existingThreads, "thread");
    if (hit) {
      await memory.bumpThread(db, hit, now);
      bump(matched, "threads");
      continue;
    }
    const [id] = await memory.insertThreads(db, [
      {
        user_id: userId,
        label: thread.label,
        description: thread.description,
        source_quote: thread.source_quote,
        first_seen_at: now,
        last_seen_at: now,
        off_record: thread.off_record,
      },
    ]);
    existingThreads.push({ id, text: thread.label });
    bump(created, "threads");
  }

  // --- voice: one row per user, always the latest reading -----------------
  await memory.upsertVoiceProfile(db, userId, extraction.voice);

  // --- unsaid / inferred: never reach prose; dedupe on text ---------------
  const existingUnsaid = await load(db, "memory_unsaid", userId, "text");
  for (const u of extraction.unsaid) {
    if (await resolve(u.text, existingUnsaid, "unsaid")) {
      bump(matched, "unsaid");
      continue;
    }
    const [id] = await memory.insertUnsaid(db, [
      { user_id: userId, text: u.text, answer_id: answerId },
    ]);
    existingUnsaid.push({ id, text: u.text });
    bump(created, "unsaid");
  }

  const existingInferred = await load(db, "memory_inferred", userId, "content");
  for (const i of extraction.inferred) {
    if (await resolve(i.content, existingInferred, "inferred")) {
      bump(matched, "inferred");
      continue;
    }
    const [id] = await memory.insertInferred(db, [
      { user_id: userId, kind: i.kind, content: i.content, answer_id: answerId },
    ]);
    existingInferred.push({ id, text: i.content });
    bump(created, "inferred");
  }

  return { created, matched, peopleIds, memoryIds, placed };
}
