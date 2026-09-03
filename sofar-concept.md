# Sofar — Concept Document

*Working name. Trademark and domain clearance pending (Sofar Sounds, SofarSolar, Sofar S.p.A. exist in adjacent classes). Draft v2 — September 3, 2026. Decisions locked in §11.*

---

## 1. Concept

A living autobiography. The user answers one quick question a day and one or two deep questions a week, by voice or text. A language model continuously writes and revises their book — a real narrative with a point of view, not a journal. The book is always current, always exportable, and gets better the longer it runs.

**Positioning:** Read your life as a story while you're still living it. Not preservation (Storyworth, Remento — parents, gifts, one year). Perception — for the person themselves, ongoing.

**Core loop:** question arrives → seconds to answer → book grows → user reads themselves.

**Why it holds:** the book is an asset that compounds daily. Quitting means abandoning it, not skipping a task.

---

## 2. Target User

Self-authored, writing about their own life for themselves. Roughly 25–45, buying on subscription. Not a legacy or gift product. Tone: clear-eyed, not sentimental.

---

## 3. The Book Engine

**Present, working backward.** Onboarding starts with now — a normal week, the most recent turning point, the three things the user is most certain about and where each came from. Origins live in the past, so the last question pulls the user backward on its own. The model learns the narrator's voice first and writes every earlier chapter through it.

**Three question types.**
- *Event* — what happened.
- *Stance* — what the user believes.
- *Rationale* — why. This is where the book lives.

Rule: route every stance and rationale question through a concrete event. "The last purchase you regretted — what did you tell yourself while buying it," never "what do you think about money." The model extracts the principle from the story.

**Two threads through every book:** what happened, and what this person believes and why.

### Structure — built to be compelling, not complete

An autobiography is compelling when it has a spine: the question the life keeps asking. Eras and timelines don't have one. Turning points do.

- **Prologue** — written from the present, in the narrator's current voice. Who this person is right now, before anything is explained. Rewritten when the present changes.
- **Parts** — organized around the life's central tensions, not decades. "Leaving" / "What he owed" / "The year he stopped asking permission." The model proposes the spine after roughly ten chapters, the user approves it, and the book reorganizes around it. Before that, chapters live in a provisional chronological order.
- **Chapters** — each one a turning point, decision, or contradiction. Never "childhood." A chapter earns its place by changing something.
- **Interludes** — short essays between parts titled from the person's own stances: *What she believes about money. What he believes about his father.* These update as stances shift, and carry the belief-change feature.
- **Closing chapter, always titled "So far"** — the unresolved threads and stated wants, in the user's own words, rewritten monthly. The book never ends; the last chapter is always the present's open questions.

**Canon and revisions.** The private book is the canon. Rewrites are proposed, never silent: "New material suggests chapter three is really about your father — want to see the revision?" User approves, canon locks. Regeneration happens per chapter on trigger, not whole-book daily.

**Contradictions.** Surfaced, always as a question, never a verdict. "You've said you value freedom. You've described the last three decisions as obligations. How do those sit together?" The model is a scribe of a worldview, not an editor of one. Contradictions are never flattened — they're the most interesting chapter.

**Forward half.** The model tracks unresolved threads and stated wants across the record and surfaces them in the user's own words. Inspiration with a spine, not motivational filler.

**Gamification.** Rewards only what is safe to reward: forgiving streaks (rolling windows, recovery built in), chapters unlocked, threads resolved, length of the record. Depth is invited, never scored.

**Model routing.** Small model (Haiku-class) for the interviewer, daily question generation, extraction, and classification. Sonnet-class as the floor for anything the user reads. Opus-class for the first three chapters (the conversion moment, one-time cost), for spine proposals, and for arc-level rewrites when a chapter's angle changes. The model matters less than the pipeline: a structured memory layer (people, places, events with dates, stances with dates, each linked to its source transcript), a per-user style guide derived from how they actually talk, and chapter outlines before prose.

---

## 4. Privacy & Safety

