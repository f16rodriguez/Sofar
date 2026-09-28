// The Book (SPEC §6, M3). The private canon, read in order.
//
// Canon on first read (SPEC §3.4): a chapter is a draft until the person has
// seen it, and seeing it is what locks it. From then on it changes only by a
// revision they accept — never silently.
//
// A chapter arriving is the whole payoff of answering, so the ones that were
// drafts until this page loaded are marked new — once. Every chapter has an
// anchor, so Today and the contents can point at one.

import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { bookText } from "@/lib/typography";
import RevisionCard from "./RevisionCard";

export const metadata = { title: "Sofar — The Book" };
export const dynamic = "force-dynamic";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
const numeral = (n: number | null) => (n === null || n <= 0 ? "" : (ROMAN[n] ?? String(n)));

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
  const rank = (c: Chapter) => (c.kind === "prologue" ? 0 : c.kind === "sofar" ? 2 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return (a.number ?? 0) - (b.number ?? 0);
}

const label = (c: Chapter) =>
  c.kind === "prologue" ? "Prologue" : c.kind === "sofar" ? "So far" : c.kind === "interlude" ? "Interlude" : numeral(c.number);

const paragraphs = (body: string) =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export default async function BookPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const db = serviceClient();
  const [{ data: rows }, { data: profile }, { data: revisions }] = await Promise.all([
    db.from("chapters").select("id, number, title, kind, body_md, status, word_count").eq("user_id", user.id),
    db.from("users").select("book_name").eq("id", user.id).maybeSingle(),
    db
      .from("chapter_revisions")
      .select("id, chapter_id, rationale, proposed_body_md")
      .eq("user_id", user.id)
      .eq("status", "proposed"),
  ]);

  const chapters = ((rows ?? []) as Chapter[]).sort(inReadingOrder);

  // Seen is read. Lock the drafts now that they are on the page — and
  // remember which they were, so this one reading can mark them new.
  const arrived = new Set(chapters.filter((c) => c.status === "draft").map((c) => c.id));
  if (arrived.size > 0) {
    await db
      .from("chapters")
      .update({ status: "canon", canon_at: new Date().toISOString() })
      .in("id", [...arrived]);
  }

  const pending = new Map((revisions ?? []).map((r) => [r.chapter_id as string, r]));
  const title = profile?.book_name?.trim() || "Your book";

  if (chapters.length === 0) {
    return (
      <main className="book rise">
        <h1 className="book-title">{title}</h1>
        <p className="lede">Nothing written yet. The first chapters arrive after your first interview.</p>
        <Link className="button" href="/today">
          Go to today
        </Link>
      </main>
    );
  }

  const written = chapters.filter((c) => c.kind !== "sofar").length;
  const words = chapters.reduce((sum, c) => sum + (c.word_count ?? 0), 0);
  const pages = Math.round(words / 275);
  const size = pages < 1 ? "under a page" : pages === 1 ? "about a page" : `about ${pages} pages`;

  return (
    <main className="book rise">
      <header className="book-head">
        <h1 className="book-title">{title}</h1>
        <p className="hint">
          {written} {written === 1 ? "chapter" : "chapters"} · {size}
          {pending.size > 0 && ` · ${pending.size === 1 ? "a revision" : `${pending.size} revisions`} to look at`}
        </p>
      </header>

      {chapters.length > 2 && (
        <nav className="contents" aria-label="Contents">
          <ol>
            {chapters.map((c) => (
              <li key={c.id}>
                <a href={`#chapter-${c.id}`}>
                  <span className="contents-num">{label(c)}</span>
                  <span className="contents-title">{bookText(c.title)}</span>
                  {arrived.has(c.id) && <span className="new">New</span>}
                  {pending.has(c.id) && <span className="flag">Revision</span>}
                </a>
              </li>
            ))}
          </ol>
          <Link className="contents-more" href="/manuscript">
            Details and export
          </Link>
        </nav>
      )}

      {chapters.map((chapter, i) => {
        const revision = pending.get(chapter.id);
        return (
          <article
            key={chapter.id}
            id={`chapter-${chapter.id}`}
            className={chapter.kind === "sofar" ? "chapter sofar rise" : "chapter rise"}
            style={{ animationDelay: `${Math.min(i, 6) * 70}ms` }}
          >
            <div className="chapter-rib" aria-hidden="true" />
            <div className="chapter-head">
              {chapter.kind === "chapter" ? (
                <span className="chapter-num">{numeral(chapter.number)}</span>
              ) : (
                <span className="chapter-label">{label(chapter)}</span>
              )}
              {arrived.has(chapter.id) && <span className="new">New</span>}
            </div>
            <h2 className="chapter-title">{bookText(chapter.title)}</h2>
            {paragraphs(chapter.body_md).map((p, j) => (
              <p key={j} className="chapter-p">
                {bookText(p)}
              </p>
            ))}
            {revision && (
              <RevisionCard
                revisionId={revision.id as string}
                rationale={revision.rationale as string}
                original={chapter.body_md}
                proposed={revision.proposed_body_md as string}
              />
            )}
          </article>
        );
      })}

      <p className="book-end">
        <Link href="/manuscript">Details and export</Link>
      </p>
    </main>
  );
}
