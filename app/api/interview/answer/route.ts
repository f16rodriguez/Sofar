// POST /api/interview/answer — one turn of the interview (SPEC §3.3, §4).
//
// Takes the recorded answer, stores the audio in the private bucket,
// transcribes it, spends the clock, and returns the next question. The audio
// is posted to the server rather than uploaded from the browser: the bucket
// stays private with no client-side credentials, and a 20-second answer at
// 32 kbps is about 80 KB.

import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { recordAnswer, nextTurn, saveState, loadSeeds } from "@/lib/interview/session";
import type { SessionState } from "@/lib/interview/machine";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const userId = form.get("userId");
    const sessionId = form.get("sessionId");
    const questionText = form.get("question");
    const audio = form.get("audio");
    const typed = form.get("text");

    if (typeof userId !== "string" || typeof sessionId !== "string") {
      return NextResponse.json({ error: "userId and sessionId required" }, { status: 400 });
    }

    const db = serviceClient();

    const { data: session, error } = await db
      .from("sessions")
      .select("state, status")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();
    if (error || !session) {
      return NextResponse.json({ error: "no such session" }, { status: 404 });
    }
    if (session.status !== "active") {
      return NextResponse.json({ error: "session already ended" }, { status: 409 });
    }
    const state = session.state as SessionState;

    // Audio goes to <user_id>/<session_id>/<timestamp>.webm — the storage
    // policy keys on that first path segment, so a user can only ever reach
    // their own recordings.
    let stored: { bytes: Uint8Array; mimeType: string; path: string } | undefined;
    if (audio instanceof File && audio.size > 0) {
      const bytes = new Uint8Array(await audio.arrayBuffer());
      const path = `${userId}/${sessionId}/${Date.now()}.webm`;
      const { error: uploadError } = await db.storage
        .from("answer-audio")
        .upload(path, bytes, { contentType: audio.type || "audio/webm" });
      if (uploadError) throw new Error(`audio upload failed: ${uploadError.message}`);
      stored = { bytes, mimeType: audio.type || "audio/webm", path };
    }

    const recorded = await recordAnswer(db, {
      userId,
      sessionId,
      state,
      audio: stored,
      text: typeof typed === "string" ? typed : undefined,
    });

    const seeds = await loadSeeds(db);
    const turn = await nextTurn(db, {
      state: recorded.state,
      seeds,
      lastQuestion: typeof questionText === "string" ? questionText : undefined,
      lastAnswer: recorded.transcript,
    });

    await saveState(db, sessionId, turn.state);

    return NextResponse.json({
      // The person sees what was heard — a wrong transcript they can see is
      // recoverable; one they cannot is a wrong sentence in their book.
      transcript: recorded.transcript,
      question: turn.question,
      announceLast: turn.announce_last,
      secondsLeft: turn.state.seconds_left,
      done: turn.done,
    });
  } catch (err) {
    log.error("interview.answer", err);
    return NextResponse.json({ error: "could not record answer" }, { status: 500 });
  }
}
