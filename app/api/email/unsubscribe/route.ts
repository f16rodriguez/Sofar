// POST /api/email/unsubscribe?u=<user id>&t=<signed token>
//
// Two callers. A mail client doing one-click unsubscribe (RFC 8058) posts
// "List-Unsubscribe=One-Click" and wants a 200, nothing else. The page at
// /unsubscribe posts its confirm button and wants to land on "done". Neither
// is signed in; the token is what proves whose emails these are.
//
// POST only: a GET that unsubscribed would be fired by every link scanner
// that opens mail before its reader does.

import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { verifyUnsubscribe } from "@/lib/email";
import { siteOrigin } from "@/lib/site";
import { log } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = new URL(request.url);
  let userId = url.searchParams.get("u") ?? "";
  let token = url.searchParams.get("t") ?? "";
  let fromPage = false;
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (form?.get("confirm")) {
      fromPage = true;
      userId = String(form.get("u") ?? userId);
      token = String(form.get("t") ?? token);
    }
  }

  if (!verifyUnsubscribe(userId, token)) {
    return NextResponse.json({ error: "this link is not valid" }, { status: 400 });
  }

  const { error } = await serviceClient()
    .from("users")
    .update({ email_daily: false, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    log.error("email.unsubscribe", new Error(error.code ?? error.message), { userId });
    return NextResponse.json({ error: "that did not work — try again" }, { status: 500 });
  }
  log.info("email.unsubscribe", { userId, oneClick: !fromPage });

  if (fromPage) return NextResponse.redirect(`${siteOrigin(request.headers, request.url)}/unsubscribe?done=1`, 303);
  return NextResponse.json({ ok: true });
}
