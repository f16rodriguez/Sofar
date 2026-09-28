# Premise review — 2026-09-28

The question: does the loop Sofar is built on actually close, and what does
each user cost while it does? Built from what the app recorded over the
first three weeks, the measured M1 runs, and the concept's own model
(`sofar-concept.md` §7). Numbers are marked **measured** or **estimate**.

## Verdict

The margin is fine. The loop was not. On $14.99 a month, the cost of
goods is the smallest risk this product has. The risks that matter are
activation (does anyone finish the first interview?) and return (does
anyone come back tomorrow?). The first three weeks produced one clear
answer to each, and both answers were no.

## What three weeks showed (measured)

| Signal | Value |
|---|---|
| People with access | 1 (the founder) |
| First interview finished | No: partly recorded, then "I'll do it tomorrow" |
| Sign-ins after Sept 5 | 0 |
| Daily questions written | 24, for about $0.07 in total |
| Daily questions seen | 0: nothing delivered them; they only showed on a screen nobody opened |
| Questions that went back to a subject from the past two weeks | 9 of 24 |
| Chapters written from daily answers | 0: processing is switched off in production |

The founder is the most motivated user this product will ever have. If the
founder doesn't return without a prompt, nobody will.

## The loop, link by link

```
ask ──▶ reach them ──▶ answer ──▶ becomes book ──▶ they see it ──▶ ask again
 ok     BROKEN→fixed    ok        OFF in prod       ok (Today)     fixed
                        (needs
                        a domain)
```

1. **Ask.** The daily question worked, but it kept circling back to the
   same subjects. *Fixed today:* anything asked about in the last 14 days
   is rested, and a check in code refuses a question on the same person,
   place or subject. It catches all 9 repeats in the real data with no
   false positives.
2. **Reach them.** There was no delivery at all. *Built today:* the
   question now goes out by email at 8am, with the question itself as the
   subject line, one button to answer, and one-click unsubscribe. **It is
   switched off until a sending domain exists.** Also fixed: after three
   unanswered questions in a row, the questions stop, and they resume when
   the person comes back. That caps the cost of people who stop using it at
   about three Haiku calls, and it protects the sending reputation.
3. **Answer.** Works by voice, or typed via "Type instead".
4. **Becomes book.** `SOFAR_PROCESS_SESSIONS` is off, so an answer never
   becomes a chapter in production. The payoff the whole product promises
   does not happen yet. This is the switch that closes the loop, and it
   costs cents a day at the current scale.
5. **They see it.** *Fixed today:* Today now leads with a new chapter when
   one arrives, and the book marks it NEW.

## Launch blocker found today

Supabase's built-in email sender delivers **only to members of the
project's Supabase team** and is capped at a few messages an hour. So
nobody except the founder can receive a sign-in link. The invite list
doesn't matter until this is fixed.

**One fix covers both problems:** a domain (~$12/yr) plus Resend (free up
to 3,000 emails/month, 100/day). Use it for Supabase custom SMTP (sign-in)
and for the morning question. Steps are in `docs/ops.md` → "Email". It
takes about 20 minutes of the founder's time and needs no code.

## Unit economics

### Trial: the first interview and the first three chapters

| Item | Cost | Basis |
|---|---|---|
| Extraction + three Opus chapters + entailment | $0.76–1.12 | **measured**, two complete M1 runs |
| Transcription, 20 min | ~$0.10 | estimate, $0.005/min |
| Interviewer (Haiku, ~40 turns) | ~$0.10–0.20 | estimate |
| **Per trial signup** | **~$1.00–1.40** | vs $0.75 in the concept |

Only cards convert, so the real number is trial COGS per paying user: about
**$10–14 at 10% trial-to-paid** and about $5–7 at 20%. That is tolerable
against a web contribution of about $12.26/month on the monthly plan. It
is not tolerable if the card requirement is ever dropped. Keep the card,
or make the first session cheaper (see recommendation 3).

### A paying user who answers every day (processing on, pipeline as built)

