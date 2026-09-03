# Interview findings — run 001

Founder ("tester zero"), 2026-09-03. Text questions, typed answers, conducted
in chat. Ended after Q11; Q12 not reached.

Recording findings, not fixes. **Question design is founder-owned** (CLAUDE.md:
"Don't invent seed questions"). Nothing below has been applied to the seed bank.

## Finding 1 — Block 0 is too thin to support Blocks 3–4 (structural)

**Severity: high. This is the one that matters.**

The book is assembled from a memory layer of named people, places and dated
events. The interview as scripted collects almost none of them. Across the full
run it produced exactly **one name** (JC). Wife, daughter, parents, and the
friends-since-2005 all arrived as roles, never as people — so `memory_people`
gets rows with no labels worth writing prose from, and the chapter writer has
nothing concrete to open a scene on.

Block 0's eight fields establish a pronoun, an age and a city. Four minutes
later Block 3 asks what the subject is most certain about and what that
certainty cost. There is no established biography for those answers to attach
to, so they come back as principles rather than events — which is precisely
what rule 7 (reach stance through an event) exists to prevent.

Observed in run 001:

- Q8 ("when did you first know that?") returned a restatement of the stance,
  twice, then "basketball" — no origin event.
- Q9 (cost) returned "some relationships … whoever goes goes" — no person.
- Q10 (earliest memory) was rejected by the subject as "too broad."

Direction to consider — founder's call:

- Expand Block 0 to collect named entities: partner, children, parents,
  siblings, closest friends, with names usable in prose.
- Collect a rough work/place history with years, so events have dates to hang on.
- One line per prior city on why they left — the schema already has
  `memory_places.what_happened` and nothing currently fills it.

## Finding 2 — Q10 depends on a coherent Q7–Q9, and inherits their failure

"What's the earliest memory that connects to what you just told me?" assumes the
previous three answers formed something to connect back to. When Block 3 fails
to produce an event, Q10 has no referent and reads as unanswerable. The subject
said so directly.

Worth considering whether Q10 should name its referent explicitly rather than
say "what you just told me."

## Finding 3 — interviewer execution, not script

After Q8 returned "basketball," the follow-up asked for the earliest game he
remembered playing. The subject's verdict: "weak irrelevant question." He was
right — it chased an incidental noun instead of the load-bearing claim
("I refuse to not let it work out"). Generated follow-ups quote the user's words
per rule 3, but quoting the *wrong* words produces a question that satisfies the
rule and still fails. The interviewer prompt (SPEC §5.1) may need a notion of
which phrase in an answer is load-bearing, not merely which phrase is quotable.

## Finding 4 — pacing is felt, and it compounds

The subject asked for a progress report at Q5 and flagged the session as running
long around Q11 — in a text-mode run with no clock pressure. Three of eleven
questions were skipped or rejected outright, all in the second half. Whatever
the cause, engagement decayed, and the questions that need the most trust
(Q9, Q12) are the ones sitting at the end.

## Consequence for M1

Run 001's transcript is usable for Prologue and Chapter I — the move to Punta
Cana is well covered, with dates, a place (July, viewing villas), a named person
(JC) and a quoted sentence. **Chapter II is under-sourced**: a stance with no
origin event and no earliest memory.

So a flat Chapter II from this transcript would not be evidence against the
pipeline. Judge the M1 acceptance run on Prologue and Chapter I, and treat
Chapter II as blocked on a better input.

Transcript lives in `transcripts/` — git-ignored, because real transcripts are
personal data and never enter the repo.
