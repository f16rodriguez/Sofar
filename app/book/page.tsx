// The Book (SPEC §6, M3). The private canon, read in order.
//
// Canon on first read (SPEC §3.4): a chapter is a draft until the person has
// seen it, and seeing it is what locks it. From then on it changes only by a
// revision they accept — never silently.

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import RevisionCard from "./RevisionCard";

export const metadata = { title: "Sofar — The Book" };

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
function numeral(n: number | null): string {
  if (n === null || n <= 0) return "";
  return ROMAN[n] ?? String(n);
}

interface Chapter {
  id: string;
  number: number | null;
  title: string;
  kind: "prologue" | "chapter" | "interlude" | "sofar";
  body_md: string;
  status: "draft" | "canon";
  word_count: number | null;
}

/** Prologue first, chapters by number, "So far" always last (concept §3). */
function inReadingOrder(a: Chapter, b: Chapter): number {
  const rank = (c: Chapter) =>
    c.kind === "prologue" ? 0 : c.kind === "sofar" ? 2 : 1;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return (a.number ?? 0) - (b.number ?? 0);
}

export default async function BookPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const db = serviceClient();
  const [{ data: rows }, { data: profile }, { data: revisions }] = await Promise.all([
    db.from("chapters").select("*").eq("user_id", user.id),
    db.from("users").select("book_name").eq("id", user.id).maybeSingle(),
    db
      .from("chapter_revisions")
      .select("id, chapter_id, rationale, proposed_body_md")
      .eq("user_id", user.id)
      .eq("status", "proposed"),
  ]);

  const chapters = ((rows ?? []) as Chapter[]).sort(inReadingOrder);

  // Seen is read. Lock the drafts now that they are on the page.
  const unread = chapters.filter((c) => c.status === "draft").map((c) => c.id);
  if (unread.length > 0) {
    await db
      .from("chapters")
      .update({ status: "canon", canon_at: new Date().toISOString() })
      .in("id", unread);
  }

  const pending = new Map(
    (revisions ?? []).map((r) => [r.chapter_id as string, r]),
  );
  const pages = chapters.reduce((sum, c) => sum + (c.word_count ?? 0), 0) / 275;

  if (chapters.length === 0) {
    return (
      <main style={S.wrap}>
        <h1 style={S.bookTitle}>{profile?.book_name ?? "Your book"}</h1>
        <p style={S.empty}>
          Nothing written yet. The first chapters arrive after your interview.
        </p>
      </main>
    );
  }

  return (
    <main style={S.wrap}>
      <header style={S.masthead}>
        <h1 style={S.bookTitle}>{profile?.book_name ?? "Your book"}</h1>
        <p style={S.meta}>
          {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"} ·{" "}
          {pages < 1 ? "under a page" : `${Math.round(pages)} pages`}
        </p>
      </header>

      {chapters.map((chapter) => {
        const revision = pending.get(chapter.id);
        return (
          <article key={chapter.id} style={S.chapter}>
            <div style={S.ribbon} aria-hidden="true" />
            {chapter.kind === "prologue" ? (
              <div style={S.label}>Prologue</div>
            ) : chapter.kind === "sofar" ? (
              <div style={S.label}>So far</div>
            ) : (
              <div style={S.numeral}>{numeral(chapter.number)}</div>
            )}
            <h2 style={S.chapterTitle}>{chapter.title}</h2>
            {chapter.body_md
              .split(/\n\s*\n/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i} style={S.paragraph}>
                  {paragraph}
                </p>
              ))}

            {revision && (
              <RevisionCard
                revisionId={revision.id as string}
                rationale={revision.rationale as string}
                proposed={revision.proposed_body_md as string}
              />
            )}
          </article>
        );
      })}
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: "40rem",
    margin: "0 auto",
    padding: "clamp(32px, 7vh, 64px) 20px 96px",
    display: "flex",
    flexDirection: "column",
    gap: 34,
  },
  masthead: { display: "flex", flexDirection: "column", gap: 6 },
  bookTitle: {
    fontFamily: "var(--font-book)",
    fontWeight: 400,
    fontSize: "clamp(28px, 5vw, 38px)",
    letterSpacing: "-.015em",
    margin: 0,
  },
  meta: {
    fontFamily: "var(--font-chrome)",
    fontSize: 13,
    color: "#7a746a",
    margin: 0,
  },
  empty: {
    fontFamily: "var(--font-book)",
    fontSize: 19,
    lineHeight: 1.55,
    color: "#3d3932",
    margin: 0,
  },
  chapter: {
    position: "relative",
    background: "#fbf7ef",
    border: "1px solid #d9d0bf",
    padding: "clamp(32px, 6vw, 52px) clamp(22px, 5vw, 48px) 40px",
  },
  ribbon: {
    position: "absolute",
    top: -1,
    right: 40,
    width: 14,
    height: 46,
    background: "#7a2e2a",
  },
  numeral: {
    fontFamily: "var(--font-book)",
    fontSize: 40,
    lineHeight: 1,
    color: "#7a2e2a",
    marginBottom: 8,
  },
  label: {
    fontFamily: "var(--font-chrome)",
    fontSize: 12,
    letterSpacing: ".12em",
    textTransform: "uppercase",
    color: "#7a2e2a",
    marginBottom: 12,
  },
  chapterTitle: {
    fontFamily: "var(--font-book)",
    fontWeight: 400,
    fontSize: "clamp(24px, 4vw, 30px)",
    lineHeight: 1.2,
    letterSpacing: "-.01em",
    margin: "0 0 28px",
    textWrap: "balance",
  },
  paragraph: {
    fontFamily: "var(--font-book)",
    fontSize: 19,
    lineHeight: 1.62,
    margin: "0 0 1.1em",
    textWrap: "pretty",
  },
};
