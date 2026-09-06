// How the session cookie is written (SPEC §7).
//
// The auth cookie is the whole of someone's access to their own book, and by
// default it arrived readable by any script on the page and sendable over
// plain HTTP. Nothing in Sofar reads it from the browser — every Supabase
// call is made on the server, and the client only ever fetches our own
// routes, which carry the cookie automatically — so it can be closed all the
// way down.
//
//   httpOnly  script cannot read it, so an XSS anywhere on the page (or in
//             anything a future dependency injects) cannot lift a session.
//   secure    never sent over plain HTTP, independently of HSTS.
//   lax       sent on top-level navigation so a magic link lands signed in,
//             withheld on cross-site POSTs, which is most of CSRF.

import type { CookieOptions } from "@supabase/ssr";

export const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

/** The same, merged onto whatever Supabase asked for. */
export function withCookieDefaults<T extends Record<string, unknown> | undefined>(options: T) {
  return { ...(options ?? {}), ...COOKIE_OPTIONS };
}
