"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/interview", label: "Interview" },
  { href: "/book", label: "The Book" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Sofar">
      <div className="nav-wrap">
        <Link className="wordmark" href="/book">
          <span className="rib" aria-hidden="true" />
          Sofar
        </Link>
        <div className="nav-links">
          {links.map((l) => {
            const current = path === l.href || path.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={current ? "nav-link current" : "nav-link"}
                aria-current={current ? "page" : undefined}
              >
                {l.label}
              </Link>
            );
          })}
          <form action="/auth/signout" method="post">
            <button type="submit" className="nav-link nav-button">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
