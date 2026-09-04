// The book as a PDF (SPEC §3.8, M6). react-pdf, no headless browser.
//
// Title page (book_name or blank), then chapters in reading order — prologue,
// chapters by number, "So far." last. Newsreader for the text, Instrument
// Sans for the chrome, embedded from assets/fonts so the file reads the same
// on every device. Free on every plan, including cancelled: the book is the
// person's whether they stay or not.

import path from "node:path";
import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

export interface ExportChapter {
  number: number | null;
  title: string;
  kind: "prologue" | "chapter" | "interlude" | "sofar";
  body_md: string;
}

const CREAM = "#f4eee2";
const INK = "#1c1a17";
const OXBLOOD = "#7a2e2a";
const MUTED = "#7a746a";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
const numeral = (n: number | null) => (n === null || n <= 0 ? "" : (ROMAN[n] ?? String(n)));

let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: "Newsreader",
    fonts: [
      { src: path.join(dir, "Newsreader-400.ttf"), fontWeight: 400 },
      { src: path.join(dir, "Newsreader-400-italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(dir, "Newsreader-500.ttf"), fontWeight: 500 },
    ],
  });
  Font.register({
    family: "Instrument Sans",
    fonts: [
      { src: path.join(dir, "InstrumentSans-400.ttf"), fontWeight: 400 },
      { src: path.join(dir, "InstrumentSans-500.ttf"), fontWeight: 500 },
    ],
  });
  // No hyphenation: a broken word in a book about a life reads as a typo.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const S = StyleSheet.create({
  page: {
    backgroundColor: CREAM,
    color: INK,
    fontFamily: "Newsreader",
    fontSize: 11,
    lineHeight: 1.55,
    paddingTop: 64,
    paddingBottom: 64,
    paddingHorizontal: 60,
  },
  titlePage: {
    backgroundColor: CREAM,
    color: INK,
    fontFamily: "Newsreader",
    paddingTop: 200,
    paddingHorizontal: 60,
    paddingBottom: 64,
  },
  bookTitle: { fontSize: 30, letterSpacing: -0.4, lineHeight: 1.15 },
  bookSub: { fontFamily: "Instrument Sans", fontSize: 10, color: MUTED, marginTop: 14 },
  rib: { position: "absolute", top: 0, right: 60, width: 12, height: 40, backgroundColor: OXBLOOD },
  numeral: { fontSize: 30, color: OXBLOOD, lineHeight: 1, marginBottom: 6 },
  label: { fontFamily: "Instrument Sans", fontSize: 8.5, letterSpacing: 1.2, color: OXBLOOD, marginBottom: 10 },
  chapterTitle: { fontSize: 19, letterSpacing: -0.2, lineHeight: 1.2, marginBottom: 22 },
  paragraph: { marginBottom: 10, textAlign: "left" },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 60,
    right: 60,
    fontFamily: "Instrument Sans",
    fontSize: 8.5,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function Book({ bookName, chapters }: { bookName: string | null; chapters: ExportChapter[] }) {
  const name = bookName?.trim() || "";
  return (
    <Document
      title={name || "Sofar"}
      author={name || undefined}
      creator="Sofar"
      producer="Sofar"
    >
      <Page size={[396, 612]} style={S.titlePage}>
        <View style={S.rib} fixed />
        <Text style={S.bookTitle}>{name || " "}</Text>
        <Text style={S.bookSub}>A living autobiography · so far</Text>
      </Page>

      {chapters.map((c, i) => (
        <Page key={i} size={[396, 612]} style={S.page} wrap>
          <View style={S.rib} fixed />
          {c.kind === "prologue" ? (
            <Text style={S.label}>PROLOGUE</Text>
          ) : c.kind === "sofar" ? (
            <Text style={S.label}>SO FAR</Text>
          ) : c.kind === "interlude" ? (
            <Text style={S.label}>INTERLUDE</Text>
          ) : (
            <Text style={S.numeral}>{numeral(c.number)}</Text>
          )}
          <Text style={S.chapterTitle}>{c.title}</Text>
          {paragraphs(c.body_md).map((p, j) => (
            <Text key={j} style={S.paragraph}>
              {p}
            </Text>
          ))}
          <View style={S.footer} fixed>
            <Text>{name || "Sofar"}</Text>
            <Text render={({ pageNumber }) => String(pageNumber)} />
          </View>
        </Page>
      ))}
    </Document>
  );
}

/** Reading order: prologue first, chapters by number, "So far." last (concept §3). */
export function inReadingOrder(a: ExportChapter, b: ExportChapter): number {
  const rank = (c: ExportChapter) => (c.kind === "prologue" ? 0 : c.kind === "sofar" ? 2 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return (a.number ?? 0) - (b.number ?? 0);
}

export async function renderBookPdf(opts: {
  bookName: string | null;
  chapters: ExportChapter[];
}): Promise<Uint8Array> {
  registerFonts();
  const chapters = [...opts.chapters].sort(inReadingOrder);
  const buffer = await renderToBuffer(<Book bookName={opts.bookName} chapters={chapters} />);
  return new Uint8Array(buffer);
}
