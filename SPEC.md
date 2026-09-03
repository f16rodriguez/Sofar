# Sofar — Technical Spec & Build Backlog

*For hand-off to Claude Code. Drop this file at the repo root as `SPEC.md`, and the block at the end as `CLAUDE.md`. Build milestones in order. Do not start a milestone until the previous one passes its acceptance test.*

---

## 0. What this is

A living autobiography. The user answers questions by voice; a model extracts structured memory from the transcript and writes a book, chapter by chapter, that revises itself as it learns the person. Private by default. Product concept and design are in `sofar-concept.md`; interview script and prose rules are in `sofar-phase0-interview.md`. This document is how it's built.

**The pipeline is the product.** Transcript → memory → chapters. Everything else is a door into that pipeline. Build it first, as a CLI, and run it on the founder before any screen exists.

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js (App Router), TypeScript | PWA: manifest, service worker, web push (VAPID) |
| Data | Supabase — Postgres, Auth, Storage, pgvector | RLS on every table. Storage buckets private. |
| Hosting | Netlify | Scheduled functions for cron jobs |
| Billing | Stripe Checkout + Customer Portal | 14-day trial, card required, converts to Full monthly |
| Speech-to-text | One batch STT API (Deepgram Nova batch or OpenAI `gpt-4o-mini-transcribe`) | Pick one, wrap it behind `transcribe(audio) → {text, segments}` |
| LLM | Anthropic API | Routing in §5. Prompt caching on the memory context. |
| PDF | `@react-pdf/renderer` server-side | No headless browser on Netlify |
| Email | Resend or equivalent | Chapter-ready notice, trial reminders |

---

## 2. Data model (Postgres)

All tables carry `user_id`, `created_at`, `updated_at`, and RLS `user_id = auth.uid()`. Timestamps are `timestamptz`.

```
users
  id, email, book_name (nullable), pronoun (he|she|they), age, birthplace,
  current_city, prior_cities text[], occupation, occupation_since, household,
  family_of_origin, timezone, plan (trial|basic|full|none), trial_ends_at,
  stripe_customer_id, stripe_subscription_id, session_minutes_used (int, resets monthly),
  session_minutes_reset_at, style (third|first), onboarding_completed_at

sessions
  id, user_id, kind (onboarding|interview|daily|weekly), started_at, ended_at,
  minutes (numeric), status (active|processing|done|failed),
  state jsonb  -- interviewer state machine: block, question_idx, followups_used, seconds_left

questions
  id, user_id (nullable for seed questions), kind (foundation|event|stance|rationale),
  block (0..4 | daily | weekly), text, source (seed|generated|thread), thread_id (nullable),
  asked_at, session_id, parent_question_id (for follow-ups), order_idx

answers
  id, user_id, session_id, question_id, audio_path (nullable), transcript text,
  segments jsonb, duration_sec, input (voice|text), processed_at, audio_deleted_at

-- memory layer: every row links to the answer and span it came from
memory_people     id, user_id, label, relationship, first_answer_id, quotes jsonb, embedding vector(1536)
memory_places     id, user_id, label, when_text, what_happened, answer_id
memory_events     id, user_id, what, when_text, when_date (nullable), where_text, who uuid[],
                  outcome, answer_id, span_start, span_end, embedding vector(1536)
memory_stances    id, user_id, statement, rationale, origin_event_id (nullable),
                  stated_at, answer_id, superseded_by (nullable), embedding vector(1536)
memory_costs      id, user_id, stance_id, what_it_cost, answer_id
memory_threads    id, user_id, label, description, mention_count, first_seen_at, last_seen_at,
                  status (open|resolved), resolved_by_answer_id (nullable)
memory_voice      user_id (pk), profile jsonb  -- sentence_length, vocabulary, humor, avoids, repeats, self_reference
memory_unsaid     id, user_id, answer_id, text, allowed_in_book bool default false
memory_inferred   id, user_id, kind, content, answer_id  -- never reaches prose; kept for follow-up questions only

parts
  id, user_id, number, title, tension (text), status (provisional|proposed|canon), order_idx

chapters
  id, user_id, part_id (nullable), number, title, kind (prologue|chapter|interlude|sofar),
  body_md, status (draft|canon), version, model, source_answer_ids uuid[],
  source_memory_ids uuid[], word_count, canon_at

chapter_revisions
  id, chapter_id, user_id, proposed_body_md, rationale (one line), trigger_answer_ids uuid[],
  status (proposed|accepted|declined), model, decided_at

marks
  id, user_id, key (first_three|thirty_days|spine_found|hundred_pages|one_year), earned_at

push_subscriptions   id, user_id, endpoint, keys jsonb
deletion_jobs        id, user_id, kind (audio|account), run_after, status
```

