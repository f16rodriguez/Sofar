// Session minutes (SPEC §3.6, M5).
//
// Every recorded minute costs transcription and inference, so the plan buys a
// number of them: 120 a month, resetting monthly, with 60-minute top-ups.
// Interview sessions are the ones that spend at that scale and the ones the
// cap refuses; onboarding happens once and a daily question is thirty
// seconds, so neither is refused — but both are metered, because a number
// that only counts some of the minutes is not a number anyone can act on.

import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "./log";

/** Minutes a month, per SPEC §3.6. */
export const MONTHLY_CAP = 120;
/** What one top-up buys. */
export const TOPUP_MINUTES = 60;

export interface MinuteBalance {
  used: number;
  cap: number;
  remaining: number;
  resetsAt: string;
}

/** The first moment of the next month, in UTC. */
function nextReset(from: Date): string {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * What is left this month, resetting the meter first if the month has turned.
 * The reset is lazy — done on read rather than by a job — so a person who has
 * not opened the app in three months is not owed three cron runs.
 */
export async function balance(
  db: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<MinuteBalance> {
  const { data, error } = await db
    .from("users")
    .select("session_minutes_used, session_minutes_reset_at")
    .eq("id", userId)
    .single();
  if (error || !data) throw new Error(`minute balance failed: ${error?.code ?? error?.message}`);

  let used = Number(data.session_minutes_used ?? 0);
  let resetsAt = (data.session_minutes_reset_at as string | null) ?? null;

  if (!resetsAt || new Date(resetsAt).getTime() <= now.getTime()) {
    resetsAt = nextReset(now);
    used = 0;
    const { error: e } = await db
      .from("users")
      .update({ session_minutes_used: 0, session_minutes_reset_at: resetsAt })
      .eq("id", userId);
    if (e) throw new Error(`minute reset failed: ${e.code ?? e.message}`);
  }

  return { used, cap: MONTHLY_CAP, remaining: Math.max(0, MONTHLY_CAP - used), resetsAt };
}

/**
 * Record minutes spent. Rounded up: a partial minute costs a whole one to
 * serve, and a meter that rounds in the person's favour every time is a meter
 * that reads zero all month.
 */
export async function spend(
  db: SupabaseClient,
  userId: string,
  minutes: number,
  now: Date = new Date(),
): Promise<MinuteBalance> {
  const current = await balance(db, userId, now);
  const used = current.used + Math.max(0, Math.ceil(minutes));
  const { error } = await db.from("users").update({ session_minutes_used: used }).eq("id", userId);
  if (error) throw new Error(`minute spend failed: ${error.code ?? error.message}`);
  log.info("minutes.spent", { userId, minutes: Math.ceil(minutes), used, cap: MONTHLY_CAP });
  return { ...current, used, remaining: Math.max(0, MONTHLY_CAP - used) };
}

/**
 * A top-up, credited against what has been used rather than raising the cap:
 * the cap is what the plan means, and a top-up is minutes bought back.
 */
export async function topUp(
  db: SupabaseClient,
  userId: string,
  minutes: number = TOPUP_MINUTES,
  now: Date = new Date(),
): Promise<MinuteBalance> {
  const current = await balance(db, userId, now);
  const used = Math.max(0, current.used - minutes);
  const { error } = await db.from("users").update({ session_minutes_used: used }).eq("id", userId);
  if (error) throw new Error(`top-up failed: ${error.code ?? error.message}`);
  log.info("minutes.topup", { userId, minutes, used });
  return { ...current, used, remaining: Math.max(0, MONTHLY_CAP - used) };
}

/** Which sessions the cap refuses (SPEC §3.6). */
export function isCapped(kind: string): boolean {
  return kind === "interview";
}
