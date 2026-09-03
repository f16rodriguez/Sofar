# Sofar

A living autobiography. Users answer questions by voice; the app extracts structured
memory from transcripts and writes a book that revises itself. See SPEC.md for the full
technical spec and build order. See sofar-phase0-interview.md for interviewer rules,
the seed script, and prose rules — those rules are loaded verbatim into prompts.

## Stack
Next.js (App Router, TypeScript) · Supabase (Postgres, Auth, Storage, pgvector) ·
Netlify · Stripe · one batch STT provider behind lib/stt.ts · Anthropic API behind lib/llm.ts

## Build order
M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7, one at a time. Each milestone has an
acceptance test in SPEC.md §8. Do not start the next milestone until it passes.
Build the pipeline CLI (M1) before any UI.

## Non-negotiables
- Every paragraph of generated prose must cite at least one memory row; reject unsourced output.
- Nothing inferred reaches prose. memory_inferred and memory_unsaid are excluded from the chapter writer.
- Prose model floor is Sonnet-class. First three chapters, spine, and arc rewrites are Opus-class. Haiku only for the interviewer, daily question generation, and classification.
- Questions never mention the book, chapters, pages, or "your story." They ask for a day, place, person, sentence said, or number.
- Revisions are proposed, never applied. Canon changes only on explicit user accept.
- Transcripts and audio never appear in logs, analytics, or error reports.
- RLS on every table. Service role only in server functions.
- Audio is deleted at 60 days unless the user opted to keep it.

## Conventions
- All LLM calls go through lib/llm.ts with typed input/output schemas and the shared system preamble.
- All prompts live in /prompts as versioned markdown, loaded at runtime. No prompt strings inline in code.
- Memory writes go through lib/memory.ts. No direct table writes from routes.
- Migrations in /supabase/migrations. Never edit a migration that has been applied.
- Light-only UI. Cream #F4EEE2, ink #1C1A17, oxblood #7A2E2A. Newsreader for book text, Instrument Sans for chrome.

## Don't
- Don't add tables for Circle, public edition, library, or mailbag. They are P2.
- Don't build UI before M1 passes.
- Don't use a headless browser for PDF on Netlify.
- Don't invent seed questions. The seed bank is founder-supplied.
