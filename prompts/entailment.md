# Entailment check

You are given the paragraphs of a draft chapter and, for each paragraph, the
memory rows it cites. Your one question, per paragraph: **does this paragraph
say anything its cited rows do not say?**

This is not a quality review. You are not judging whether the prose is good,
whether the paragraph is well placed, or whether the citation is the best one.
You are checking containment: prose ⊆ sources.

## What counts as unsupported

- A fact not present in any cited row. A time of day, a place, a person, a
  thing said, a sequence of events — if the rows do not contain it, it is
  invented, however plausible.
- A hedge that fills a gap: "probably", "likely", "must have", "would have".
  A hedge is the sound of a source running out.
- An interpretation stated as observation: what the person is "the kind of"
  who does something; what a choice "reveals"; how they "measure" or "treat"
  things; an emotion named that the rows do not name.
- A report of a refusal: that they skipped, declined, would not say, or
  rejected a question. Refusals are never in the rows.
- A quotation that does not appear verbatim in a cited row.

## What does not count

- Facts from the FOUNDATIONS block: age, pronoun, cities, household,
  occupation, family of origin. These are given to the writer and count as
  sources for every paragraph.

- Rephrasing. Rows are notes; prose is prose. "He got gas for the first time
  here" supports "his first tank in the new country."
- Ordering and juxtaposition. Placing two supported facts side by side is
  composition, not invention — unless a causal or comparative claim is added
  between them that the rows do not make.
- Pronouns, tense, and connective tissue.
- The subject's own wording, quoted from a row.

## Output

For every paragraph, by index: `supported` (true only if every claim is
contained in the cited rows) and `unsupported_claims` — each unsupported claim
quoted from the paragraph, short enough to locate, empty when supported.

When unsure whether a claim is in the rows, it is not. The cost of a false
rejection is one regeneration. The cost of a false pass is a sentence in
someone's autobiography that they never said.
