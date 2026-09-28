// Stop the morning emails, from a link in one of them. No sign-in: the signed
// token in the link says whose they are. The page asks once, with a button,
// because opening a link is not a decision — mail scanners open them too.

import Link from "next/link";
import { verifyUnsubscribe } from "@/lib/email";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sofar — Morning emails", robots: { index: false } };

export default async function Unsubscribe({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string; done?: string }>;
}) {
  const { u = "", t = "", done } = await searchParams;
  const valid = verifyUnsubscribe(u, t);

  return (
    <div className="landing">
      <header>
        <div className="wrap">
          <Link className="wordmark" href="/">
            <span className="rib" aria-hidden="true" />
            Sofar
          </Link>
        </div>
      </header>
      <main>
        <section style={{ borderTop: "none", paddingTop: 72 }}>
          <div className="wrap">
            {done ? (
              <>
                <h2>No more morning emails.</h2>
                <div className="plain">
                  <p>The question still arrives on Today each morning. Turn the emails back on in Settings whenever you like.</p>
                  <p>
                    <Link href="/today">Go to Today</Link>
                  </p>
                </div>
              </>
            ) : valid ? (
              <>
                <h2>Stop the morning emails?</h2>
                <div className="plain">
                  <p>The question will still be waiting on Today. Nothing else changes.</p>
                  <form method="post" action={`/api/email/unsubscribe`}>
                    <input type="hidden" name="u" value={u} />
                    <input type="hidden" name="t" value={t} />
                    <button type="submit" name="confirm" value="1" className="btn">
                      Stop the emails
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <>
                <h2>This link has expired.</h2>
                <div className="plain">
                  <p>
                    Sign in and turn the emails off in <Link href="/settings#timezone">Settings</Link>.
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
