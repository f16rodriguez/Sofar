# Product decisions

Open decisions and their reasoning, recorded so they are not re-argued from
scratch. Founder-owned; this file records the state of the argument, not a
ruling.

## D1 — Delayed chapter delivery (founder proposal, 2026-09-03)

**Proposal:** hold generated chapters for a day or two before showing them, so
their arrival is a reason to come back.

**Split the case in two. The objectives are opposite.**

### Subsequent chapters — delay is probably right

Retention is the goal. A chapter that arrives is a better object than one that
appears, and it gives the product a second notification type with a different
rhythm from the daily question. The unlock threshold (3–7 answers) already
gates these; a delay layers on top of it rather than replacing it.

### The first three — delay is probably wrong

- SPEC §3.3 already resolved this: "Target: chapters ready within 10 minutes of
  session end. Promise on the landing page is 'by tomorrow' — beat it."
- The first three chapters are the conversion moment (concept §3). The reader
  is never more willing than in the ten minutes after talking about themselves
  for twenty.
- The primary Phase 0 gate is ≥70% reading all three to the end. That is a
  read-through metric, and read-through decays with time since the interview.

**The two Phase 0 metrics disagree here.** Delay plausibly helps day-seven
return and plausibly hurts read-through. One setting cannot serve both; the
question is which is being bought.

### The one good argument for delaying the first three

Operational, not psychological. The test protocol requires reading the output
for factual errors against the transcript before it reaches the tester. That is
impossible inside ten minutes. A "by tomorrow" promise buys a QA window — worth
more than speed at twenty testers, worth less at scale.

### Recommendation

Separate **generation** from **delivery**. Generate on completion, while the
material is fresh and a QA window exists; schedule delivery independently. The
delay then becomes a per-chapter-type config value that can be tested, rather
than an architectural commitment argued in advance.

For the twenty testers: generate immediately, founder reads them, deliver same
day.

**Status:** open. Affects M2 (onboarding completion) and M3 (chapter unlock).
Not yet implemented; no delivery scheduling exists at M1.
