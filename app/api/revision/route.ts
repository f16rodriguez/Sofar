// POST /api/revision — accept or decline a proposed revision (SPEC §5.5, M3).
// The decision itself lives in lib/pipeline/revision.ts so the acceptance
// test exercises the same code the button does.

import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { requireUser, Unauthorized } from "@/lib/auth";
import { decideRevision } from "@/lib/pipeline/revision";
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

    const result = await decideRevision(serviceClient(), user.id, revisionId, decision);
    if (!result.ok) {
      return result.reason === "not found"
        ? NextResponse.json({ error: "no such revision" }, { status: 404 })
        : NextResponse.json({ error: "already decided" }, { status: 409 });
    }
    return NextResponse.json({ status: result.status });
  } catch (err) {
    if (err instanceof Unauthorized) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    log.error("revision.decide", err);
    return NextResponse.json({ error: "could not record decision" }, { status: 500 });
  }
}
