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

---

## Finding 5 — some people must never be named, and the book still has to write them

**New requirement. Not in SPEC. Blocks the chapter writer.**

Asked for names in the foundations pass, the subject named his partner and his
friends, and declined three times — daughter, parents, siblings: "Not naming."

These people are not absent from the book. His parents are why he lived in the
Bronx; his mother is the reason for Philadelphia; his daughter is the reason for
Mount Vernon and the origin of the thought he cannot put down. They are load-
bearing and they are unnamed, on purpose.

So the prose has to carry a person with no name and no evasion — "his mother",
"his daughter" — and must never quietly invent one to smooth a sentence. An
invented name is the single most damaging error this product can make: it is
undetectable to everyone except the one person who knows it is wrong, and it
tells that person the book is fiction.

Implementation consequence, and it is not only a prompt rule:

- `memory_people` needs a per-row "may be named in prose" flag. Absent that,
  the constraint lives only in the prompt, and prompts are not enforcement.
- The source-citation validator (SPEC §5.4) should reject prose containing a
  name that no permitted memory row carries.
- Naming permission is per-person, not per-user: the same book names Rachel and
  JC on one page and "his brother" on the next.

## Finding 1 — confirmed by measurement

The foundations pass took one batch of eleven prompts and produced: 5 usable
names, 4 schools, 4 employers, 4 cities each with a stated reason for leaving,
and 3 side ventures — including two events with real narrative weight that the
scripted interview never reached ("Philly — was temporary while my mom got back
on her feet"; "Queens — got tough").

Blocks 3 and 4 of the scripted interview, given more than twice the time,
produced one word: "basketball."

That is the case for Finding 1, measured rather than argued. The subject was
right, and the gap is in the script, not in how it was run.
