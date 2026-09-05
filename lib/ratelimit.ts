// Rate limits (SPEC §8 M6 hardening). Fixed windows in one small table,
// keyed by action and subject (a user id, or an email for sign-in). Every
// answer costs transcription and inference, so a runaway client — a stuck
// retry loop, a script — is a bill, and a limit is the cheap cap on it.
//
// Best effort by design: two requests racing on the same window may both
// pass. The limit is a cap on abuse, not an accounting system.
//
// No Next import here: the standalone Netlify functions share this module,
// and next/server is not in their bundle. The 429 response lives in
// lib/ratelimit-response.ts.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface LimitOptions {
  action: string;
  subject: string;
  limit: number;
  windowSeconds: number;
  now?: Date;
}

/**
 * The limiter guards cost, not correctness, so it fails open: if the counter
 * cannot be reached — no service role in this environment, a transient
 * database error — the request proceeds. A missing key once turned the
 * sign-in page into a server error because the limiter threw before the
 * magic link was ever sent; a cap on spending must never be the thing that
 * takes a page down.
 */
export async function allowSafe(
  makeDb: () => SupabaseClient,
  opts: LimitOptions,
): Promise<LimitResult> {
  try {
    return await allow(makeDb(), opts);
  } catch {
    return { allowed: true, remaining: -1, retryAfterSeconds: 0 };
  }
}

export async function allow(
  db: SupabaseClient,
  opts: LimitOptions,
): Promise<LimitResult> {
  const now = opts.now ?? new Date();
  const key = `${opts.action}:${opts.subject}`;
  const { data } = await db
    .from("rate_limits")
    .select("count, window_start")
    .eq("key", key)
    .maybeSingle();

  const started = data ? new Date(data.window_start as string).getTime() : 0;
  const expired = !data || started + opts.windowSeconds * 1000 <= now.getTime();

  if (expired) {
    await db
      .from("rate_limits")
      .upsert({ key, count: 1, window_start: now.toISOString() }, { onConflict: "key" });
    return { allowed: true, remaining: opts.limit - 1, retryAfterSeconds: 0 };
  }

  const count = Number(data.count ?? 0);
  if (count >= opts.limit) {
    const retry = Math.max(1, Math.ceil((started + opts.windowSeconds * 1000 - now.getTime()) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds: retry };
  }

  await db.from("rate_limits").update({ count: count + 1 }).eq("key", key);
  return { allowed: true, remaining: opts.limit - count - 1, retryAfterSeconds: 0 };
}

/** Per-action limits in one place, so they can be read and argued about. */
export const LIMITS = {
  interview_start: { limit: 6, windowSeconds: 3600 },
  interview_answer: { limit: 40, windowSeconds: 600 },
  revision: { limit: 30, windowSeconds: 600 },
  export: { limit: 10, windowSeconds: 3600 },
  account_delete: { limit: 3, windowSeconds: 3600 },
  signin_link: { limit: 5, windowSeconds: 3600 },
} as const;
