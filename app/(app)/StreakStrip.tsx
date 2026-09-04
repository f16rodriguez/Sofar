// The streak strip and marks (SPEC §6). Quiet: a number, a line, the marks
// earned. Nothing here nags — a dead streak is a fact, not a failure.

import { MARKS, type MarkKey, type Streak } from "@/lib/daily/streak";

export default function StreakStrip({ streak, marks }: { streak: Streak; marks: { key: MarkKey; earned_at: string }[] }) {
  const line =
    streak.days === 0
      ? streak.totalDays === 0
        ? "No days yet."
        : "The streak is resting."
      : `${streak.days} ${streak.days === 1 ? "day" : "days"} in a row${streak.answeredToday ? "" : " — today still open"}.`;
  return (
    <div className="strip">
      <span className="strip-line">{line}</span>
      {marks.length > 0 && (
        <span className="strip-marks">
          {marks.map((m) => (
            <span key={m.key} className="mark" title={new Date(m.earned_at).toDateString()}>
              {MARKS[m.key]}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
