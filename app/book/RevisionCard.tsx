"use client";

// A proposed revision (SPEC §5.5, M3). Revisions are proposed, never applied.
//
// The person sees the one-line reason and the proposed text, and decides.
// Declining changes nothing — not the chapter, not the memory it came from.
// That is the acceptance test for this milestone, and it is why there is no
// third option here and no default action.

import { useState } from "react";

export default function RevisionCard({
  revisionId,
  rationale,
  proposed,
}: {
  revisionId: string;
  rationale: string;
  proposed: string;
}) {
  const [state, setState] = useState<"closed" | "open" | "working" | "accepted" | "declined">(
    "closed",
  );
  const [problem, setProblem] = useState<string | null>(null);

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

  if (state === "accepted") {
    return <p style={S.settled}>Revised.</p>;
  }
  if (state === "declined") {
    return <p style={S.settled}>Left as it was.</p>;
  }

  return (
    <aside style={S.card}>
      <p style={S.rationale}>{rationale}</p>

      {state === "closed" ? (
        <button style={S.link} onClick={() => setState("open")}>
          See the revision
        </button>
      ) : (
        <>
          <div style={S.proposed}>
            {proposed
              .split(/\n\s*\n/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i} style={S.proposedParagraph}>
                  {paragraph}
                </p>
              ))}
          </div>
          <div style={S.actions}>
            <button
              style={S.accept}
              onClick={() => void decide("accepted")}
              disabled={state === "working"}
            >
              Use this
            </button>
            <button
              style={S.decline}
              onClick={() => void decide("declined")}
              disabled={state === "working"}
            >
              Keep what&rsquo;s there
            </button>
          </div>
        </>
      )}

      {problem && <p style={S.problem}>{problem}</p>}
    </aside>
  );
}

const S: Record<string, React.CSSProperties> = {
  card: {
    marginTop: 32,
    borderTop: "1px solid #d9d0bf",
    paddingTop: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  rationale: {
    fontFamily: "var(--font-chrome)",
    fontSize: 14,
    lineHeight: 1.6,
    color: "#3d3932",
    margin: 0,
  },
  link: {
    alignSelf: "flex-start",
    fontFamily: "var(--font-chrome)",
    fontSize: 14,
    background: "none",
    border: "none",
    padding: 0,
    color: "#7a2e2a",
    textDecoration: "underline",
    cursor: "pointer",
  },
  proposed: {
    background: "#f4eee2",
    border: "1px solid #d9d0bf",
    padding: "20px 22px",
  },
  proposedParagraph: {
    fontFamily: "var(--font-book)",
    fontSize: 17,
    lineHeight: 1.6,
    margin: "0 0 1em",
  },
  actions: { display: "flex", gap: 10, flexWrap: "wrap" },
  accept: {
    fontFamily: "var(--font-chrome)",
    fontSize: 15,
    fontWeight: 500,
    background: "#7a2e2a",
    color: "#f4eee2",
    border: "none",
    borderRadius: 4,
    padding: "12px 20px",
    cursor: "pointer",
  },
  decline: {
    fontFamily: "var(--font-chrome)",
    fontSize: 15,
    background: "none",
    color: "#1c1a17",
    border: "1px solid #d9d0bf",
    borderRadius: 4,
    padding: "12px 20px",
    cursor: "pointer",
  },
  settled: {
    fontFamily: "var(--font-chrome)",
    fontSize: 13,
    color: "#7a746a",
    marginTop: 28,
    borderTop: "1px solid #d9d0bf",
    paddingTop: 16,
  },
  problem: {
    fontFamily: "var(--font-chrome)",
    fontSize: 14,
    color: "#7a2e2a",
    margin: 0,
  },
};
