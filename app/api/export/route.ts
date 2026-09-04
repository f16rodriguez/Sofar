// GET /api/export — the book as a PDF (SPEC §3.8, M6). Free on every plan,
// including cancelled.
//
// The rendering lives in netlify/functions/export-pdf.mts, on purpose:
// react-pdf inside this server crashed it seconds after every cold start.
// This route confirms the session and forwards the request, cookie and all,
// so the function sees the same person.

import { NextResponse } from "next/server";
import { requireUser, Unauthorized } from "@/lib/auth";
import { siteOrigin } from "@/lib/site";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireUser();
    const origin = siteOrigin(request.headers, request.url);
    const upstream = await fetch(`${origin}/.netlify/functions/export-pdf`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      redirect: "manual",
      cache: "no-store",
    });
    const headers = new Headers();
    for (const name of ["content-type", "content-disposition", "retry-after", "cache-control"]) {
      const v = upstream.headers.get(name);
      if (v) headers.set(name, v);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    if (err instanceof Unauthorized) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    log.error("export.proxy", err);
    return NextResponse.json({ error: "could not export" }, { status: 500 });
  }
}
