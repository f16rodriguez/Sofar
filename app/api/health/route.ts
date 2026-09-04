// GET /api/health — is this deployment able to do its job? Booleans only:
// which env vars are present (never their values), whether the prompt files
// and fonts the functions read from disk are actually in the bundle. Used
// after each deploy; the prompts are loaded at runtime by every LLM call and
// a missing file would only show up mid-interview otherwise.

import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "DEEPGRAM_API_KEY",
  "SOFAR_ALLOWED_EMAILS",
  "SITE_URL",
];

function readable(rel: string): boolean {
  try {
    fs.accessSync(path.join(process.cwd(), rel), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const env = Object.fromEntries(ENV.map((k) => [k, Boolean(process.env[k])]));
  const files = {
    "prompts/preamble.md": readable("prompts/preamble.md"),
    "prompts/interviewer.md": readable("prompts/interviewer.md"),
    "prompts/sofar.md": readable("prompts/sofar.md"),
    "prompts/daily-question.md": readable("prompts/daily-question.md"),
  };
  const ok = Object.values(env).every(Boolean) && Object.values(files).every(Boolean);
  return NextResponse.json(
    { ok, env, files, node: process.version },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
