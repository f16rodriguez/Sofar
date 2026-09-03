# Sofar

A living autobiography. Users answer questions by voice; the app extracts
structured memory from transcripts and writes a book that revises itself.

- **`SPEC.md`** — full technical spec and build order. Milestones M0–M7, one
  at a time, each gated on its acceptance test.
- **`CLAUDE.md`** — non-negotiables and conventions for anyone (human or
  agent) working in this repo.
- **`sofar-concept.md`** / **`sofar-phase0-interview.md`** — product concept;
  interviewer rules, seed script, prose rules (§2 + §5 are loaded verbatim as
  `prompts/preamble.md`).
- **`design/landing.html`** — approved landing page, static, wired up in M7.

## Status

| Milestone | State |
|---|---|
| M0 — repo & infrastructure | **PASSED** — acceptance 7/7 against live infrastructure |
| M1 — pipeline CLI | **Mechanically passed** on the founder's interview: every paragraph traces to a transcript quote (enforced), reruns create no duplicate rows, three chapters generated at ~$0.46/run. Prose is honest and short — 780 words from a terse 20 minutes. Length is bounded by the interview, not the writer (`docs/interview-findings.md`) |
| M2–M7 | Not started |

## Provisioned infrastructure

- **Supabase project**: `Sofar` (`onfxavpzvdazocvandeh`, us-east-1) —
  `https://onfxavpzvdazocvandeh.supabase.co`. Lives in its own **Sofar**
  organization, separate from any other business, on the **Free** plan.
  **Upgrade that org to Pro before the first real trial user** — the Free
  plan has no daily backups and sleeps after inactivity, which is fine for
  an empty dev database and not fine for people's books.
  Migrations 0001–0004 applied;
  security advisors clean; two-user RLS test passed against the live DB
  (cross-user reads return 0 rows, forged inserts rejected by policy).
  Interview seed bank (Q1–Q12) loaded. The daily-question seed bank (SPEC
  §5.6) is still founder-pending and blocks M4 only.

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
