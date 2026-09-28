// Book typography and the revision diff.   npm run test:render
import { bookText } from "../lib/typography";
import { diffChapter } from "../lib/diff";

let failed = 0;
const eq = (got: unknown, want: unknown, label: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
};

console.log("typography");
eq(bookText('He said, "You\'ve been saying this."'), "He said, “You’ve been saying this.”", "double quotes open and close; an apostrophe curls");
eq(bookText("She said, \"No,\" and left."), "She said, “No,” and left.", "a quote closing after a comma");
eq(bookText("the '90s and James' car"), "the ’90s and James’ car", "leading and possessive apostrophes are right quotes");
eq(bookText("he said 'wait' twice"), "he said ‘wait’ twice", "single quotes open after a space");
eq(bookText("not the villa--not the pool"), "not the villa—not the pool", "a double hyphen becomes an em dash");
eq(bookText("(\"inside\")"), "(“inside”)", "a quote opens after a bracket");
eq(bookText("plain text"), "plain text", "nothing to do, nothing done");

console.log("\nrevision diff");
const before = "The letter was two paragraphs.\n\nTomás read it standing up. He said, \"You've been saying this for a year.\"\n\nShe gave it to her manager.";
const after = "The letter was two paragraphs.\n\nTomás read it the night before, in bed. He said, \"You've been saying this for a year.\"\n\nShe gave it to her manager.";
const d = diffChapter(before, after);
eq(d.changed, 2, "one sentence swapped is one removed and one added");
eq(d.paragraphs.length, 3, "paragraphs are kept");
eq(d.paragraphs[1].map((p) => p.kind), ["removed", "added", "same"], "the change sits in place, before what did not change");
eq(d.paragraphs[0].map((p) => p.kind), ["same"], "untouched paragraphs are untouched");
eq(diffChapter(before, before).changed, 0, "no change, nothing marked");
const grown = diffChapter("One. Two.", "One. Two. Three.");
eq(grown.paragraphs[0].map((p) => p.kind), ["same", "same", "added"], "a sentence added at the end");
const cut = diffChapter("One. Two. Three.", "One. Three.");
eq(cut.paragraphs[0].map((p) => `${p.kind}:${p.text}`), ["same:One.", "removed:Two.", "same:Three."], "a sentence cut from the middle");

console.log(`\nrender: ${failed === 0 ? "all passed" : `${failed} failed`}`);
process.exit(failed === 0 ? 0 : 1);
