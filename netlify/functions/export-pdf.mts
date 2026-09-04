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

export default async (request: Request) => {
  try {
    const cookies = parseCookies(request.headers.get("cookie"));
    const supabase = createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      cookies: { getAll: () => cookies, setAll: () => {} },
    });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return json({ error: "not signed in" }, 401);
    const userId = data.user.id;

    const db = serviceClient();
    const gate = await allow(db, { action: "export", subject: userId, ...LIMITS.export });
    if (!gate.allowed) {
      return json({ error: "too many requests", retryAfterSeconds: gate.retryAfterSeconds }, 429, {
        "retry-after": String(gate.retryAfterSeconds),
      });
    }

    const [{ data: profile }, { data: rows, error: readError }] = await Promise.all([
      db.from("users").select("book_name").eq("id", userId).maybeSingle(),
      db.from("chapters").select("number, title, kind, body_md").eq("user_id", userId),
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

export const config: Config = {
  path: "/api/export-pdf",
};
