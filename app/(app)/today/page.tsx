// Today (SPEC §3.4, §6). The one screen someone opens every day, so it holds
// the three things worth opening it for, in the order they matter:
//
//   a chapter that has arrived and not been read — the whole payoff of
//   answering; it was invisible until you happened to open the book
//
//   today's question, or, before there is a book, the first interview
//
//   how far the answers have come toward the next chapter — only while
//   chapters are actually being written, because a progress bar toward
//   something that is switched off is a lie
//
// The streak sits at the foot. It is a fact about the person, not the point.

import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { journey } from "@/lib/journey";
import { isQuiet, todaysQuestion } from "@/lib/daily/question";
import { computeStreak, awardMarks, earnedMarks } from "@/lib/daily/streak";
import { safeZone } from "@/lib/daily/time";
import { answersSinceLastChapter, UNLOCK_THRESHOLD } from "@/lib/pipeline/process";
import StreakStrip from "../StreakStrip";
import TodayAnswer from "./TodayAnswer";
import AskNow from "./AskNow";
import InstallCard from "../InstallCard";

export const metadata = { title: "Sofar — Today" };
export const dynamic = "force-dynamic";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven"];

export default async function TodayPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const db = serviceClient();

  const where = await journey(db, user.id);
  if (where.stage === "foundations") redirect("/onboarding");

  const { data: profile } = await db.from("users").select("timezone").eq("id", user.id).maybeSingle();
  const zone = safeZone(profile?.timezone);

  // Before there is a book, the first interview is today's whole job.
  if (where.stage === "interview") {
    const { data: open } = await db
      .from("sessions")
      .select("state")
      .eq("user_id", user.id)
      .eq("kind", "onboarding")
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const asked = ((open?.state as { asked?: number[] } | null)?.asked ?? []).length;
    return (
      <main className="page-narrow rise">
        <p className="eyebrow">Your first interview</p>
        <h1 className="question">
          {asked > 0 ? "Pick up where you left off." : "Twenty minutes, out loud, and the book begins."}
        </h1>
        <p className="lede">
          {asked > 0
            ? "Your answers so far are kept. Stop again whenever you like."
            : "Questions about a real day, a real person, a real decision. Stop whenever you like — it picks up where you left off."}
        </p>
        <Link className="button" href="/interview">
          {asked > 0 ? "Continue the interview" : "Start the interview"}
        </Link>
      </main>
    );
  }

  const chaptersOn = (process.env.SOFAR_PROCESS_SESSIONS ?? "").toLowerCase() === "on";
  const [question, quiet, streak, unread, since] = await Promise.all([
    todaysQuestion(db, user.id, zone),
    isQuiet(db, user.id),
    computeStreak(db, user.id, zone),
    db
      .from("chapters")
      .select("id, title, number, kind")
      .eq("user_id", user.id)
      .eq("status", "draft")
      .neq("kind", "sofar")
      .order("created_at", { ascending: false }),
    chaptersOn ? answersSinceLastChapter(db, user.id) : Promise.resolve(0),
  ]);
  await awardMarks(db, user.id, streak);
  const marks = await earnedMarks(db, user.id);
  const waiting = unread.data ?? [];
  const toGo = Math.max(0, UNLOCK_THRESHOLD - since);

  return (
    <main className="page-narrow rise">
      {waiting.length > 0 && (
        <Link className="arrival" href={`/book#chapter-${waiting[0].id}`}>
          <span className="arrival-rib" aria-hidden="true" />
          <span className="arrival-text">
            <span className="arrival-label">
              {waiting.length === 1 ? "A new chapter" : `${WORDS[waiting.length] ?? waiting.length} new chapters`}
            </span>
            <span className="arrival-title">{waiting[0].title}</span>
          </span>
          <span className="arrival-go" aria-hidden="true">Read</span>
        </Link>
      )}

      <p className="eyebrow">Today</p>
      {question ? (
        <>
          <h1 className="question">{question.text}</h1>
          {question.answered ? (
            <div className="form">
              <p className="lede">Answered for today. Tomorrow&rsquo;s arrives at eight.</p>
              {question.transcript && (
                <p className="heard">
                  <span className="heard-label">Heard</span> {question.transcript}
                </p>
              )}
              <InstallCard />
            </div>
          ) : (
            <TodayAnswer questionId={question.id} />
          )}
        </>
      ) : quiet ? (
        <>
          <h1 className="question">Good to have you back.</h1>
          <p className="lede">
            The questions stopped while you were away, so none piled up. Answer today&rsquo;s and they arrive
            every morning at eight again.
          </p>
          <AskNow />
        </>
      ) : (
        <>
          <h1 className="question">Your question arrives at eight.</h1>
          <p className="lede">Thirty seconds, out loud. Or ask for it now.</p>
          <AskNow />
        </>
      )}

      {chaptersOn && (
        <p className="progress-line">
          {toGo === 0
            ? "The next chapter is being written from what you've said."
            : `${toGo === 1 ? "One more answer" : `${WORDS[toGo] ? WORDS[toGo][0].toUpperCase() + WORDS[toGo].slice(1) : toGo} more answers`} and the next chapter is written.`}
        </p>
      )}

      <div className="today-foot">
        <StreakStrip streak={streak} marks={marks} />
      </div>
    </main>
  );
}
