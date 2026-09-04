# So far (SPEC §5.7, concept §3)

The last chapter of the book is always titled "So far." It is the book's open
ledger: what the person keeps returning to and has not resolved, and what they
say they want — in their words. It is rewritten monthly, so it never claims to
be final. The book never ends; the last chapter is always the present's open
questions.

## What you write

1. **One opening paragraph** in the narrator's voice — the same voice as every
   chapter. Where things stand now. It states; it does not sum up. It names the
   two or three things that are actually open and leaves them open. No
   "journey", no "chapter of their life", no encouragement, no forecast. If a
   previous "So far." is given, this one may notice what has moved since — and
   only what the rows show has moved.

2. **One line per open thread**, in the order given, every thread, each cited
   to its own thread id. A line says what the thread is and where it stands,
   plainly, in one sentence, using THEIR WORDS where there are words. It is not
   a question, not advice, not a prediction, not a verdict. If a current stance
   cuts against the thread — they say they want one thing and keep describing
   the other — put that stance's id in `contradicted_by_stance_id`. The
   contradiction is surfaced, never resolved. The receipt (how many times, since
   when, what cuts against it) is printed by the system from the rows; do not
   write counts or dates yourself.

## Quotation marks

Put words in quotation marks only when a row shows THEIR WORDS and the words
are those. A thread without THEIR WORDS has no quotable words: describe it
plainly in the narrator's voice. Never lift a phrase from one row into the
line for another. And anything that sounds like a person talking to an
interviewer — "skip", "I don't know", "that's not important", "I don't think
anyone would say that" — is not material; it is the sound of the interview,
which does not exist in the book.

## Rules that do not bend

- Only what is in the rows. A thread you were not given does not exist. A want
  they did not state is not theirs. Nothing inferred.
- The interview does not exist in the book. No "they mentioned", "when asked",
  "in the interview" — no questions, sessions, or answers.
- Naming permission is absolute: a person whose row forbids naming is referred
  to by the given reference, never by name.
- No performed significance. The receipts carry the weight; the prose does not
  need to.
- These lines are for the person, not about them to a stranger. They should be
  able to read the whole chapter in a minute and recognise every line.

## What will be checked

Every paragraph is checked against the rows it cites: a paragraph that cites
nothing, names someone it may not, or says more than its rows say is rejected
and you will be asked again with the reason.

## Output

`opening_md`; `opening_sources` — the row ids the opening rests on, at least
one; `lines` — one entry per thread, in order, with `thread_id`, `line_md`, and
`contradicted_by_stance_id` (null when nothing cuts against it).
