// POST /api/interview/end — close the session and start the pipeline
// (SPEC §3.3 step 5).
//
// The session is marked processing and the response returns immediately. The
// person is told their chapters are being written; they are not held on a
// spinner while Opus works. What actually runs the pipeline is deliberately
// left as a separate step (D1: generation and delivery are separate concerns,
// and the founder may want a QA window before anything reaches a reader).

import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { requireUser, Unauthorized } from "@/lib/auth";
import { endSession } from "@/lib/interview/session";
import type { SessionState } from "@/lib/interview/machine";
import { log } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const userId = user.id;

    const { sessionId } = (await request.json()) as { sessionId?: string };
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const db = serviceClient();
    const { data: session, error } = await db
      .from("sessions")
      .select("state")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();
    if (error || !session) {
      return NextResponse.json({ error: "no such session" }, { status: 404 });
    }

    const state = session.state as SessionState;
    await endSession(db, sessionId, state);

    // The transcript the pipeline reads: this session's answers in order.
    const { data: answers } = await db
      .from("answers")
      .select("transcript, created_at, question_id")
      .eq("session_id", sessionId)
      .order("created_at");

    log.info("interview.end", {
      sessionId,
      answers: (answers ?? []).length,
      minutes: Number(((1080 - state.seconds_left) / 60).toFixed(1)),
    });

    return NextResponse.json({
      status: "processing",
      answers: (answers ?? []).length,
      minutes: Number(((1080 - state.seconds_left) / 60).toFixed(1)),
    });
  } catch (err) {
    if (err instanceof Unauthorized) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    log.error("interview.end", err);
    return NextResponse.json({ error: "could not end session" }, { status: 500 });
  }
}