- Private canon is never touched by any public feature. Nothing is public by default.
- Encryption at rest, no training on user data, user controls what leaves the device. Stated up front.
- Third person (he/she/they) is a style option and an emotional feature — not a privacy claim.
- PDF export is always free. No hostage-taking.
- **Private side:** opinions are not policed. If risk language appears, the app surfaces resources gently and once, never blocks, never stores a flag in the book, never notifies anyone. Wording reviewed by a clinician before launch.
- **Public and Circle side:** hate-speech filtering plus full moderation, and a hard block on categories that cannot be published regardless of author choice — active crisis or self-harm in the present tense, method detail of any kind, abuse involving identifiable third parties, anything concerning minors. Past-tense recovery and survival stories are memoir, and go through human review rather than auto-block.
- Audio retained 60 days, then deleted unless the user opts to keep. Transcripts stay. Full account deletion on request, export forced first.

---

## 5. Tiers & Pricing

**No free tier.** Every user pays after trial. This removes the free-load problem that dominated the v1 economics.

**Trial — 14 days, card required.** Includes the onboarding voice interview and the first three chapters. Trial is the Full tier. Converts to **Full monthly** at $14.99 — never straight into annual. Annual offer shown around day 10, once the user has felt the book grow. Basic offered as the downgrade path at cancel.

**Basic — $4.99/month or $39/year** — text answers, daily and weekly questions, Sonnet-class chapters regenerated monthly, PDF export.

**Full — $14.99/month or $99/year** — 2 hours of voice interview time per month (resets, no rollover), voice answers on everything, proposed revisions, thread surfacing, belief-change interludes, the library.

**Top-up** — $9.99 per extra interview hour.

**Printed edition** — $59–79, one-time, cost-plus.

**Referral** — refer a friend; when the friend commits to paid (after the trial and any refund window), both get a free month — annual subscribers get 30 days added. Referral pairs get mutual Circle access. Cap referrals per year; block self-referral.

Web checkout is primary. Store commission is the single largest cost line.

---

## 6. Community: Private → Circle → Public

**Everyone must write.** Reading is an optional plus. No spectators.

**Circle — opens at chapter three.** An author can open a chapter to specific invited people, starting with the friend who referred them. Author opts in per chapter. This is the on-ramp to publishing: publish to one person first.

**Public edition — opens at ten chapters or ninety days, whichever comes later.** Opened by the author only, never curated by the company. Built chapter by chapter from the canon; nothing public by default. Required review pass before going live. Automatic, non-optional pseudonymization of every third party — names, workplaces, neighborhoods. Strictest handling for minors and anyone in abuse or medical contexts. Fast takedown path for anyone who says a book is about them. Sensitive-category block per §4 applies regardless of author choice.

**Library.** Fully paywalled (Full tier). Teaser visible without paying: title, one-line premise, opening paragraph.

**Discovery.** Open gate, no editorial approval — but ranking is unavoidable. Reader-driven or algorithmic, organized by story type.

**Authors earn nothing.** The public goal is community, not income. Authors who build an audience and leave for a paid platform leave with a book we helped write. Acceptable.

**Mailbag.** Readers submit questions to an author. Anonymous to the author, never to the platform — every sender has an account and a book, so bad actors can be blocked, rate-limited, and banned silently. Reader may optionally share their own book as a vouch. Every question passes the filter first; anything fishing for identifying details is rejected. No reply-to-sender — the author answers to the book (private reply, public reply, or chapter material), never into a private thread.

---

## 7. Unit Economics

Rates as of September 2026: transcription ~$0.004–0.006/min; Sonnet 5 $2/$10 per M tokens (standard); Haiku 4.5 $1/$5; cached input at 10%.

**Heavy Full user (maxes 2-hour cap, all voice):** $2.00–3.50/month. Budget $4.
**Average Full user (~40% of cap):** ~$2.00/month.
**Basic user (text-only, monthly Sonnet regen):** ~$0.25/month.
**Trial user (14 days, interview included):** ~$0.75 one-time.

**Contribution per paid user/month** (Full avg cost $2.00, Basic $0.25; no free load)

| Plan | Store 30% | Store 15% | Web (Stripe) |
|---|---|---|---|
| Full annual $99 | $3.78 | $5.01 | $5.99 |
| Full monthly $14.99 | $8.49 | $10.74 | $12.26 |
| Basic annual $39 | $2.03 | $2.51 | $2.88 |
| Basic monthly $4.99 | $3.24 | $3.99 | $4.30 |

Blended (majority Full annual, web-weighted): **~$4.50–5.50 per paid user per month**, before fixed costs.

| Paid users | Monthly contribution | Annual |
|---|---|---|
| 1,000 | ~$5k | ~$60k |
| 10,000 | ~$50k | ~$600k |
| 50,000 | ~$250k | ~$3M |

