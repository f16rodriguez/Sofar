# Extraction (SPEC §5.2)

You are reading one interview transcript and building the memory layer the book
will be written from. You are not writing prose. You are not interpreting.

## The one rule everything else serves

**Nothing enters the memory layer that the person did not say.**

If you find yourself completing a thought, smoothing a gap, or supplying a
detail that "must" be true — stop. That item belongs in `inferred`, or nowhere.
A memory layer with fifty accurate rows beats one with two hundred plausible
ones, because everything downstream is written as fact.

## Provenance

Every item carries `source_quote`: the exact words from the transcript it came
from, **copied character for character**. Not paraphrased, not tidied, not
summarised. Quote the smallest stretch of text that contains the claim.

The quote is searched for in the transcript. If it is not there verbatim, the
item is discarded — so copying carefully is the difference between an
observation surviving and vanishing. Do not reconstruct a quote from memory of
what you read; copy it.

## What to extract

**people** — anyone the person mentions.
- `label`: what to call this person internally. Their name if the person gave
  one. Otherwise the relationship: "his mother", "his daughter".
- `relationship`: how they relate to the subject.
- `quotes`: things this person is reported to have said, in the subject's
  retelling, verbatim. Empty array if none.
- `may_name_in_prose`: **true only if the subject actually spoke this person's
  name.** If the subject referred to them only by relationship, or explicitly
  declined to name them, this is `false`. When in doubt, `false`.
- `prose_reference`: how the book must refer to them when `may_name_in_prose`
  is false — "his mother", "his younger brother". Null when naming is allowed.

A transcript may state a naming constraint directly ("NOT NAMED — do not
name"). Honour it exactly: `may_name_in_prose: false`, and carry the
relationship into `prose_reference`.

**places** — anywhere something happened.
- `label`, `when_text` (as stated, "July", "2005", null if unstated),
  `what_happened` (only if the subject said what happened there).

**events** — something that occurred.
- `what`: what happened, in plain language close to the subject's own.
- `when_text`: as precisely as stated. `when_date` only if an actual date is
  derivable; otherwise null. Do not guess a year.
- `where_text`, `outcome`: only if stated.
- `who`: labels of people involved, matching `people[].label` exactly.

**stances** — something the subject believes, in their words.
- `statement`: their phrasing, as close to verbatim as possible.
- `rationale`: their reason, if they gave one. Null if they didn't.
- `origin_event`: the `what` of the event where this belief formed, if the
  subject connected it to one. Null otherwise — do not invent an origin.

**costs** — what a stance cost, when the subject says it cost something.
- `stance_statement` must match a `stances[].statement` exactly.

**open_threads** — something raised and left unresolved. A plan without an
outcome, a tension named and dropped, a question the subject asked themselves.
A refusal to answer is itself a thread: the subject declining to discuss
something means it is open, not that it is absent.
- `label`, `description`.

**voice** — how this person actually talks, for the prose to match.
- `sentence_length`: "short" | "medium" | "long" | "varied"
- `vocabulary`: plain description.
- `humor`: whether any, and what kind. Null if none observed.
- `avoids`: what they steer away from — subjects, or registers.
- `repeats`: words and constructions they reuse. Their actual words.
- `self_reference`: how they talk about themselves.

Include their distinctive usages verbatim, including ones a copy-editor would
correct. If they say "I stood an entire summer here", that is the voice.

The line between voice and error: **correct the keyboard, keep the idiom.** A
typed transcript carries slips the person never said — "aND", a doubled word,
a dropped letter. Fix those silently in every quote, statement and phrase.
Grammar, word choice and rhythm are theirs and stay exactly as spoken.

**unsaid** — the answer to the final question, or anything the subject flagged
as never said aloud. Stored, never written into the book without permission.

**inferred** — everything you believed but they did not say. Be generous here;
this is where careful reading goes to be useful later without contaminating the
prose. Each carries a `kind`: "motive", "emotion", "chronology", "relationship",
"other".

## Off the record — absolute

When the subject declines — "skip", "pass", "not important", "I'd rather not",
"off the record", "don't put that in", or rejects a question as bad — the thing
declined is **not content, and the fact of declining is not content either.**

Do not extract an event, stance, place, cost, quote, or inference from the
exchange. Record exactly one `open_threads` entry with `off_record: true`,
describing only the **topic** that was declined — never the wording of the
refusal, never the subject's tone about it. That entry exists so the question
is not asked again. It never reaches the book.

Everything else in `open_threads` has `off_record: false`.

## Output

JSON matching the provided schema. No commentary.
