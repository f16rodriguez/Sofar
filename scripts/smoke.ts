// Live smoke test of the signed-in app (M2/M3/M4/M6 screens).
//
// A throwaway user with foundations and consent, a real session cookie made
// by the same library the app reads it with, then every screen and every
// safe endpoint. Catches what a deploy check cannot: a page that renders
// only when a session and the service role are both present.
//
//   set -a; . ./.env.local; set +a
//   SOFAR_BASE_URL=https://sofar-book.netlify.app npm run smoke

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { serviceClient } from "../lib/supabase";
import { requireEnv } from "../lib/env";

const BASE = (process.env.SOFAR_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Next renders this when a Server Component throws. */
const CRASHED = /Application error|server-side exception|Internal Server Error/i;

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const admin = serviceClient();

  const email = `smoke-${Date.now()}@example.com`;
  const password = `smoke-${crypto.randomUUID()}`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`auth user: ${error?.message}`);
  const userId = created.user.id;

  try {
    // A person who has finished Block 0 and consented — the state every
    // screen below assumes.
    const { error: pe } = await admin.from("users").insert({
      id: userId,
      email,
      book_name: "Smoke",
      pronoun: "they",
      age: 33,
      birthplace: "Akron",
      current_city: "Queens",
      prior_cities: ["Akron"],
      occupation: "dispatcher",
      household: "their partner",
      family_of_origin: "a brother",
      timezone: "America/New_York",
      recording_consent_at: new Date().toISOString(),
    });
    if (pe) throw new Error(`profile: ${pe.message}`);
    await admin.from("chapters").insert({
      user_id: userId,
      kind: "chapter",
      number: 1,
      title: "The Smoke Test",
      body_md: "A paragraph.\n\nAnother paragraph.",
      status: "draft",
      source_memory_ids: [],
      word_count: 4,
    });

    const plain = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signed, error: se } = await plain.auth.signInWithPassword({ email, password });
    if (se || !signed.session) throw new Error(`sign in: ${se?.message}`);
    const jar = new Map<string, string>();
    const ssr = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)),
      },
    });
    await ssr.auth.setSession({
      access_token: signed.session.access_token,
      refresh_token: signed.session.refresh_token,
    });
    const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");

    // Signed out: every private screen sends people to sign-in, never an error.
    for (const path of ["/today", "/book", "/manuscript", "/interview", "/onboarding", "/settings"]) {
      const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
      const to = res.headers.get("location") ?? "";
      check(`signed out ${path} → sign-in`, res.status === 307 && to.includes("/signin"), `${res.status} ${to}`);
    }

    // Signed in: every screen renders its own content, not a crash page.
    const screens: [string, RegExp][] = [
      ["/today", /Today/],
      ["/book", /Smoke/],
      ["/manuscript", /The Smoke Test/],
      ["/settings", /Settings/],
      ["/interview", /interview|Answer|Start/i],
      ["/onboarding", /Before the questions/],
    ];
    for (const [path, expect] of screens) {
      const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
      const html = await res.text();
      const ok = res.status === 200 && !CRASHED.test(html) && expect.test(html);
      check(
        `signed in ${path}`,
        ok,
        ok ? `${html.length}B` : `${res.status}${CRASHED.test(html) ? " CRASHED" : ""}${expect.test(html) ? "" : " missing expected content"}`,
      );
    }

    // Public pages carry no session at all.
    for (const [path, expect] of [["/", /living autobiography/i], ["/privacy", /Privacy, plainly/], ["/signin", /Send the link/]] as [string, RegExp][]) {
      const res = await fetch(`${BASE}${path}`);
      const html = await res.text();
      check(`public ${path}`, res.status === 200 && expect.test(html) && !CRASHED.test(html), String(res.status));
    }

    // Endpoints that must refuse an unauthenticated caller.
    for (const [path, method] of [["/api/export", "GET"], ["/api/export-pdf", "GET"], ["/api/daily/question", "POST"], ["/api/daily/answer", "POST"], ["/api/interview/start", "POST"], ["/api/revision", "POST"], ["/api/account", "DELETE"]] as [string, string][]) {
      const res = await fetch(`${BASE}${path}`, { method });
      check(`${method} ${path} signed out is 401`, res.status === 401, String(res.status));
    }

    // The export, signed in, all the way to a PDF.
    const pdf = await fetch(`${BASE}/api/export`, { headers: { cookie } });
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    check(
      "signed in GET /api/export returns a PDF",
      pdf.status === 200 && Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-",
      `${pdf.status}, ${bytes.byteLength}B`,
    );

    // Health.
    const health = (await (await fetch(`${BASE}/api/health`)).json()) as { ok: boolean };
    check("health is ok", health.ok === true);
  } finally {
    await admin.auth.admin.deleteUser(userId);
    console.log("\ncleanup: fixture user deleted (cascade)");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nsmoke: ${results.length - failed.length}/${results.length} passed against ${BASE}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`smoke: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
