// Sign out. A POST, so a link prefetch or a crawler can never end a session.

import { NextResponse } from "next/server";
import { authClient } from "@/lib/auth";
import { siteOrigin } from "@/lib/site";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await authClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/signin", siteOrigin(request.headers, request.url)), {
    status: 303,
  });
}
