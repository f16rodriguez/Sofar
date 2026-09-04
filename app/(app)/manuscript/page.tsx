// The Manuscript (SPEC §6): the state of the book as an object — every
// chapter, whether it has been read, its version, its length, what is
// proposed against it. The Book is for reading; this is for knowing where
// things stand.

import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { computeStreak, earnedMarks } from "@/lib/daily/streak";
import { safeZone } from "@/lib/daily/time";
import StreakStrip from "../StreakStrip";

export const metadata = { title: "Sofar — The Manuscript" };
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  number: number | null;
  title: string;
  kind: "prologue" | "chapter" | "interlude" | "sofar";
  status: "draft" | "canon";
  version: number;
  word_count: number | null;
  canon_at: string | null;
  updated_at: string;
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const rank = (c: Row) => (c.kind === "prologue" ? 0 : c.kind === "sofar" ? 2 : 1);

export default async function ManuscriptPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const db = serviceClient();
  const [{ data: profile }, { data: rows }, { data: proposed }, { data: answers }] = await Promise.all([
    db.from("users").select("book_name, timezone").eq("id", user.id).maybeSingle(),
    db.from("chapters").select("id, number, title, kind, status, version, word_count, canon_at, updated_at").eq("user_id", user.id),
    db.from("chapter_revisions").select("chapter_id").eq("user_id", user.id).eq("status", "proposed"),
    db.from("answers").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const zone = safeZone(profile?.timezone);
  const [streak, marks] = await Promise.all([computeStreak(db, user.id, zone), earnedMarks(db, user.id)]);
  const chapters = ((rows ?? []) as Row[]).sort((a, b) => rank(a) - rank(b) || (a.number ?? 0) - (b.number ?? 0));
  const pending = new Set((proposed ?? []).map((p) => p.chapter_id as string));
  const words = chapters.reduce((s, c) => s + (c.word_count ?? 0), 0);
  void answers;

  return (
    <main className="page-narrow rise">
      <StreakStrip streak={streak} marks={marks} />
      <h1 className="page-title">{profile?.book_name ?? "Your book"}</h1>
      <p className="hint">
        {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"} · {Math.max(1, Math.round(words / 275))}{" "}
        {Math.round(words / 275) === 1 ? "page" : "pages"} · {words.toLocaleString()} words
      </p>

      {chapters.length === 0 ? (
        <p className="lede">Nothing written yet. The first chapters arrive after your interview.</p>
      ) : (
        <ol className="manuscript">
          {chapters.map((c) => (
            <li key={c.id} className="manuscript-row">
              <span className="manuscript-num">
                {c.kind === "prologue" ? "Prologue" : c.kind === "sofar" ? "So far" : c.kind === "interlude" ? "Interlude" : ROMAN[c.number ?? 0] ?? c.number}
              </span>
              <span className="manuscript-title">
                <Link href="/book">{c.title}</Link>
              </span>
              <span className="manuscript-meta">
                {c.status === "canon" ? "Read" : "Unread"} · v{c.version} · {c.word_count ?? 0} words
                {pending.has(c.id) ? " · a revision is proposed" : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="row" style={{ marginTop: 12 }}>
        <Link className="button-quiet" href="/book">Read the book</Link>
        <a className="button-quiet" href="/api/export" download>Export as PDF</a>
      </p>
    </main>
  );
}
