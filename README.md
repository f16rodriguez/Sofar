# Sofar

A living autobiography. Users answer questions by voice; the app extracts
structured memory from transcripts and writes a book that revises itself.

- **`SPEC.md`** — full technical spec and build order. Milestones M0–M7, one
  at a time, each gated on its acceptance test.
- **`CLAUDE.md`** — non-negotiables and conventions for anyone (human or
  agent) working in this repo.
- **`sofar-phase0-interview.md`** *(founder-supplied, not yet in repo)* —
  interviewer rules, seed script, prose rules. Loaded verbatim into prompts.

## Status

| Milestone | State |
|---|---|
| M0 — repo & infrastructure | Provisioned & schema live; RLS verified on the real DB. Full acceptance run pending STT/LLM keys |
| M1–M7 | Not started (M1 next, after M0 accepts) |

## Provisioned infrastructure

- **Supabase project**: `Sofar` (`onfxavpzvdazocvandeh`, us-east-1) —
  `https://onfxavpzvdazocvandeh.supabase.co`. Migrations 0001–0003 applied;
  security advisors clean; two-user RLS test passed against the live DB
  (cross-user reads return 0 rows, forged inserts rejected by policy).

## Setup

1. **Env** — copy `.env.example` to `.env.local`. URL and anon key come from
   the project above; the service role key from the dashboard
   (Settings → API — server-side only, never in the browser). Add
   `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY`.
2. **Install & check** — `npm install`, `npm run typecheck`, `npm run build`.
3. **M0 acceptance** — `npm run accept:m0`. It creates two throwaway users,
   proves user B cannot read user A's answer, and round-trips the STT and
   LLM wrappers. All checks must pass before M1 starts.

## Layout

```
app/                    Next.js App Router (P0 screens land in M2+)
lib/llm.ts              All Anthropic calls: routing (SPEC §5), typed schemas,
                        shared preamble, prompt caching
lib/stt.ts              transcribe(audio) → {text, segments} (Deepgram batch)
lib/repo.ts             Sole access path for answers.transcript and
                        chapters.body_md (encryption seam, SPEC §7)
lib/memory.ts           Sole write path for memory_* tables
lib/supabase.ts         Service/anon/user client factories
lib/log.ts              Redacting logger — transcripts never reach logs
prompts/                Versioned prompt markdown (see prompts/README.md)
supabase/migrations/    Schema. Never edit an applied migration.
scripts/m0-accept.ts    M0 acceptance test
```

## Deploy

Netlify (`netlify.toml`): Next.js runtime plugin, `npm run build`. Set the
same env vars in the Netlify site config. Scheduled functions (daily
questions, audio retention, So far) arrive in M4/M6.
