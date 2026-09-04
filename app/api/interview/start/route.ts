// POST /api/interview/start — begin an onboarding session (SPEC §3.3).
//
// Returns the session id and the first question. All state lives in the
// sessions row; the client holds nothing but the id, so a refresh, a dropped
// connection or a switched device resumes exactly where the person was.

import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { requireUser, ensureProfile, Unauthorized } from "@/lib/auth";
import { startSession, loadSeeds, nextTurn } from "@/lib/interview/session";
import { log } from "@/lib/log";
import { allow, LIMITS } from "@/lib/ratelimit";
import { tooMany } from "@/lib/ratelimit-response";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    await ensureProfile(user);

    const db = serviceClient();
    const gate = await allow(db, { action: "interview_start", subject: user.id, ...LIMITS.interview_start });
    if (!gate.allowed) return tooMany(gate);

    // Block 0 must be done and consent given (landing promise; SPEC §7).
    const { data: profile } = await db
      .from("users")
      .select("pronoun, birthplace, recording_consent_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.pronoun || !profile?.birthplace || !profile?.recording_consent_at) {
      return NextResponse.json({ error: "foundations and consent required" }, { status: 412 });
    }

    const seeds = await loadSeeds(db);
    if (seeds.length === 0) {
      return NextResponse.json(
        { error: "no seed questions loaded" },
        { status: 500 },
      );
    }

    const { sessionId, state } = await startSession(db, user.id);
    const turn = await nextTurn(db, { state, seeds });

    return NextResponse.json({
      sessionId,
      question: turn.question,
      announceLast: turn.announce_last,
      secondsLeft: turn.state.seconds_left,
      done: turn.done,
    });
  } catch (err) {
    if (err instanceof Unauthorized) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    // SPEC §7: never let transcript or answer content reach a log line.
    log.error("interview.start", err);
    return NextResponse.json({ error: "could not start session" }, { status: 500 });
  }
}
