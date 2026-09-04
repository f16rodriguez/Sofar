"use client";

// The interview screen (SPEC §3.3, §6). Text question, voice answer — the
// locked v1 interaction (concept §11).
//
// Deliberately plain: one question, one button, a clock. Nothing on this
// screen evaluates the person, congratulates them, or shows progress toward a
// goal. It is a recorder with good questions.

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "asking" | "recording" | "sending" | "done" | "error";

export default function Recorder() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState("");
  const [announceLast, setAnnounceLast] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(1080);
  const [heard, setHeard] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const sessionId = useRef<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const begin = useCallback(async () => {
    setPhase("sending");
    setProblem(null);
    try {
      const res = await fetch("/api/interview/start", {
        method: "POST",
      });
      if (!res.ok) throw new Error("could not start");
      const data = await res.json();
      sessionId.current = data.sessionId;
      setQuestion(data.question);
      setAnnounceLast(data.announceLast);
      setSecondsLeft(data.secondsLeft);
      setPhase("asking");
    } catch {
      setProblem("The interview could not start. Try again.");
      setPhase("error");
    }
  }, []);

  const send = useCallback(
    async (audio: Blob | null) => {
      setPhase("sending");
      try {
        const form = new FormData();
        form.set("sessionId", sessionId.current ?? "");
        form.set("question", question);
        if (audio) form.set("audio", audio, "answer.webm");
        else form.set("text", typed);

        const res = await fetch("/api/interview/answer", { method: "POST", body: form });
        if (!res.ok) throw new Error("could not send");
        const data = await res.json();

        setHeard(data.transcript || null);
        setTyped("");
        setSecondsLeft(data.secondsLeft);

        if (data.done) {
          await fetch("/api/interview/end", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sessionId.current }),
          });
          setPhase("done");
          return;
        }
        setQuestion(data.question);
        setAnnounceLast(data.announceLast);
        setPhase("asking");
      } catch {
        // The answer is not lost — nothing is cleared until it lands.
        setProblem("That answer did not send. Your recording is still here; try again.");
        setPhase("error");
      }
    },
    [question, typed],
  );

  const startRecording = useCallback(async () => {
    setProblem(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 32 kbps opus (SPEC §3.3) — an hour of speech is about 14 MB.
      const mr = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 32000,
      });
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void send(new Blob(chunks.current, { type: "audio/webm" }));
      };
      recorder.current = mr;
      mr.start();
      setPhase("recording");
    } catch {
      setProblem("No microphone. You can type your answer instead.");
      setPhase("asking");
    }
  }, [send]);

  const stopRecording = useCallback(() => {
    recorder.current?.stop();
    recorder.current = null;
  }, []);

  // The clock only runs while a question is on screen. Thinking time is not
  // charged to the twenty minutes; only answers and turns are (SPEC §4).
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  if (phase === "idle") {
    return (
      <div style={S.wrap} className="rise">
        <p style={S.lede}>
          Twenty minutes of questions. Answer out loud, the way you would to a
          person across a table. You can skip anything — just say skip.
        </p>
        <button style={S.primary} onClick={begin}>
          Start the interview
        </button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div style={S.wrap} className="rise">
        <h1 style={S.question}>That&rsquo;s everything.</h1>
        <p style={S.lede}>Your chapters are being written.</p>
        <a href="/book" style={{ ...S.primary, textDecoration: "none" }}>
          The book so far
        </a>
      </div>
    );
  }

  return (
    <div style={S.wrap} className="rise" key={question}>
      <div style={S.clock}>
        {minutes}:{seconds}
      </div>

      {announceLast && <p style={S.last}>This is the last question.</p>}
      {phase === "recording" && (
        <p style={S.last} aria-live="polite">
          Listening
        </p>
      )}
      <h1 style={S.question}>{question}</h1>

      {phase === "recording" ? (
        <button style={{ ...S.primary, ...S.stop }} className="listening" onClick={stopRecording}>
          Done answering
        </button>
      ) : (
        <button style={S.primary} onClick={startRecording} disabled={phase === "sending"}>
          {phase === "sending" ? "One moment" : "Answer"}
        </button>
      )}

      <details style={S.details}>
        <summary style={S.summary}>Type instead</summary>
        <textarea
          style={S.textarea}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          rows={4}
        />
        <button
          style={S.secondary}
          onClick={() => void send(null)}
          disabled={typed.trim().length === 0 || phase === "sending"}
        >
          Send
        </button>
      </details>

      {problem && <p style={S.problem}>{problem}</p>}
      {heard && (
        <p style={S.heard}>
          <span style={S.heardLabel}>Heard</span> {heard}
        </p>
      )}
    </div>
  );
}

// SPEC §6: cream, ink, oxblood — oxblood on the answer button only.
const S: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: "34rem",
    margin: "0 auto",
    padding: "clamp(32px, 8vh, 80px) 24px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  clock: {
    fontFamily: "var(--font-chrome)",
    fontSize: "13px",
    letterSpacing: ".08em",
    color: "#7a746a",
    fontVariantNumeric: "tabular-nums",
  },
  last: {
    fontFamily: "var(--font-chrome)",
    fontSize: "13px",
    letterSpacing: ".08em",
    textTransform: "uppercase",
    color: "#7a2e2a",
    margin: 0,
  },
  question: {
    fontFamily: "var(--font-book)",
    fontWeight: 400,
    fontSize: "clamp(24px, 4vw, 31px)",
    lineHeight: 1.25,
    letterSpacing: "-.01em",
    margin: 0,
    textWrap: "balance",
  },
  lede: {
    fontFamily: "var(--font-book)",
    fontSize: "19px",
    lineHeight: 1.55,
    color: "#3d3932",
    margin: 0,
  },
  primary: {
    alignSelf: "flex-start",
    fontFamily: "var(--font-chrome)",
    fontSize: "16px",
    fontWeight: 500,
    background: "#7a2e2a",
    color: "#f4eee2",
    border: "none",
    borderRadius: "4px",
    padding: "16px 26px",
    cursor: "pointer",
  },
  stop: { background: "#1c1a17" },
  secondary: {
    fontFamily: "var(--font-chrome)",
    fontSize: "14px",
    background: "none",
    color: "#1c1a17",
    border: "1px solid #d9d0bf",
    borderRadius: "4px",
    padding: "10px 16px",
    cursor: "pointer",
    marginTop: "8px",
  },
  details: { fontFamily: "var(--font-chrome)", fontSize: "14px" },
  summary: { color: "#7a746a", cursor: "pointer" },
  textarea: {
    width: "100%",
    marginTop: "10px",
    padding: "12px",
    fontFamily: "var(--font-book)",
    fontSize: "17px",
    lineHeight: 1.5,
    border: "1px solid #d9d0bf",
    borderRadius: "4px",
    background: "#fbf7ef",
    color: "#1c1a17",
    resize: "vertical",
  },
  problem: {
    fontFamily: "var(--font-chrome)",
    fontSize: "14px",
    color: "#7a2e2a",
    margin: 0,
  },
  heard: {
    fontFamily: "var(--font-book)",
    fontSize: "16px",
    lineHeight: 1.5,
    color: "#7a746a",
    borderTop: "1px solid #d9d0bf",
    paddingTop: "16px",
    margin: 0,
  },
  heardLabel: {
    fontFamily: "var(--font-chrome)",
    fontSize: "11px",
    letterSpacing: ".1em",
    textTransform: "uppercase",
    marginRight: "8px",
  },
};
