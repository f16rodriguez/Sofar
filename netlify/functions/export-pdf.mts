// The book as a PDF (SPEC §3.8, M6), as its own function. Reads the session
// from the same cookies the app uses, renders, returns the file. Reached
// through GET /api/export, which checks the session first and forwards the
// cookie; hitting this path directly works the same way.

import type { Config } from "@netlify/functions";
import { createServerClient } from "@supabase/ssr";
import { serviceClient } from "../../lib/supabase";
import { requireEnv } from "../../lib/env";
import { allow, LIMITS } from "../../lib/ratelimit";
import { renderBookPdf, type ExportChapter } from "../../lib/export/book-pdf";
import { log } from "../../lib/log";

function parseCookies(header: string | null): { name: string; value: string }[] {
  if (!header) return [];
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf("=");
      return i < 0 ? { name: part, value: "" } : { name: part.slice(0, i), value: part.slice(i + 1) };
    });
}

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/**
 * ?debug=1 — what this function can see: env presence (booleans only), where
 * the fonts are, and whether the renderer runs at all, with its error text.
 * Netlify function logs are not reachable from the tooling that deploys
 * this, so the function reports on itself. Nothing secret is returned.
 */
async function diagnostics(): Promise<Record<string, unknown>> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const candidates = [
    path.join(process.cwd(), "assets", "fonts", "Newsreader-400.ttf"),
    path.join(process.cwd(), "public", "fonts", "Newsreader-400.ttf"),
  ];
  const out: Record<string, unknown> = {
    node: process.version,
    cwd: process.cwd(),
    env: Object.fromEntries(
      ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SITE_URL", "URL"].map((k) => [k, Boolean(process.env[k])]),
    ),
    fonts: Object.fromEntries(candidates.map((c) => [c, fs.existsSync(c)])),
  };
  try {
    const t0 = Date.now();
    const pdf = await renderBookPdf({
      bookName: "Diagnostics",
      chapters: [{ number: 1, title: "One", kind: "chapter", body_md: "A single line." }],
    });
    out.render = { ok: true, bytes: pdf.byteLength, ms: Date.now() - t0 };
  } catch (err) {
    out.render = { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err), stack: err instanceof Error ? (err.stack ?? "").split("\n").slice(0, 6) : undefined };
  }
  return out;
}

export default async (request: Request) => {
  try {
    if (new URL(request.url).searchParams.get("debug") === "1") {
      return json(await diagnostics(), 200);
    }
    const cookies = parseCookies(request.headers.get("cookie"));
    const supabase = createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      cookies: { getAll: () => cookies, setAll: () => {} },
    });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return json({ error: "not signed in" }, 401);
    const userId = data.user.id;

    // The limiter needs the service role; the export itself does not. Reads
    // go through the person's own session under row-level security, which
    // is the least privilege that does the job.
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const gate = await allow(serviceClient(), { action: "export", subject: userId, ...LIMITS.export });
      if (!gate.allowed) {
        return json({ error: "too many requests", retryAfterSeconds: gate.retryAfterSeconds }, 429, {
          "retry-after": String(gate.retryAfterSeconds),
        });
      }
    }

    const [{ data: profile }, { data: rows, error: readError }] = await Promise.all([
      supabase.from("users").select("book_name").eq("id", userId).maybeSingle(),
      supabase.from("chapters").select("number, title, kind, body_md").eq("user_id", userId),
    ]);
    if (readError) throw new Error(`chapters read failed: ${readError.code ?? readError.message}`);

    const pdf = await renderBookPdf({
      bookName: profile?.book_name ?? null,
      chapters: (rows ?? []) as ExportChapter[],
    });
    const safeName = (profile?.book_name ?? "").replace(/[^\w\- ]+/g, "").trim() || "sofar";
    log.info("export.pdf", { chapters: (rows ?? []).length, bytes: pdf.byteLength });
    return new Response(pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safeName}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    log.error("export.pdf", err);
    return json({ error: "could not export" }, 500);
  }
};

// A custom path is served there and only there (the default
// /.netlify/functions/ path is switched off by it), and it is routed before
// the Next handler's catch-all — verified in production.
export const config: Config = {
  path: "/api/export-pdf",
};
