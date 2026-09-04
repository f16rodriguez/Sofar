"use client";

// Delete everything (SPEC §3.9). The export comes first — a client gate, as
// the spec says — then the word, then the request. There is no undo, so
// there is no default action and nothing here is one tap.

import { useState } from "react";

export default function DeleteAccount() {
  const [exported, setExported] = useState(false);
  const [word, setWord] = useState("");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function request() {
    setState("working");
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: word.trim().toLowerCase(), exported }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("done");
      window.location.href = "/signin?deleted=1";
    } catch {
      setState("error");
    }
  }

  return (
    <div className="form" style={{ gap: 14 }}>
      <p className="hint">
        Everything goes: chapters, answers, recordings, the memory the book was written from. Your
        book is deleted within 24 hours, and nothing is recoverable after that.
      </p>
      <ol className="steps">
        <li>
          <a
            className="button-quiet"
            href="/api/export"
            onClick={() => setExported(true)}
            download
          >
            {exported ? "Exported — download it again" : "First, export your book"}
          </a>
        </li>
        <li>
          <label className="hint" htmlFor="delete-word">
            Then type <span className="mono">delete</span>
          </label>
          <input
            id="delete-word"
            className="input"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            disabled={!exported}
            autoComplete="off"
            spellCheck={false}
          />
        </li>
        <li>
          <button
            type="button"
            className="button-danger"
            onClick={() => void request()}
            disabled={!exported || word.trim().toLowerCase() !== "delete" || state === "working"}
          >
            {state === "working" ? "Recording the request" : "Delete everything"}
          </button>
        </li>
      </ol>
      {state === "error" && <p className="problem">That didn&rsquo;t go through. Nothing has been deleted.</p>}
    </div>
  );
}
