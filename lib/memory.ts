// Memory writes go through this module — no direct memory_* table writes from
// routes or pipeline steps (CLAUDE.md conventions). Every row links to the
// answer (and span) it came from. The merge step (SPEC §5.3) builds on these.

import type { SupabaseClient } from "@supabase/supabase-js";

async function insertRows(
  db: SupabaseClient,
  table: string,
  rows: object[],
): Promise<string[]> {
  if (rows.length === 0) return [];
  const { data, error } = await db.from(table).insert(rows).select("id");
  if (error) throw new Error(`${table} insert failed: ${error.code ?? error.message}`);
  return (data ?? []).map((r: { id: string }) => r.id);
}

export interface NewPerson {
  user_id: string;
  label: string;
  relationship?: string;
  first_answer_id?: string;
  quotes?: string[];
  embedding?: number[];
  /** True only when the user actually spoke this person's name (Finding 5). */
  may_name_in_prose?: boolean;
  /** How prose refers to them when naming is not permitted. */
  prose_reference?: string;
}

export interface NewPlace {
  user_id: string;
  label: string;
  when_text?: string;
  what_happened?: string;
  answer_id?: string;
}

export interface NewEvent {
  user_id: string;
  what: string;
  when_text?: string;
  when_date?: string;
  where_text?: string;
  who?: string[];
  outcome?: string;
  answer_id?: string;
  span_start?: number;
  span_end?: number;
  embedding?: number[];
}

export interface NewStance {
  user_id: string;
  statement: string;
  rationale?: string;
  origin_event_id?: string;
  stated_at?: string;
  answer_id?: string;
  embedding?: number[];
}

export interface NewCost {
  user_id: string;
  stance_id: string;
  what_it_cost: string;
  answer_id?: string;
}

export interface NewThread {
  user_id: string;
  label: string;
  description?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  /** The subject declined this topic (Finding 6). Never reaches prose. */
  off_record?: boolean;
}

export interface NewUnsaid {
  user_id: string;
  text: string;
  answer_id?: string;
  // allowed_in_book defaults to false and is only ever set true by the user.
}

export interface NewInferred {
  user_id: string;
  kind: string;
  content: string;
  answer_id?: string;
}

export const insertPeople = (db: SupabaseClient, rows: NewPerson[]) =>
  insertRows(db, "memory_people", rows);
export const insertPlaces = (db: SupabaseClient, rows: NewPlace[]) =>
  insertRows(db, "memory_places", rows);
export const insertEvents = (db: SupabaseClient, rows: NewEvent[]) =>
  insertRows(db, "memory_events", rows);
export const insertStances = (db: SupabaseClient, rows: NewStance[]) =>
  insertRows(db, "memory_stances", rows);
export const insertCosts = (db: SupabaseClient, rows: NewCost[]) =>
  insertRows(db, "memory_costs", rows);
export const insertThreads = (db: SupabaseClient, rows: NewThread[]) =>
  insertRows(db, "memory_threads", rows);
export const insertUnsaid = (db: SupabaseClient, rows: NewUnsaid[]) =>
  insertRows(db, "memory_unsaid", rows);
export const insertInferred = (db: SupabaseClient, rows: NewInferred[]) =>
  insertRows(db, "memory_inferred", rows);

export async function upsertVoiceProfile(
  db: SupabaseClient,
  userId: string,
  profile: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from("memory_voice")
    .upsert({ user_id: userId, profile });
  if (error) throw new Error(`memory_voice upsert failed: ${error.code ?? error.message}`);
}

export async function bumpThread(
  db: SupabaseClient,
  threadId: string,
  seenAt: string,
): Promise<void> {
  const { data, error } = await db
    .from("memory_threads")
    .select("mention_count")
    .eq("id", threadId)
    .single();
  if (error) throw new Error(`bumpThread read failed: ${error.code ?? error.message}`);
  const { error: updateError } = await db
    .from("memory_threads")
    .update({ mention_count: data.mention_count + 1, last_seen_at: seenAt })
    .eq("id", threadId);
  if (updateError)
    throw new Error(`bumpThread update failed: ${updateError.code ?? updateError.message}`);
}
