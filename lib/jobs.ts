// Background jobs (SPEC §3.9 delete, §3.10 audio retention; M6).
//
// Run daily by netlify/functions/jobs-daily.mts and on demand by
// scripts/jobs.ts. Everything here is idempotent: a job that runs twice does
// what it did once. Nothing here logs a transcript or a path that carries
// one — counts and ids only (SPEC §7).

import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "./log";

const BUCKET = "answer-audio";
const DAY_MS = 86_400_000;

export interface RetentionReport {
  candidates: number;
  deleted: number;
  failed: number;
  dryRun: boolean;
}

/**
 * Audio retention (SPEC §3.10): a recording is deleted sixty days after it
 * was made unless the person chose to keep it. The transcript stays; only
 * the voice goes. audio_deleted_at records that it happened.
 */
export async function runAudioRetention(
  db: SupabaseClient,
  opts: { now?: Date; days?: number; dryRun?: boolean; limit?: number } = {},
): Promise<RetentionReport> {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 60;
  const cutoff = new Date(now.getTime() - days * DAY_MS).toISOString();
  const dryRun = Boolean(opts.dryRun);

  const { data, error } = await db
    .from("answers")
    .select("id, audio_path, users!inner(keep_audio)")
    .not("audio_path", "is", null)
    .is("audio_deleted_at", null)
    .lt("created_at", cutoff)
    .eq("users.keep_audio", false)
    .limit(opts.limit ?? 500);
  if (error) throw new Error(`retention query failed: ${error.code ?? error.message}`);

  const rows = (data ?? []) as { id: string; audio_path: string }[];
  const report: RetentionReport = { candidates: rows.length, deleted: 0, failed: 0, dryRun };
  if (dryRun || rows.length === 0) return report;

  // Storage first, then the row: if the object removal fails the row keeps
  // its path and is retried tomorrow; if the row update fails the object is
  // already gone and tomorrow's update is a no-op on a missing object.
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error: rmError } = await db.storage.from(BUCKET).remove(batch.map((r) => r.audio_path));
    if (rmError) {
      report.failed += batch.length;
      log.error("retention.remove", rmError, { count: batch.length });
      continue;
    }
    const { error: upError } = await db
      .from("answers")
      .update({ audio_deleted_at: now.toISOString() })
      .in("id", batch.map((r) => r.id));
    if (upError) {
      report.failed += batch.length;
      log.error("retention.mark", upError, { count: batch.length });
      continue;
    }
    report.deleted += batch.length;
  }
  log.info("retention.audio", { ...report });
  return report;
}

/** Every object under a user's prefix, recursively. Storage lists one folder at a time. */
export async function listUserObjects(db: SupabaseClient, userId: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (prefix: string) => {
    let offset = 0;
    for (;;) {
      const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`storage list failed: ${error.message}`);
      const entries = data ?? [];
      for (const e of entries) {
        const full = prefix ? `${prefix}/${e.name}` : e.name;
        // A folder comes back with a null id; a file carries one.
        if (e.id) out.push(full);
        else await walk(full);
      }
      if (entries.length < 1000) break;
      offset += entries.length;
    }
  };
  await walk(userId);
  return out;
}

/** Enqueue an account deletion (SPEC §3.9). Runs on the next daily pass — within 24h. */
export async function enqueueAccountDeletion(db: SupabaseClient, userId: string): Promise<void> {
  const { data: existing } = await db
    .from("deletion_jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "account")
    .in("status", ["pending", "running"])
    .maybeSingle();
  if (existing) return;
  const { error } = await db
    .from("deletion_jobs")
    .insert({ user_id: userId, kind: "account", run_after: new Date().toISOString() });
  if (error) throw new Error(`deletion enqueue failed: ${error.code ?? error.message}`);
  log.info("account.delete.requested", { userId });
}

export interface DeletionReport {
  jobs: number;
  deleted: number;
  failed: number;
  dryRun: boolean;
}

/**
 * Account deletions: storage objects first, then the auth user, which
 * cascades through public.users to every row the person has — chapters,
 * answers, memory, the job itself. Zero rows, zero objects (SPEC §8 M6).
 * Stripe cancellation joins this when billing lands (M5).
 */
export async function runAccountDeletions(
  db: SupabaseClient,
  opts: { now?: Date; dryRun?: boolean } = {},
): Promise<DeletionReport> {
  const now = opts.now ?? new Date();
  const dryRun = Boolean(opts.dryRun);
  const { data: jobs, error } = await db
    .from("deletion_jobs")
    .select("id, user_id")
    .eq("kind", "account")
    .eq("status", "pending")
    .lte("run_after", now.toISOString())
    .limit(50);
  if (error) throw new Error(`deletion jobs query failed: ${error.code ?? error.message}`);

  const report: DeletionReport = { jobs: (jobs ?? []).length, deleted: 0, failed: 0, dryRun };
  if (dryRun) return report;

  for (const job of jobs ?? []) {
    await db.from("deletion_jobs").update({ status: "running", updated_at: now.toISOString() }).eq("id", job.id);
    try {
      const objects = await listUserObjects(db, job.user_id);
      for (let i = 0; i < objects.length; i += 100) {
        const { error: rmError } = await db.storage.from(BUCKET).remove(objects.slice(i, i + 100));
        if (rmError) throw new Error(`storage remove failed: ${rmError.message}`);
      }
      const { error: authError } = await db.auth.admin.deleteUser(job.user_id);
      if (authError) throw new Error(`auth delete failed: ${authError.message}`);
      report.deleted += 1;
      log.info("account.delete.done", { userId: job.user_id, objects: objects.length });
    } catch (err) {
      report.failed += 1;
      log.error("account.delete", err, { userId: job.user_id });
      await db.from("deletion_jobs").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", job.id);
    }
  }
  return report;
}
