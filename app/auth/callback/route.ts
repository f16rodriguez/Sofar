// Magic-link landing. Turns the link into a session cookie and sends the
// person on to Block 0 (or the interview, if foundations are already in).
//
// Two ways in, deliberately:
//
//   ?token_hash=…&type=…  The link carries its own proof. Nothing on the
//                         device is required, so a link requested on a laptop
//                         and opened on a phone still works.
//   ?code=…               PKCE. Needs the verifier cookie set in the same
//                         browser that asked for the link. When mail opens
//                         the link somewhere else — an in-app browser, a
//                         different device — that cookie is not there and the
//                         exchange fails. token_hash is tried first for
//                         exactly that reason.
//
// Cookies are collected and attached to the redirect explicitly rather than
// written to the ambient store: in a route handler a swallowed cookie write
// leaves the exchange looking successful while the session goes nowhere,
// which is indistinguishable, from the road, from a link that never arrived.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { ensureProfile } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { requireEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { siteOrigin } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTP_TYPES = new Set<string>(["magiclink", "email", "signup", "recovery", "invite", "email_change"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = siteOrigin(request.headers, request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") ?? "magiclink";

  const to = (path: string) => NextResponse.redirect(new URL(path, origin));
  if (!code && !tokenHash) return to("/signin?problem=link");

  // Set-Cookie is collected here and applied to whichever redirect we return.
  const pending: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const cookieHeader = request.headers.get("cookie") ?? "";
  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () =>
          cookieHeader
            .split(";")
            .map((c) => c.trim())
            .filter(Boolean)
            .map((c) => {
              const i = c.indexOf("=");
              return { name: c.slice(0, i), value: decodeURIComponent(c.slice(i + 1)) };
            }),
        setAll: (list) => {
          for (const c of list) pending.push({ name: c.name, value: c.value, options: c.options ?? {} });
        },
      },
    },
  );

  try {
    const verified =
      tokenHash && OTP_TYPES.has(type)
        ? await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash })
        : await supabase.auth.exchangeCodeForSession(code!);
    if (verified.error) throw verified.error;

    const user = verified.data.user;
    if (!user) throw new Error("no user on the verified session");
    await ensureProfile({ id: user.id, email: user.email ?? "" });

    const db = serviceClient();
    const { data } = await db
      .from("users")
      .select("pronoun, birthplace, recording_consent_at")
      .eq("id", user.id)
      .maybeSingle();
    const ready = Boolean(data?.pronoun && data?.birthplace && data?.recording_consent_at);

    const response = to(ready ? "/interview" : "/onboarding");
    for (const c of pending) response.cookies.set(c.name, c.value, c.options);
    if (pending.length === 0) log.error("auth.callback", new Error("verified but no session cookie was issued"));
    return response;
  } catch (err) {
    // A used, expired, or wrong-browser link is the ordinary case here, not a
    // fault; it gets its own message so nobody is told to check an address
    // that was never the problem.
    log.error("auth.callback", err);
    return to("/signin?problem=link");
  }
}