| Item | $/month | Basis |
|---|---|---|
| 30 daily questions (Haiku, ≤2 tries) | $0.10–0.20 | **measured** ~$0.003 each |
| Transcription, 30 × 30 s | ~$0.08 | estimate |
| Extraction per answer, 30 × ~$0.05 | ~$1.50 | ops doc figure from M1 runs |
| Chapter every 5 answers, 6 × ~$0.10 | ~$0.60 | ops doc figure |
| Revisions, occasional | ~$0.05–0.10 | estimate |
| Email, 30/month | $0 | Resend free tier to ~100 users |
| **Daily answerer** | **~$2.35–2.50** | concept budget: ~$2.00 average |
| + full 120 interview minutes | +~$1.80 | estimate → **~$4.2 heavy**, vs a $4 budget |

**The biggest lever is to extract per chapter, not per answer.** A
chapter already waits for 5 answers. Extracting those 5 in one call (the
memory context is cached anyway) cuts about $1.50 to about $0.35 a month,
which takes a daily user to about **$1.20/month**. It costs a validation
run of about $0.50 first (D5), so it waits for your go-ahead.

### Fixed costs

| Item | $/month | When |
|---|---|---|
| Supabase Pro | $25 | **Before the first outside user.** The free plan pauses after 7 idle days and has no downloadable backups. For a product whose whole promise is keeping someone's life, a lost database is fatal. |
| Netlify Pro | $19 | When free build minutes or function limits bite |
| Domain | ~$1 | Now |
| Resend | $0 → $20 | Past ~100 daily users |

About **four paying monthly users cover the fixed costs.** COGS is not what
will kill this.

## Assumptions to challenge

1. **"People will do a 20-minute voice interview cold."** The founder
   didn't. The landing page asks for twenty uninterrupted minutes before
   any payoff, and the payoff arrives the next day. That is the steepest
   point in the whole funnel, and it sits at the very start.
2. **"People will come back on their own."** Zero return visits in three
   weeks. Email fixes the mechanics; it cannot fix a question that isn't
   worth answering.
3. **"The book is the product."** The book is the payoff. The product, 29
   days out of 30, is **one question a morning**. Its quality decides
   retention. Today it is generated without the founder's seed bank, which
   `prompts/daily-question*.md` still waits on, and it can only ask about
   what little the first interview captured.
4. **"The landing page describes the product."** Parts of it describe
   things that don't exist yet:
   - "14 days free / card / $14.99": Stripe (M5) isn't built.
   - "plus one deeper question each week": not built.
   - "tell us the sentence that's wrong": there is no way to flag a
     sentence.
   - "by tomorrow you have the first three chapters": true only when
     processing is on.

   Anyone clicking "Start the interview" today ends up at an invite-only
   message.

## Recommendations, ranked by leverage per hour

| # | Do | Who | Cost | Why |
|---|---|---|---|---|
| 1 | Domain + Resend + Supabase custom SMTP (ops.md → Email) | Founder, ~20 min | ~$12/yr | Unblocks sign-in for anyone else **and** turns on the morning email |
| 2 | Turn on `SOFAR_PROCESS_SESSIONS` | Founder says go | cents/day now; ~$2.40/user/month at scale | Without it, answering produces nothing. The loop stays open. |
| 3 | A five-minute first session that produces one chapter (the prologue); the other two chapters come from the next days' answers | Founder decides; script is founder-supplied | Cuts trial COGS from ~$1.20 to ~$0.40 | Puts the payoff before the drop-off point instead of after it |
| 4 | Supply the seed question bank (even 30 questions) | Founder | – | The morning question is the product; it shouldn't be improvised |
| 5 | Batch extraction per chapter | Claude, after a ~$0.50 validation run | ~$0.50 once | ~−$1.30/user/month, about half of COGS |
| 6 | Supabase Pro before the first outside user | Founder | $25/mo | Backups; no auto-pause |
| 7 | Make the landing page true: invite-only waitlist until M5, drop claims that aren't built yet | Founder copy, Claude builds | – | People who arrive should find what was promised |
| 8 | "This sentence is wrong" on the book page → a proposed revision | Claude | ~$0.03 per use | The strongest feedback signal the book can get, and already promised |

Not recommended now: web push (only reaches people who installed the app,
which is exactly who least needs the reminder; revisit with M5), and
anything P2.
