// Streak and marks (SPEC §6 "streak strip and marks"; concept: forgiving
// streaks). A day counts when it has an answer, in the person's own time
// zone. The streak is alive if today or yesterday has one — a day is not
// lost at midnight, only after a full day of silence. Marks are earned once
// and never taken away (unique per key).

import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate, safeZone } from "./time";

export interface Streak {
  days: number;
  alive: boolean;
  answeredToday: boolean;
  totalDays: number;
}

export async function computeStreak(db: SupabaseClient, userId: string, timeZone: string, now = new Date()): Promise<Streak> {
  const zone = safeZone(timeZone);
  const { data } = await db
    .from("answers")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1000);
  const days = new Set((data ?? []).map((a) => localDate(new Date(a.created_at as string), zone)));
  const today = localDate(now, zone);
  const yesterday = localDate(new Date(now.getTime() - 86_400_000), zone);
  const answeredToday = days.has(today);
  const alive = answeredToday || days.has(yesterday);
  let count = 0;
  if (alive) {
    let cursor = answeredToday ? now : new Date(now.getTime() - 86_400_000);
    while (days.has(localDate(cursor, zone))) {
      count += 1;
      cursor = new Date(cursor.getTime() - 86_400_000);
    }
  }
  return { days: count, alive, answeredToday, totalDays: days.size };
}

export const MARKS = {
  first_three: "The first three chapters",
  thirty_days: "Thirty days",
  spine_found: "The spine, found",
  hundred_pages: "A hundred pages",
  one_year: "One year",
} as const;
export type MarkKey = keyof typeof MARKS;

/** Award what has been earned. Idempotent: the unique (user, key) makes a second award a no-op. */
export async function awardMarks(db: SupabaseClient, userId: string, streak: Streak): Promise<MarkKey[]> {
  const { data: chapters } = await db.from("chapters").select("word_count, kind").eq("user_id", userId);
  const rows = chapters ?? [];
  const realChapters = rows.filter((c) => c.kind !== "sofar").length;
  const pages = rows.reduce((sum, c) => sum + (Number(c.word_count) || 0), 0) / 275;

  const earned: MarkKey[] = [];
  if (realChapters >= 3) earned.push("first_three");
  if (streak.days >= 30) earned.push("thirty_days");
  if (pages >= 100) earned.push("hundred_pages");
  if (earned.length === 0) return [];

  const { error } = await db
    .from("marks")
    .upsert(earned.map((key) => ({ user_id: userId, key })), { onConflict: "user_id,key", ignoreDuplicates: true });
  if (error) throw new Error(`marks upsert failed: ${error.code ?? error.message}`);
  return earned;
}

export async function earnedMarks(db: SupabaseClient, userId: string): Promise<{ key: MarkKey; earned_at: string }[]> {
  const { data } = await db.from("marks").select("key, earned_at").eq("user_id", userId).order("earned_at");
  return (data ?? []) as { key: MarkKey; earned_at: string }[];
}
