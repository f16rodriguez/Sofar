"use client";

// A proposed revision (SPEC §5.5). Revisions are proposed, never applied.
//
// The person sees the one-line reason and exactly what would change —
// sentences struck and sentences added, in place — and decides. Declining
// changes nothing: not the chapter, not the memory it came from. That is the
// acceptance test for this milestone, and it is why there is no third option
// and no default.

import { useMemo, useState } from "react";
import { diffChapter } from "@/lib/diff";
import { bookText } from "@/lib/typography";

export default function RevisionCard({
  revisionId,
  rationale,
  original,
  proposed,
}: {
  revisionId: string;
  rationale: string;
  original: string;
  proposed: string;
}) {
  const [state, setState] = useState<"closed" | "open" | "working" | "accepted" | "declined">("closed");
  const [problem, setProblem] = useState<string | null>(null);
  const diff = useMemo(() => diffChapter(original, proposed), [original, proposed]);

  async function decide(decision: "accepted" | "declined") {
    setState("working");
    setProblem(null);
    try {
      const res = await fetch("/api/revision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId, decision }),
      });
      if (!res.ok) throw new Error("failed");
      setState(decision);
      if (decision === "accepted") window.location.reload();
    } catch {
      setProblem("That didn't go through. Nothing has changed; try again.");
      setState("open");
    }
  }

  if (state === "accepted") return <p className="revision-settled">Revised.</p>;
  if (state === "declined") return <p className="revision-settled">Left as it was.</p>;

  const count =
    diff.changed === 0
      ? "No sentences change."
      : diff.changed <= 2
        ? "One sentence changes."
        : `About ${Math.ceil(diff.changed / 2)} sentences change.`;

  return (
    <aside className="revision">
      <p className="revision-eyebrow">A proposed revision</p>
      <p className="revision-why">{bookText(rationale)}</p>

      {state === "closed" ? (
        <button type="button" className="button-quiet" onClick={() => setState("open")}>
          See what would change
        </button>
      ) : (
        <>
          <p className="hint">{count} Struck text would go; underlined text would be new.</p>
          <div className="revision-text unfold">
            {diff.paragraphs.map((para, i) => (
              <p key={i}>
                {para.map((piece, j) =>
                  piece.kind === "same" ? (
                    <span key={j}>{bookText(piece.text)} </span>
                  ) : piece.kind === "added" ? (
                    <ins key={j}>{bookText(piece.text)}</ins>
                  ) : (
                    <del key={j}>{bookText(piece.text)}</del>
                  ),
                )}
              </p>
            ))}
          </div>
          <div className="row">
            <button type="button" className="button" onClick={() => void decide("accepted")} disabled={state === "working"}>
              Use this
            </button>
            <button type="button" className="button-quiet" onClick={() => void decide("declined")} disabled={state === "working"}>
              Keep what&rsquo;s there
            </button>
          </div>
        </>
      )}
      {problem && <p className="problem">{problem}</p>}
    </aside>
  );
}
