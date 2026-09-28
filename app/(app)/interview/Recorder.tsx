"use client";

// The interview screen (SPEC §3.3, §6). Text question, voice answer — the
// locked v1 interaction (concept §11).
//
// Deliberately plain: one question, one button, a clock. Nothing on this
// screen evaluates the person, congratulates them, or shows progress toward a
// goal. It is a recorder with good questions.

import { useCallback, useEffect, useRef, useState } from "react";
import { supportedMimeType, micProblem, fileNameFor, AUDIO_BITS_PER_SECOND } from "@/lib/recording";

type Phase = "idle" | "asking" | "recording" | "sending" | "done" | "error";

export default function Recorder() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState("");
  const [announceLast, setAnnounceLast] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(1080);
  const [heard, setHeard] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const sessionId = useRef<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const begin = useCallback(async (fresh = false) => {
    setPhase("sending");
    setProblem(null);
    try {
      const res = await fetch(`/api/interview/start${fresh ? "?fresh=1" : ""}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("could not start");
      const data = await res.json();
      sessionId.current = data.sessionId;
      setQuestion(data.question);
      setAnnounceLast(data.announceLast);
      setSecondsLeft(data.secondsLeft);
      setResumed(Boolean(data.resumed));
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
        if (audio) form.set("audio", audio, fileNameFor(audio.type));
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
      const mimeType = supportedMimeType();
      const mr = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        // The recorder's own type, not an assumed one: the file has to be
        // labelled as what it actually is for transcription to read it.
        void send(new Blob(chunks.current, { type: mr.mimeType || mimeType || "audio/webm" }));
      };
      mr.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        setProblem("The recording stopped unexpectedly. Try again, or type your answer instead.");
        setPhase("asking");
      };
      recorder.current = mr;
      mr.start();
      setPhase("recording");
    } catch (err) {
      setProblem(micProblem(err));
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

  // Minutes, in words. "18:00" read as six in the evening, and a resumed
  // session carries fractional seconds that rendered as 17:18.4200000000001.
  const minutesLeft = Math.max(0, Math.round(secondsLeft / 60));
  const clock =
    minutesLeft >= 2 ? `About ${minutesLeft} minutes left` : minutesLeft === 1 ? "About a minute left" : "Nearly done";

  if (phase === "idle") {
    return (
      <div style={S.wrap} className="rise">
        <p style={S.lede}>
          About twenty minutes of questions. Answer out loud, the way you would
          to a person across a table. Say &ldquo;skip&rdquo; to anything.
        </p>
        <p style={S.aside}>
          Stop whenever you like. Your answers are kept, and it picks up where
          you left off.
        </p>
        <button style={S.primary} onClick={() => void begin()}>
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
        {clock}
      </div>

      {resumed && (
        <p style={S.resumed}>
          Picking up where you left off.{" "}
          <button
            type="button"
            style={S.inlineLink}
            onClick={() => {
              if (window.confirm("Start the interview over from the first question? Your earlier answers stay in the record.")) {
                void begin(true);
              }
            }}
          >
            Start over instead
          </button>
        </p>
      )}
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
      {phase !== "recording" && phase !== "sending" && (
        <a href="/today" style={S.stopLink}>
          Stop for now — your answers are kept
        </a>
      )}
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
    color: "#7a746a",
  },
  resumed: {
    fontFamily: "var(--font-chrome)",
    fontSize: "13px",
    color: "#7a746a",
    margin: 0,
  },
  inlineLink: {
    fontFamily: "var(--font-chrome)",
    fontSize: "13px",
    color: "#1c1a17",
    background: "none",
    border: "none",
    padding: 0,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    cursor: "pointer",
  },
  aside: {
    fontFamily: "var(--font-chrome)",
    fontSize: "14px",
    lineHeight: 1.55,
    color: "#7a746a",
    margin: 0,
  },
  stopLink: {
    fontFamily: "var(--font-chrome)",
    fontSize: "13px",
    color: "#7a746a",
    alignSelf: "flex-start",
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
