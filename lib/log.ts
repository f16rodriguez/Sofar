// SPEC §7: transcripts and audio never written to logs; redact in error
// reporting. All server-side logging goes through this module. Never
// interpolate transcript text, chapter bodies, or memory content into an
// Error message or a log line.

const SENSITIVE_KEYS = new Set([
  "transcript",
  "segments",
  "text",
  "body_md",
  "proposed_body_md",
  "quotes",
  "statement",
  "rationale",
  "content",
  "profile",
  "what_happened",
  "what",
  "outcome",
  "what_it_cost",
  "audio",
  "prompt",
  "messages",
  "system",
]);

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k) ? "[redacted]" : redact(v);
    }
    return out;
  }
  return value;
}

export const log = {
  info(event: string, fields?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: "info", event, ...(fields ? (redact(fields) as object) : {}) }));
  },
  error(event: string, err?: unknown, fields?: Record<string, unknown>) {
    const cause =
      err instanceof Error ? { name: err.name, message: err.message } : undefined;
    console.error(
      JSON.stringify({ level: "error", event, cause, ...(fields ? (redact(fields) as object) : {}) }),
    );
  },
};
