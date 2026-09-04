// POST /api/daily/question — ask for today's question now (SPEC §3.4).
// Normally the hourly job writes it at eight local time; this is the person
// asking early. One Haiku call, twice a day at most.

import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { requireUser, Unauthorized } from "@/lib/auth";
import { generateDailyQuestion } from "@/lib/daily/question";
import { allow, tooMany } from "@/lib/ratelimit";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  try {
    const user = await requireUser();
    const db = serviceClient();
    const gate = await allow(db, { action: "daily_question", subject: user.id, limit: 2, windowSeconds: 86_400 });
    if (!gate.allowed) return tooMany(gate);
    const result = await generateDailyQuestion(db, { userId: user.id });
    return NextResponse.json(result, { status: result.created || result.questionId ? 200 : 204 });
  } catch (err) {
    if (err instanceof Unauthorized) return NextResponse.json({ error: "not signed in" }, { status: 401 });
    log.error("daily.question", err);
    return NextResponse.json({ error: "no question could be made" }, { status: 500 });
  }
}
