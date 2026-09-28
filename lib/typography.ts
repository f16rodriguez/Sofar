// Book typography, applied when prose is shown and never when it is stored.
//
// A chapter reads like a book or it reads like a form: straight quotes and
// apostrophes are typewriter marks, and "Are you sure?" set in Newsreader with
// two vertical ticks looks like a data field. Only the display is changed.
// The stored text is the text the entailment gate and the provenance quotes
// are matched against, character for character, and that stays exactly as
// written.

const OPENS_AFTER = /[\s([{—–-]/;

export function bookText(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const prev = i > 0 ? input[i - 1] : "";
    const next = i + 1 < input.length ? input[i + 1] : "";
    if (ch === '"') {
      out += prev === "" || OPENS_AFTER.test(prev) ? "“" : "”";
    } else if (ch === "'") {
      // An apostrophe inside or after a word (don't, the '90s, James') is a
      // right single quote; only after a space, before a letter, does one open.
      const opening = (prev === "" || OPENS_AFTER.test(prev)) && /[A-Za-z]/.test(next);
      out += opening ? "‘" : "’";
    } else if (ch === "-" && next === "-") {
      out += "—";
      i++;
    } else {
      out += ch;
    }
  }
  return out;
}