**Derived, not stored:** streak (answers in a rolling 30-day window), page count (`sum(word_count) / 275`), chapter progress toward next unlock (answers since last chapter, threshold 3–7).

---

## 3. Core flows

### 3.1 Signup → trial
1. Email + password (Supabase Auth). Magic link acceptable.
2. Stripe Checkout, mode subscription, Full monthly price, `trial_period_days: 14`, card required, `payment_method_collection: always`.
3. Webhook sets `plan = trial`, `trial_ends_at`. On `invoice.paid` after trial → `plan = full`. On cancel → `plan = none` (book stays readable and exportable; no new questions).
4. Annual offer surfaced in-app at day 10 via Customer Portal deep link.

### 3.2 Block 0 (foundations)
Typed form, eight fields, under two minutes. Writes `users` columns directly. No LLM call.

### 3.3 Onboarding interview
1. Create `session(kind=onboarding)` with `state = {block:1, question_idx:0, followups_used:0, seconds_left:1080}`.
2. Client records answer per question (MediaRecorder, opus/webm, 32 kbps). Uploads to Storage. Creates `answer`.
3. Server transcribes, appends to session transcript, calls the **interviewer** (§5.1) with state + transcript → returns `{next_question, is_followup, block, announce_last}`.
4. Hard stop at 20 minutes: interviewer receives `seconds_left ≤ 60` and must close.
5. On end: `status = processing`. Run **extraction** (§5.2) → **merge** (§5.3) → **first three chapters** (§5.4, Opus). Mark `first_three` earned. Notify by push + email: "Your first three chapters are ready."
6. Target: chapters ready within 10 minutes of session end. Promise on the landing page is "by tomorrow" — beat it.

### 3.4 Daily question
- Cron per user timezone at their chosen hour (default 8am). **Daily question generator** (§5.6) picks one question from: an open thread, a gap in the memory graph, or the seed bank. Creates `question`, sends push.
- Answer flow same as 3.3 steps 2–3 without the interviewer; single question, optional one follow-up.
- After answer: extraction + merge on the single answer. Check chapter-unlock threshold; if met, **chapter writer** (§5.4, Sonnet) writes the next chapter as `draft`, user sees it, it becomes canon on first read.
- Check **revision proposer** (§5.5): if new memory touches source memory of a canon chapter, propose.

### 3.5 Weekly deep question
Same as daily, `kind = weekly`, allows two follow-ups, Sunday by default.

### 3.6 Interview sessions (Full only)
Same engine as 3.3, `kind = interview`, block-free: the interviewer works from open threads and gaps. Deduct `minutes` from `session_minutes_used`; refuse to start if cap (120) reached; top-up adds 60.

### 3.7 So far chapter
Monthly cron: regenerate `chapters.kind = sofar` from open threads + stated wants (§5.7). Always the last chapter. Always titled "So far."

### 3.8 Export
`GET /api/export` → PDF via react-pdf: title page (book_name or blank), parts, chapters in canon order, So far last. Free on every plan including cancelled.

### 3.9 Delete
`DELETE /api/account`: forces an export download first (client gate), then enqueues `deletion_job(kind=account)`; job hard-deletes rows and storage objects within 24h. Stripe subscription cancelled.

