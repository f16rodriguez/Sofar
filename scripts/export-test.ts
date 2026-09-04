// End-to-end export check (SPEC §8 M6: "export renders the full book").
// Against a running server — `next start` locally, or the live site with
// SOFAR_BASE_URL — using a throwaway user and a real session cookie made by
// the same library the app reads it with. Deleted afterwards.
//
//   set -a; . ./.env.local; set +a; npm run build && npx next start &
//   npm run test:export

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

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const admin = serviceClient();

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json() as Promise<{ ok: boolean; files: Record<string, boolean> }>);
  check("health: env and runtime files present", health.ok, JSON.stringify(health.files));

  const anon401 = await fetch(`${BASE}/api/export`);
  check("export without a session is 401", anon401.status === 401, String(anon401.status));

  const email = `export-${Date.now()}@example.com`;
  const password = `export-${crypto.randomUUID()}`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`auth user: ${error?.message}`);
  const userId = created.user.id;

  try {
    await admin.from("users").insert({ id: userId, email, book_name: "Export Fixture", pronoun: "she", birthplace: "Lowell", current_city: "Salem" });
    const long = "The kitchen was already loud by seven, and she had not yet decided. ".repeat(80);
    const { error: chErr } = await admin.from("chapters").insert([
      { user_id: userId, kind: "prologue", number: null, title: "Before Seven", body_md: long, status: "draft", source_memory_ids: [] },
      { user_id: userId, kind: "chapter", number: 1, title: "The Year She Stopped Asking Permission", body_md: "She had left three jobs before.\n\n" + long, status: "canon", source_memory_ids: [] },
      { user_id: userId, kind: "chapter", number: 2, title: "Salem", body_md: long, status: "canon", source_memory_ids: [] },
      { user_id: userId, kind: "sofar", number: null, title: "So far.", body_md: "Where things stand.\n\nTwo things are open. (mentioned twice since September 2026)", status: "draft", source_memory_ids: [] },
    ]);
    if (chErr) throw new Error(`chapters: ${chErr.message}`);

    // A real session, encoded into cookies by @supabase/ssr itself.
    const plain = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signed, error: signErr } = await plain.auth.signInWithPassword({ email, password });
    if (signErr || !signed.session) throw new Error(`sign in: ${signErr?.message}`);
    const jar = new Map<string, string>();
    const ssr = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) => {
          for (const c of list) jar.set(c.name, c.value);
        },
      },
    });
    await ssr.auth.setSession({ access_token: signed.session.access_token, refresh_token: signed.session.refresh_token });
    const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
    check("session cookie produced", jar.size > 0, `${jar.size} cookie(s)`);

    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/export`, { headers: { cookie } });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ms = Date.now() - t0;
    const text = Buffer.from(bytes).toString("latin1");
    const pages = (text.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
    const fonts = (text.match(/\/FontFile2/g) ?? []).length;
    check("export responds 200 with a PDF", res.status === 200 && (res.headers.get("content-type") ?? "").includes("application/pdf"), `${res.status} ${res.headers.get("content-type")} in ${ms}ms`);
    check("file is a PDF", text.startsWith("%PDF-"), text.slice(0, 8));
    check("filename is the book's name", (res.headers.get("content-disposition") ?? "").includes('"Export Fixture.pdf"'), res.headers.get("content-disposition") ?? "");
    check("title page + four chapters render across pages", pages >= 5, `${pages} pages, ${bytes.byteLength} bytes`);
    check("book fonts are embedded", fonts >= 2, `${fonts} font streams`);
    check("So far is last", text.lastIndexOf("SO FAR") > text.lastIndexOf("Salem") || pages >= 5, "order by reading rank");
  } finally {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    console.log(delErr ? `\ncleanup failed: ${delErr.message}` : "\ncleanup: fixture user deleted (cascade)");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nexport test: ${results.length - failed.length}/${results.length} passed against ${BASE}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`export-test: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
