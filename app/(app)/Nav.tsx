"use client";

// Three places, because there are three things a person does here: answer
// today's question, read the book, change something about it. The manuscript
// is the book's table of contents and lives inside it; the interview is a
// first week, reached from Today while it is unfinished, not a tab someone
// who finished it months ago keeps tripping over.
//
// On a phone the tabs sit at the bottom, where a thumb already is, and clear
// the home indicator. From a tablet up they move into the header. Current
// place is marked in ink: oxblood belongs to the ribbon, the chapter
// numeral and the answer button (SPEC §6), and nothing else.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  // The first interview is reached from Today, so it counts as being there.
  { href: "/today", label: "Today", also: ["/interview", "/onboarding"] },
  { href: "/book", label: "Book", also: ["/manuscript"] },
  { href: "/settings", label: "Settings", also: [] as string[] },
];

export default function Nav() {
  const path = usePathname() ?? "";
  const current = (t: (typeof TABS)[number]) =>
    [t.href, ...t.also].some((h) => path === h || path.startsWith(`${h}/`));

  const tabs = TABS.map((t) => (
    <Link
      key={t.href}
      href={t.href}
      className={current(t) ? "tab current" : "tab"}
      aria-current={current(t) ? "page" : undefined}
    >
      {t.label}
    </Link>
  ));

  return (
    <>
      <header className="masthead">
        <div className="masthead-wrap">
          <Link className="wordmark" href="/today" aria-label="Sofar — today">
            <span className="rib" aria-hidden="true" />
            Sofar
          </Link>
          <nav className="tabs-top" aria-label="Sofar">
            {tabs}
          </nav>
        </div>
      </header>
      <nav className="tabs-bottom" aria-label="Sofar">
        {tabs}
      </nav>
    </>
  );
}
