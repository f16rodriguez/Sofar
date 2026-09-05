// The magic-link path, end to end (SPEC §3.1).
//
// A real link for a throwaway user, followed the way a phone follows it: no
// cookies beforehand, one GET, then the session it hands back is used to open
// a screen. This is the check that was missing when sign-in looked healthy
// from every angle except a person's.
//
//   set -a; . ./.env.local; set +a
//   SOFAR_BASE_URL=https://sofar-book.netlify.app npm run test:auth

import { serviceClient } from "../lib/supabase";

const BASE = (process.env.SOFAR_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Set-Cookie → a Cookie header, the way a browser would. */
function jar(res: Response): string {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return raw.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

async function main() {
  const admin = serviceClient();
  const email = `auth-${Date.now()}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw new Error(`auth user: ${error?.message}`);
  const userId = created.user.id;

  try {
    await admin.from("users").insert({ id: userId, email });

    // A link with no device state behind it, exactly like one opened from mail.
    const { data: link, error: le } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (le || !link.properties?.hashed_token) throw new Error(`generateLink: ${le?.message}`);
    const url = `${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink`;

    const res = await fetch(url, { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    const cookie = jar(res);
    check("the link redirects into the app", res.status === 307 || res.status === 302, `${res.status} → ${location}`);
    check("it does not bounce back to sign-in", !location.includes("/signin"), location);
    check("a new person lands on foundations", location.includes("/onboarding"), location);
    check("a session cookie is issued", cookie.includes("-auth-token"), cookie ? `${cookie.split(";").length} cookie(s)` : "none");

    // The session it handed back has to actually open a screen.
    const page = await fetch(`${BASE}/book`, { headers: { cookie }, redirect: "manual" });
    const html = page.status === 200 ? await page.text() : "";
    check(
      "that session opens the book",
      page.status === 200 && !/Application error|server-side exception/i.test(html),
      `${page.status}${page.headers.get("location") ? ` → ${page.headers.get("location")}` : ""}`,
    );

    // One use only.
    const again = await fetch(url, { redirect: "manual" });
    check("a spent link is refused, and says so", (again.headers.get("location") ?? "").includes("problem=link"), again.headers.get("location") ?? "");

    // Junk is refused the same way, never a crash.
    const junk = await fetch(`${BASE}/auth/callback?token_hash=nonsense&type=magiclink`, { redirect: "manual" });
    check("a forged link is refused", (junk.headers.get("location") ?? "").includes("problem=link"), String(junk.status));
    const bare = await fetch(`${BASE}/auth/callback`, { redirect: "manual" });
    check("a bare callback is refused", (bare.headers.get("location") ?? "").includes("problem=link"), String(bare.status));
  } finally {
    await admin.auth.admin.deleteUser(userId);
    console.log("\ncleanup: fixture user deleted (cascade)");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nauth: ${results.length - failed.length}/${results.length} passed against ${BASE}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`auth-test: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
