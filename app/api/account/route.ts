// DELETE /api/account — delete everything (SPEC §3.9, M6).
//
// The client gates this behind an export: nothing is deleted before the
// person can take their book with them. Here the request is recorded as a
// deletion job (run within 24h by the daily jobs), and the session ends.
// The confirmation word is checked again server-side; a stray fetch from a
// tab is not a decision.

import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { authClient, requireUser, Unauthorized } from "@/lib/auth";
import { enqueueAccountDeletion } from "@/lib/jobs";
import { log } from "@/lib/log";
import { allow, LIMITS } from "@/lib/ratelimit";
import { tooMany } from "@/lib/ratelimit-response";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const { confirm, exported } = (await request.json().catch(() => ({}))) as {
      confirm?: string;
      exported?: boolean;
    };
    if (confirm !== "delete" || exported !== true) {
      return NextResponse.json(
        { error: "export first, then type delete" },
        { status: 400 },
      );
    }

    const db = serviceClient();
    const gate = await allow(db, { action: "account_delete", subject: user.id, ...LIMITS.account_delete });
    if (!gate.allowed) return tooMany(gate);
    await enqueueAccountDeletion(db, user.id);
    const supabase = await authClient();
    await supabase.auth.signOut();
    return NextResponse.json({ status: "scheduled", within: "24h" }, { status: 202 });
  } catch (err) {
    if (err instanceof Unauthorized) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    log.error("account.delete.request", err);
    return NextResponse.json({ error: "could not record the request" }, { status: 500 });
  }
}
