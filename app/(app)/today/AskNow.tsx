"use client";

import { useState } from "react";

export default function AskNow() {
  const [state, setState] = useState<"idle" | "working" | "none" | "error">("idle");
  async function ask() {
    setState("working");
    try {
      const res = await fetch("/api/daily/question", { method: "POST" });
      if (res.status === 204) return setState("none");
      if (!res.ok) throw new Error(String(res.status));
      window.location.reload();
    } catch {
      setState("error");
    }
  }
  return (
    <div className="form">
      <button type="button" className="button-quiet" onClick={() => void ask()} disabled={state === "working"}>
        {state === "working" ? "Finding one" : "Ask me one now"}
      </button>
      {state === "none" && <p className="hint">Nothing worth asking today. Tomorrow.</p>}
      {state === "error" && <p className="problem">That didn&rsquo;t work. Try again in a moment.</p>}
    </div>
  );
}
