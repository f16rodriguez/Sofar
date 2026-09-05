"use client";

// One question, one answer (SPEC §3.4). The same recorder as the interview,
// without the clock: thirty seconds is a guide, not a cap.

import { useCallback, useRef, useState } from "react";
import { supportedMimeType, micProblem, fileNameFor, AUDIO_BITS_PER_SECOND } from "@/lib/recording";

type Phase = "idle" | "recording" | "sending" | "done" | "error";

export default function TodayAnswer({ questionId }: { questionId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const send = useCallback(
    async (audio: Blob | null) => {
      setPhase("sending");
      setProblem(null);
      try {
        const form = new FormData();
        form.set("questionId", questionId);
        if (audio) form.set("audio", audio, fileNameFor(audio.type));
        else form.set("text", typed);
        const res = await fetch("/api/daily/answer", { method: "POST", body: form });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { transcript?: string };
        setHeard(data.transcript ?? null);
        setPhase("done");
      } catch {
        setProblem("That didn't send. Your answer is still here; try again.");
        setPhase("error");
      }
    },
    [questionId, typed],
  );

  const start = useCallback(async () => {
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
        void send(new Blob(chunks.current, { type: mr.mimeType || mimeType || "audio/webm" }));
      };
      mr.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        setProblem("The recording stopped unexpectedly. Try again, or type instead.");
        setPhase("idle");
      };
      recorder.current = mr;
      mr.start();
      setPhase("recording");
    } catch (err) {
      setProblem(micProblem(err));
      setPhase("idle");
    }
  }, [send]);

  const stop = useCallback(() => {
    recorder.current?.stop();
    recorder.current = null;
  }, []);

  if (phase === "done") {
    return (
      <div className="form rise">
        <p className="lede">Answered for today. Tomorrow at eight.</p>
        {heard && (
          <p className="heard">
            <span className="heard-label">Heard</span> {heard}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="form">
      {phase === "recording" && (
        <p className="eyebrow" aria-live="polite">
          Listening
        </p>
      )}
      {phase === "recording" ? (
        <button type="button" className="button listening" style={{ background: "#1c1a17" }} onClick={stop}>
          Done answering
        </button>
      ) : (
        <button type="button" className="button" onClick={() => void start()} disabled={phase === "sending"}>
          {phase === "sending" ? "One moment" : "Answer"}
        </button>
      )}
      <details className="details">
        <summary className="hint" style={{ cursor: "pointer" }}>Type instead</summary>
        <textarea className="input" style={{ marginTop: 10, fontFamily: "var(--font-book)", fontSize: 17 }} rows={4} value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button
          type="button"
          className="button-quiet"
          style={{ marginTop: 8 }}
          onClick={() => void send(null)}
          disabled={typed.trim().length === 0 || phase === "sending"}
        >
          Send
        </button>
      </details>
      {problem && <p className="problem">{problem}</p>}
    </div>
  );
}
