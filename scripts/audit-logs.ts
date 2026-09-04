// Log redaction audit (SPEC §7, M6): transcripts, audio and prose never reach
// a log line. Static, cheap, runs in CI-time: every server module must log
// through lib/log.ts, and no log call may carry a field that holds a
// person's words.
//
//   npm run audit:logs

import fs from "node:fs";
import path from "node:path";

const ROOTS = ["app", "lib", "netlify", "middleware.ts"];
const ALLOWED_CONSOLE = new Set(["lib/log.ts"]);
const SENSITIVE = /\b(transcript|segments|body_md|proposed_body_md|audio|quote|quotes|statement|rationale|what_happened|outcome|prompt|messages)\b/;

const offenders: string[] = [];

function walk(p: string): string[] {
  const st = fs.statSync(p);
  if (st.isFile()) return /\.(ts|tsx|mts)$/.test(p) ? [p] : [];
  return fs.readdirSync(p).flatMap((e) => walk(path.join(p, e)));
}

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const rel = file.replace(/\\/g, "/");
    const src = fs.readFileSync(file, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      const at = `${rel}:${i + 1}`;
      if (/\bconsole\.(log|error|warn|info|debug)\(/.test(line) && !ALLOWED_CONSOLE.has(rel)) {
        offenders.push(`${at}: console.* outside lib/log.ts — ${line.trim()}`);
      }
      if (/\blog\.(info|error)\(/.test(line)) {
        // The call may span lines; look at the statement up to its semicolon.
        const stmt = lines.slice(i, i + 8).join(" ").split(";")[0];
        const fields = stmt.replace(/^[^,]*,/, ""); // drop the event name
        if (SENSITIVE.test(fields)) {
          offenders.push(`${at}: log call carries a sensitive field — ${stmt.trim().slice(0, 120)}`);
        }
      }
    });
  }
}

// next.config must not switch on request logging.
const nextConfig = fs.readFileSync("next.config.mjs", "utf8");
if (/logging\s*:/.test(nextConfig) && /fullUrl|incomingRequests/.test(nextConfig)) {
  offenders.push("next.config.mjs: request logging is enabled");
}

if (offenders.length > 0) {
  console.error("log audit: FAILED");
  for (const o of offenders) console.error("  " + o);
  process.exit(1);
}
console.log("log audit: clean — every server log goes through lib/log.ts and carries no transcript, audio or prose field");
