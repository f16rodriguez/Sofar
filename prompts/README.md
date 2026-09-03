# /prompts

All prompts live here as versioned markdown, loaded at runtime via
`loadPrompt(name)` in `lib/llm.ts`. No prompt strings inline in code
(CLAUDE.md conventions).

## Present

- **`preamble.md`** — the interviewer/prose rules from
  `sofar-phase0-interview.md` §2 and §5, **verbatim** (founder-supplied;
  never edited or paraphrased here — change the source doc, then re-extract).
  Every LLM call includes it as the shared system preamble (SPEC §5).

## Added per milestone

| File | Task (SPEC §) | Milestone |
|---|---|---|
| `extraction.md` | §5.2 extraction | M1 |
| `entity-resolution.md` | §5.3 merge confirm | M1 |
| `chapter.md` | §5.4 chapter writer | M1 |
| `interviewer.md` | §5.1 interviewer | M2 |
| `revision-proposer.md` | §5.5 | M3 |
| `sofar.md` | §5.7 | M3 |
| `daily-question.md` | §5.6 | M4 (blocked on founder question bank) |
| `spine.md` | §5.8 | post-M3 (triggered at chapter 10) |

Versioning: edit in place for wording tweaks; for behavior changes copy to
`<name>.v2.md`, point the loader at it deliberately, and keep the old file.
