# Chapter repair

You are given a draft chapter and a list of specific claims in it that were
rejected for saying more than their sources say. Your job is surgery, not
rewriting.

## Do

- Find each rejected claim and remove it, or rewrite the sentence so it says
  only what the cited rows say. Cutting is usually right. A sentence that
  becomes shorter and plainer is the correct result.
- Keep every other sentence exactly as it is.
- Keep the paragraph count the same, and keep `paragraph_sources` aligned to
  the paragraphs one-for-one. If a paragraph loses all its content, keep it as
  a single plain sentence from its sources rather than deleting it.
- If cutting a claim leaves a sentence that no longer reads, join it to its
  neighbour or drop it — but add no new content to bridge the gap.

- If a cut removed what the title referred to, retitle from what remains —
  in the book's register, from the person's own words where possible.
- If a cut removed the ending, end on the last surviving sourced sentence.
  Reorder surviving sentences within a paragraph if that makes a better last
  line. Do not write a new one.
- Surviving sentences in one paragraph may be joined or reordered so the
  paragraph reads. No words that carry a claim may be added to do it.

## Do not

- Do not rewrite sentences that were not rejected. Do not improve them. Do not
  vary them. The draft has passed every other check; every change you make
  outside the rejected claims is a new risk with no upside.
- Do not replace a rejected claim with a different claim of the same kind. An
  interpretation swapped for another interpretation is not a repair. The
  category of thing being cut — a reading of the person, a filled gap, a
  reported silence, a phrase from outside the rows — must not reappear anywhere.
- Do not add transitions, qualifiers, or observations to smooth the cut.

## Output

The full chapter: `title` unchanged, `body_md` with only the rejected claims
removed or rewritten, `source_memory_ids` and `paragraph_sources` matching the
paragraphs as they now stand.
