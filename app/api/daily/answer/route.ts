// POST /api/daily/answer — the thirty-second answer (SPEC §3.4). Audio or
// text, stored and transcribed the same way an interview turn is, under a
// one-answer session of kind daily. Extraction and merge on the answer run
// as the session is processed (scripts/sofar.ts run --session), the same
// step the interview uses; delivery stays separate from generation (D1).

import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { requireUser, Unauthorized } from "@/lib/auth";
import { recordAnswer, startSession, endSession } from "@/lib/interview/session";
import { allow, tooMany } from "@/lib/ratelimit";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const db = serviceClient();
    const gate = await allow(db, { action: "daily_answer", subject: user.id, limit: 10, windowSeconds: 600 });
    if (!gate.allowed) return tooMany(gate);

    const form = await request.formData();
    const questionId = form.get("questionId");
    const audio = form.get("audio");
    const typed = form.get("text");
    if (typeof questionId !== "string" || !questionId) {
      return NextResponse.json({ error: "questionId required" }, { status: 400 });
    }
    const { data: question } = await db
      .from("questions")
      .select("id")
      .eq("id", questionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!question) return NextResponse.json({ error: "no such question" }, { status: 404 });

    const { sessionId, state } = await startSession(db, user.id, "daily");

    let stored: { bytes: Uint8Array; mimeType: string; path: string } | undefined;
    if (audio instanceof File && audio.size > 0) {
      const bytes = new Uint8Array(await audio.arrayBuffer());
      const path = `${user.id}/${sessionId}/${Date.now()}.webm`;
      const { error: uploadError } = await db.storage
        .from("answer-audio")
        .upload(path, bytes, { contentType: audio.type || "audio/webm" });
      if (uploadError) throw new Error(`audio upload failed: ${uploadError.message}`);
      stored = { bytes, mimeType: audio.type || "audio/webm", path };
    } else if (typeof typed !== "string" || typed.trim().length === 0) {
      return NextResponse.json({ error: "an answer is required" }, { status: 400 });
    }

    const recorded = await recordAnswer(db, {
      userId: user.id,
      sessionId,
      questionId,
      state,
      audio: stored,
      text: typeof typed === "string" ? typed : undefined,
    });
    await endSession(db, sessionId, recorded.state);

    log.info("daily.answer", { sessionId, voice: Boolean(stored) });
    return NextResponse.json({ transcript: recorded.transcript, sessionId });
  } catch (err) {
    if (err instanceof Unauthorized) return NextResponse.json({ error: "not signed in" }, { status: 401 });
    log.error("daily.answer", err);
    return NextResponse.json({ error: "could not record answer" }, { status: 500 });
  }
}
