// What a proposed revision changes, sentence by sentence (SPEC §5.5).
//
// A revision is a decision, and it used to be presented as a second copy of
// the whole chapter to be compared by eye. Most revisions change one or two
// sentences; someone deciding whether their book should change deserves to
// see exactly which ones, and nothing else lit up.

export type Piece = { text: string; kind: "same" | "added" | "removed" };
export type DiffParagraph = Piece[];

/** Sentences, keeping their closing punctuation and any closing quote. */
export function sentences(paragraph: string): string[] {
  const parts = paragraph.match(/[^.!?]+(?:[.!?]+["'”’)]*|$)\s*/g) ?? [paragraph];
  return parts.map((s) => s.trim()).filter(Boolean);
}

function lcs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): [number, number][] {
  const m = a.length;
  const n = b.length;
  const t: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      t[i][j] = eq(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (eq(a[i], b[j])) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * The proposed chapter, paragraph by paragraph, with every sentence marked as
 * unchanged, new, or gone. Removed sentences sit where they used to be, so the
 * change reads in place.
 */
export function diffChapter(original: string, proposed: string): { paragraphs: DiffParagraph[]; changed: number } {
  const para = (s: string) => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const flat = (ps: string[]) => ps.flatMap((p, pi) => sentences(p).map((text) => ({ text, pi })));

  const a = flat(para(original));
  const b = flat(para(proposed));
  const pairs = lcs(a, b, (x, y) => norm(x.text) === norm(y.text));

  const out: DiffParagraph[] = [];
  const push = (pi: number, piece: Piece) => {
    while (out.length <= pi) out.push([]);
    out[pi].push(piece);
  };

  let ai = 0;
  let bi = 0;
  let changed = 0;
  let lastPi = 0;
  for (const [pa, pb] of [...pairs, [a.length, b.length] as [number, number]]) {
    // Removed sentences are shown in the paragraph of the proposed sentence
    // that follows them, or the last paragraph written so far.
    const home = pb < b.length ? b[pb].pi : lastPi;
    while (ai < pa) {
      push(home, { text: a[ai].text, kind: "removed" });
      changed++;
      ai++;
    }
    while (bi < pb) {
      push(b[bi].pi, { text: b[bi].text, kind: "added" });
      lastPi = b[bi].pi;
      changed++;
      bi++;
    }
    if (pa < a.length && pb < b.length) {
      push(b[pb].pi, { text: b[pb].text, kind: "same" });
      lastPi = b[pb].pi;
      ai++;
      bi++;
    }
  }
  return { paragraphs: out.filter((p) => p.length > 0), changed };
}
