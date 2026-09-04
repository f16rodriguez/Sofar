// Magic-link landing. Exchanges the code for a session cookie and sends the
// person on to Block 0 (or the interview, if foundations are already in).

import { NextResponse } from "next/server";
import { authClient, currentUser, ensureProfile } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { log } from "@/lib/log";
import { siteOrigin } from "@/lib/site";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = siteOrigin(request.headers, request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/signin?problem=send", origin));

  try {
    const supabase = await authClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;

    const user = await currentUser();
    if (!user) throw new Error("no session after exchange");
    await ensureProfile(user);

    // Foundations already given? Straight to the interview.
    const db = serviceClient();
    const { data } = await db
      .from("users")
      .select("pronoun, birthplace")
      .eq("id", user.id)
      .maybeSingle();
    const hasFoundations = Boolean(data?.pronoun && data?.birthplace);

    return NextResponse.redirect(
      new URL(hasFoundations ? "/interview" : "/onboarding", origin),
    );
  } catch (err) {
    log.error("auth.callback", err);
    return NextResponse.redirect(new URL("/signin?problem=send", origin));
  }
}