### 3.10 Audio retention
Daily cron: delete `answers.audio_path` objects where `created_at < now() - 60 days` and user has not opted to keep. Set `audio_deleted_at`.

---

## 4. Interviewer state machine

```
blocks: 1 (Now, 4 min) → 2 (Turning point, 5 min) → 3 (Certainties, 5 min) → 4 (Backward, 4 min) → Q12 (last, announced)
per question: ask → answer → if thin/abstract and followups_used < 2: follow-up, else next
time: seconds_left decremented by answer.duration_sec + 8s overhead per turn
if seconds_left < block budget remaining: skip to next block's first question
if seconds_left ≤ 90: jump to Q12, announce it as last
```

The seed questions for Blocks 1–4 and Q12 are in `sofar-phase0-interview.md` §3 and are loaded from `questions` where `source = seed`. Follow-ups are generated, not seeded, and must quote the user's words.

---

## 5. Prompt chain

Every prompt gets the same **system preamble**: the interviewer/prose rules from `sofar-phase0-interview.md` §2 and §5, verbatim. Memory context is passed as a cached block.

### 5.1 Interviewer — Haiku 4.5
Input: rules, session state, seed question for current position, last 3 turns of transcript.
Output JSON: `{ next_question, is_followup, quoted_phrase (nullable), block, announce_last }`.
Constraints: one question; if follow-up, must contain a verbatim phrase from the last answer; never references the book, chapters, or process; never evaluates.

### 5.2 Extraction — Sonnet 5 (Opus for onboarding)
Input: rules, transcript with segment timestamps, existing memory summary (cached).
Output JSON matching `memory_*` tables, each item with `answer_id, span_start, span_end`. Anything not stated verbatim goes to `memory_inferred` with `kind`. Q12 → `memory_unsaid`.

### 5.3 Merge — deterministic + Sonnet 5 for entity resolution
- Dedupe people/places by embedding similarity > 0.88 + model confirm.
- Stances: if a new stance contradicts an existing one (model judgment on statement pairs), keep both, link `superseded_by` only if user explicitly revised; else flag as a **contradiction candidate** for the daily question generator.
- Threads: a thing mentioned without resolution twice → `memory_threads` row; increment on each mention.

### 5.4 Chapter writer — Opus 4.x for first three, spine, and arc rewrites; Sonnet 5 otherwise
Input: rules, voice profile, foundations, the memory rows selected for this chapter (by thread/event cluster), outline instruction (open in scene / end on a turn), target 600–900 words, style (third|first), pronoun.
Output: `{ title, body_md, source_memory_ids }`. Validation step: every paragraph must cite ≥1 source_memory_id; reject and regenerate if any paragraph is unsourced.

### 5.5 Revision proposer — Sonnet 5
Trigger: merge writes memory whose `answer_id` overlaps or contradicts a canon chapter's `source_memory_ids`.
Input: canon chapter, new memory, rules.
Output: `{ should_revise: bool, rationale_one_line, proposed_body_md }`. Never applied automatically. User accepts or declines in the Book screen.

### 5.6 Daily question generator — Haiku 4.5
Input: open threads (with mention counts), contradiction candidates, memory gaps (foundations mentioned but never storied), seed bank, last 14 questions asked.
Output: one question, `kind ∈ {event, stance, rationale}`, tied to a `thread_id` when applicable.
Hard rules: asks for a day, place, person, sentence said, or number. **Never mentions the book, chapters, pages, or "your story."** Never repeats a question asked in the last 60 days. Routes stance/rationale through an event.
*(Founder-supplied question bank to be added here as the seed set. Generated questions must match its register.)*

### 5.7 So far generator — Sonnet 5
Input: open threads, stated wants (stances with future tense), last So far chapter.
Output: one opening paragraph in the narrator's voice + one line per open thread with the receipt (times mentioned, since when, where contradicted).

