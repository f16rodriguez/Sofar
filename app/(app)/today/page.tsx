// Today (SPEC §3.4, §6). One question, by voice, thirty seconds. Arrives at
// eight in the person's own morning; can be asked for early.

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { todaysQuestion } from "@/lib/daily/question";
import { computeStreak, awardMarks, earnedMarks } from "@/lib/daily/streak";
import { safeZone } from "@/lib/daily/time";
import StreakStrip from "../StreakStrip";
import TodayAnswer from "./TodayAnswer";
import AskNow from "./AskNow";

export const metadata = { title: "Sofar — Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const db = serviceClient();
  const { data: profile } = await db
    .from("users")
    .select("timezone, pronoun, birthplace, recording_consent_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.pronoun || !profile?.birthplace || !profile?.recording_consent_at) redirect("/onboarding");

  const zone = safeZone(profile.timezone);
  const [question, streak] = await Promise.all([
    todaysQuestion(db, user.id, zone),
    computeStreak(db, user.id, zone),
  ]);
  await awardMarks(db, user.id, streak);
  const marks = await earnedMarks(db, user.id);

  return (
    <main className="page-narrow rise">
      <StreakStrip streak={streak} marks={marks} />
      {question ? (
        <>
          <p className="eyebrow">Today</p>
          <h1 className="question">{question.text}</h1>
          {question.answered ? (
            <div className="form">
              <p className="lede">Answered for today. Tomorrow at eight.</p>
              {question.transcript && (
                <p className="heard">
                  <span className="heard-label">Heard</span> {question.transcript}
                </p>
              )}
            </div>
          ) : (
            <TodayAnswer questionId={question.id} />
          )}
        </>
      ) : (
        <>
          <p className="eyebrow">Today</p>
          <h1 className="question">Your question arrives at eight.</h1>
          <p className="lede">Thirty seconds, out loud. Or ask for it now.</p>
          <AskNow />
        </>
      )}
    </main>
  );
}
