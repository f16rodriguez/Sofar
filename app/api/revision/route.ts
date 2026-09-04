// POST /api/revision — accept or decline a proposed revision (SPEC §5.5, M3).
//
// Accepting replaces the chapter body and bumps its version; the chapter stays
// canon. Declining marks the proposal declined and touches nothing else —
// not the chapter, not the memory that triggered it. That asymmetry is the
// milestone's acceptance test: declining changes nothing.

import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { requireUser, Unauthorized } from "@/lib/auth";
import { log } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { revisionId, decision } = (await request.json()) as {
      revisionId?: string;
      decision?: "accepted" | "declined";
    };
    if (!revisionId || (decision !== "accepted" && decision !== "declined")) {
      return NextResponse.json(
        { error: "revisionId and decision required" },
        { status: 400 },
      );
    }

    const db = serviceClient();
    const { data: revision, error } = await db
      .from("chapter_revisions")
      .select("id, chapter_id, proposed_body_md, status")
      .eq("id", revisionId)
      .eq("user_id", user.id)
      .single();
    if (error || !revision) {
      return NextResponse.json({ error: "no such revision" }, { status: 404 });
    }
    if (revision.status !== "proposed") {
      return NextResponse.json({ error: "already decided" }, { status: 409 });
    }

    const decidedAt = new Date().toISOString();

    if (decision === "declined") {
      // Nothing else moves. This is the whole of a decline.
      await db
        .from("chapter_revisions")
        .update({ status: "declined", decided_at: decidedAt })
        .eq("id", revisionId);
      return NextResponse.json({ status: "declined" });
    }

    const { data: chapter } = await db
      .from("chapters")
      .select("version")
      .eq("id", revision.chapter_id)
      .eq("user_id", user.id)
      .single();

    const body = revision.proposed_body_md as string;
    await db
      .from("chapters")
      .update({
        body_md: body,
        version: (chapter?.version ?? 1) + 1,
        word_count: body.split(/\s+/).filter(Boolean).length,
        status: "canon",
        canon_at: decidedAt,
      })
      .eq("id", revision.chapter_id)
      .eq("user_id", user.id);

    await db
      .from("chapter_revisions")
      .update({ status: "accepted", decided_at: decidedAt })
      .eq("id", revisionId);

    return NextResponse.json({ status: "accepted" });
  } catch (err) {
    if (err instanceof Unauthorized) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    log.error("revision.decide", err);
    return NextResponse.json({ error: "could not record decision" }, { status: 500 });
  }
}