### 5.8 Spine proposal — Opus, triggered at chapter 10
Input: all canon chapters, all stances, all threads.
Output: 2–4 parts with titles and one-line tensions, and a mapping of chapters to parts. Presented to the user as a proposal; on accept, `parts` written and chapters reordered.

---

## 6. Screens (P0 only)

Today · The Book · The Manuscript · Interview · So far. Designs are the Manuscript mockups already approved: cream `#F4EEE2`, ink `#1C1A17`, oxblood `#7A2E2A` (bookmark ribbon, chapter numeral, answer button only), Newsreader for the book, Instrument Sans for chrome. Light-only. No dark mode in P0.

---

## 7. Security & privacy — non-negotiable

- RLS on every table; service role only in server functions.
- Storage buckets private; signed URLs, 10-minute expiry.
- Transcripts and audio never written to logs. Redact in error reporting.
- No analytics events carry transcript text.
- Anthropic API calls: no data retention beyond request; state the no-training policy in the privacy page.
- Encryption at rest via provider; app-level encryption of `answers.transcript` and `chapters.body_md` with a per-user key is P1 — design the column access through one repository module now so it can be added without a rewrite.
- `memory_unsaid` never enters any prompt unless `allowed_in_book = true`.
- `memory_inferred` never enters the chapter writer.

---

## 8. Milestones

Each milestone has one acceptance test. Do not proceed until it passes.

**M0 — Repo and infrastructure (2–3 days)**
Next.js + Supabase + Netlify deploy, schema migrated, RLS verified with a two-user test, STT and Anthropic wrappers with typed interfaces, env and secrets wired.
*Accept:* a script inserts an answer for user A; user B cannot read it; `transcribe()` and `complete()` return real results.

**M1 — Pipeline CLI (1–2 weeks)**
`sofar run --transcript file.txt --user <id>` executes extraction → merge → three chapters → writes to DB and prints chapters. Includes the source-citation validator in 5.4.
*Accept:* run on the founder's own recorded 20-minute interview. Every paragraph traces to a transcript span. Founder can name the sentence that's wrong. Run twice on the same transcript — memory rows are not duplicated.

**M2 — Interview engine (2 weeks)**
Browser voice capture, upload, transcription, interviewer state machine, 20-minute hard stop, onboarding flow from Block 0 form to "chapters ready."
*Accept:* a stranger completes onboarding with no help and receives three chapters within 10 minutes.

**M3 — The Book (1–2 weeks)**
Canon storage, chapter unlock on answer threshold, revision proposer with accept/decline, So far generator, Book and So far screens.
*Accept:* answering a question that contradicts a canon chapter produces exactly one proposed revision with a one-line rationale; declining it changes nothing.

**M4 — Daily and weekly engine (1 week, blocked on founder question bank)**
Cron, generator, push notification, single-question answer flow, Today and Manuscript screens with streak strip and marks.
*Accept:* seven consecutive days of questions with zero repeats, zero references to the book, and every question asking for a specific.

**M5 — Billing, PWA, install (1 week)**
Stripe trial with card, webhooks, plan gating (Basic vs Full), session-minute cap and top-up, PWA manifest, home-screen install prompt, web push on iOS.
*Accept:* a trial started on an iPhone receives a push notification on day 2 from the home-screen app; trial converts on day 15 in Stripe test clock.

**M6 — Export, delete, retention, hardening (3–5 days)**
PDF export, account delete with forced export, 60-day audio deletion cron, log redaction audit, rate limits.
*Accept:* export renders the full book; delete leaves zero rows and zero storage objects for the user; an audio file older than 60 days is gone the next morning.

**M7 — Twenty trial users**
Landing page live, twenty people through the door, day-eight review of read-through and return.

---

## 9. Out of scope for P0

Circle, public edition, library, mailbag, pseudonymization pipeline, printed edition, third-person toggle UI (fixed to the user's onboarding choice), photos, spoken questions, Spanish, dark mode. The schema above already has the columns these need (`allowed_in_book`, `status`, `source_answer_ids`); do not add tables for them yet.

---