Fixed costs not included: moderation, legal, base infrastructure, founder time.

**Referral cost:** two free months ≈ $7–13 foregone revenue + ~$4 AI cost → effective CAC of roughly $11–17 per committed paid subscriber.

**Levers that matter, in order:** trial-to-paid conversion, keeping annual purchases on web checkout, Full vs Basic mix, then AI model choice. Full annual through the store at 30% is the weakest path — steer around it.

**Storage.** Audio is the only heavy item (~50–90 MB/month for a heavy user); transcripts ~100 KB/month; structured layer and chapter versions trivial. A couple of cents per user per month at object-storage rates. Postgres + vector search for the memory layer, object storage for audio, per-user encryption, pseudonym mapping in a separate table.

---

## 8. Legal (not legal advice — get counsel before launch)

Terms can place responsibility on the user: representations of right to share and good faith, plus indemnification. Platforms hosting user content have historically had liability protection. The wrinkle: the model writes the prose, so the platform is arguably a co-author of public chapters — less settled ground. Mitigations regardless of where the law lands: explicit user approval of every public chapter, automatic pseudonymization, third-party claims written as the author's perspective, fast takedown, sensitive-category block, and private content never distributed. Different risk class for private vs public — keep them separate at every layer.

---

## 9. Build Plan

**Builder:** founder, solo, on the Next.js / Supabase / Netlify / Stripe stack. Journalism background is the differentiator — question design, interview craft, and editorial standards are the product; the engineering is the pipeline around them.

**Phase 0 — interview prototype (weeks 1–2).** No app. Prompt architecture only: the onboarding interview, the memory extraction, three chapters out. Run twenty people through it. Two numbers decide whether to continue: how many read all three chapters to the end, and how many come back on day seven unprompted.

**Phase 1 — P0 (weeks 3–12).**
- Web app, Stripe trial with card required
- Onboarding voice interview → three chapters
- Daily question + weekly deep question, voice and text (text questions, voice answers)
- Present-backward question engine with event / stance / rationale types
- Structured memory layer and per-user style guide
- Chapter generation, proposed-not-silent revisions, locked canon
- Prologue and provisional chronological structure; "So far" closing chapter
- Forgiving streaks, chapter unlocks
- PDF export, encryption, no-training promise stated in onboarding
- Basic / Full tiers, 2-hour session cap

**Phase 2 — fast follows.**
- Spine proposal and reorganization into Parts
- Interludes and belief-change views
- Thread surfacing and contradiction questions
- Circle + referral
- iOS wrapper with push

**Phase 3 — community.**
- Public edition with pseudonymization pipeline, sensitive-category block, and review pass
- Library, discovery ranking, teasers
- Mailbag with filter and silent blocking
- Printed edition
- Third-person style option, photos
- Spoken questions (TTS)

Architect the private/public split from day one so Phase 3 is not a retrofit.

---

## 10. Success Metrics

**Phase 0:** ≥70% of testers read all three chapters; ≥40% return on day seven unprompted.
**Leading:** trial start rate; trial-to-paid (target ≥40% of card-required trials); annual share of Full (target ≥60%); day-30 answer rate.
**Lagging:** month-6 retention; average book length at 6 months; % of Full users using ≥40% of session cap; Circle → Public conversion once live.

---

## 11. Decisions Locked

- Web first; iOS wrapper in Phase 2. Web is the sharing and referral surface — links, no install friction, no store cut.
- Trial converts to Full monthly; annual offered day 10.
- Book structure per §3: prologue, tension-based parts, turning-point chapters, stance interludes, "So far" closing chapter.
- Text questions, voice answers in v1; TTS later.
- Circle at chapter three; Public at ten chapters or ninety days.
- Private side: never block, never flag in the book, resources once, clinician-reviewed. Public side: hard block on sensitive categories regardless of author choice.
- Audio 60-day retention; export before deletion.
- Phase 0 interview prototype with twenty testers before the app is built.
- Name: file on a modifier (Sofar Books / Sofar Press) with counsel; Longhand as backup.
- English only at launch; Spanish flagged as the second language.
- Founder builds it.

## 12. Still Open

- Sensitive-category classifier spec for Circle/Public (what auto-blocks vs routes to review)
- Crisis-response wording — needs a clinician
- Story-type taxonomy for discovery (Phase 3)
- Small business program eligibility and current terms
