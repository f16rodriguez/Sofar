// GET /api/export — the book as a PDF (SPEC §3.8, M6). Free on every plan,
// including cancelled. Drafts are included: an unread chapter is still the
// person's, and export is not reading, so nothing is locked to canon here.

import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { requireUser, Unauthorized } from "@/lib/auth";
import { renderBookPdf, type ExportChapter } from "@/lib/export/book-pdf";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const db = serviceClient();
    const [{ data: profile }, { data: rows, error }] = await Promise.all([
      db.from("users").select("book_name").eq("id", user.id).maybeSingle(),
      db
        .from("chapters")
        .select("number, title, kind, body_md")
        .eq("user_id", user.id),
    ]);
    if (error) throw new Error(`chapters read failed: ${error.code ?? error.message}`);

    const pdf = await renderBookPdf({
      bookName: profile?.book_name ?? null,
      chapters: (rows ?? []) as ExportChapter[],
    });

    const safeName = (profile?.book_name ?? "").replace(/[^\w\- ]+/g, "").trim() || "sofar";
    log.info("export.pdf", { chapters: (rows ?? []).length, bytes: pdf.byteLength });
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof Unauthorized) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    log.error("export.pdf", err);
    return NextResponse.json({ error: "could not export" }, { status: 500 });
  }
}
