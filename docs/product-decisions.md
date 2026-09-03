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

## D2 — Editorial judgment, and honesty about insufficiency (founder, 2026-09-03)

Stated on reading draft one, which contained "He does not describe the
station", "he says it got tough and does not say how", "he does not name the
people", "asked about the earliest thing he can remember, he skipped it", and
"aND".

**The principles, as given:**

1. Filter out the irrelevant, unimportant and uncaptivating. Who cares about
   breakfast.
2. It cannot sound like Q&A.
3. If something is missing context and it matters, ask about it later. Never
   state in the book that context is missing.
4. There has to be a story — interesting, captivating. If there can't be, be
   honest about that.
5. The user must give honest and thorough answers. If every answer is vague,
   no model can write a good story. So the product must tell the user when
   it does not have enough, and what it needs.

**What the pipeline was doing instead:** writing every row it was given,
narrating the gaps in the record as sentences, preserving keyboard slips as
speech, and always producing a chapter regardless of whether the material held
one.

**Implementation:**

- **Sufficiency gate** (`prompts/sufficiency.md`, before each chapter). The
  editor's call: is there a scene, something said, and a turn? If yes, one
  line naming the story and the ids of the rows that serve it — the writer
  receives only those, so selection is enforced by what it is shown, not
  requested of it. If no, nothing is written.
- **Gaps become threads.** A not-enough verdict records what is missing in
  `memory_threads`, which is what the daily question generator reads (SPEC
  §5.6). The CLI prints "what the book still needs" in plain language. The
  user-facing form of that message is an M2/M3 screen decision.
- **The interview does not exist in the book** (chapter prompt). No mention of
  a question, a gap, a silence, or what was not said; no remarking that two
  answers resemble each other. A thin record makes a short chapter, never a
  chapter about being thin.
- **Correct the keyboard, keep the idiom** (extraction prompt). Typed slips are
  fixed in quotes; grammar and word choice stay exactly as spoken.

**Open:** whether a not-enough verdict should remove a chapter written by an
earlier run (currently it leaves it, and says so). And the tone of "what we
need" when it reaches a user — it must read as an invitation, not a grade.

## D3 — Connect the dots; selection by angle, not by block (founder, 2026-09-03)

On draft two: "too chronological and Wikipedia-like. Just stating facts.
Nothing intertwining." And the mechanism, by example: the schools are listed,
the friends were met in fifth grade in 2005 — so one of those schools is where
the friendship started, and one of those friends is now the colleague he told
first about leaving. That is an angle. And the fact the angle needs and does
not have — which school, what that year was like — is the next question.

**The principle:** an angle is where two or more facts mean more together than
apart. Finding angles is the editorial act. Each one is either writable now or
names what is missing and the question that would get it. The chapter and the
follow-up come from the same act of noticing.

**What was wrong:** draft one gave every row to every chapter and got one
chapter three times. Draft two fixed that by walling each chapter into its own
interview block — which guarantees nothing intertwines, and produced lists.
Both were selection by the wrong principle.

**Implementation:** one editor pass (`prompts/angles.md`, Sonnet, high effort)
over the whole memory layer, returning angles with the rows each draws on
across the record, a slot assignment for the three first-session chapters,
`writable`, `missing`, and `ask` — one question in the interview's register.
The writer receives the angle's line as "this chapter is about" and only its
rows. Unwritable angles are stored in `memory_threads` with their question,
for the daily generator (SPEC §5.6). The chapter prompt now asks for
intertwining explicitly; chronology is a default, not a structure.

**The villas chapter, specifically:** the founder's own read is that it had
the best chance and "not enough was asked about that." Correct, and the same
mechanism serves the interviewer (M2): an angle that surfaces mid-interview is
the follow-up to ask right then, not a question for next week.

**Open:** the angles pass is the seed of the spine proposal (SPEC §5.8);
whether they are one mechanism at different scales is worth deciding before
M3.
