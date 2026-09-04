// POST /api/interview/start — begin an onboarding session (SPEC §3.3).
//
// Returns the session id and the first question. All state lives in the
// sessions row; the client holds nothing but the id, so a refresh, a dropped
// connection or a switched device resumes exactly where the person was.

import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { startSession, loadSeeds, nextTurn } from "@/lib/interview/session";
import { log } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userId } = (await request.json()) as { userId?: string };
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const db = serviceClient();
    const seeds = await loadSeeds(db);
    if (seeds.length === 0) {
      return NextResponse.json(
        { error: "no seed questions loaded" },
        { status: 500 },
      );
    }

    const { sessionId, state } = await startSession(db, userId);
    const turn = await nextTurn(db, { state, seeds });

    return NextResponse.json({
      sessionId,
      question: turn.question,
      announceLast: turn.announce_last,
      secondsLeft: turn.state.seconds_left,
      done: turn.done,
    });
  } catch (err) {
    // SPEC §7: never let transcript or answer content reach a log line.
    log.error("interview.start", err);
    return NextResponse.json({ error: "could not start session" }, { status: 500 });
  }
}
