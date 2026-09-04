// Landing — design/landing.html (founder-supplied), ported one to one. The
// copy is the founder's; wording is not edited here. Both buttons go to
// sign-in, which is invite-only until billing exists (lib/auth.ts).

import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import "./landing.css";

export const metadata = {
  title: "Sofar — the book of your life, so far",
  description: "A living autobiography.",
};

export default async function Home() {
  if (await currentUser()) redirect("/interview");

  return (
    <div className="landing">
      <header>
        <div className="wrap">
          <Link className="wordmark" href="/">
            <span className="rib" aria-hidden="true" />
            Sofar
          </Link>
          <span className="small">A living autobiography</span>
        </div>
      </header>

      <main>
        <div className="hero">
          <div className="wrap">
            <h1>You’re the only one who was there for all of it.</h1>
            <p className="lede">
              Sofar writes it down while you still remember. Twenty minutes of
              questions, and by tomorrow you have the first three chapters of
              your own book — written from what you say, in your voice, about
              your life as it is right now. Not a journal. A book, with you as
              the character.
            </p>
            <Link className="btn" href="/signin">
              Start the interview
            </Link>
            <p className="under">
              14 days free, full access. You’ll be asked to confirm you’re okay
              being recorded.
            </p>

            <div className="page" aria-label="Sample chapter">
              <div className="rib" aria-hidden="true" />
              <div className="num">I</div>
              <h2>The year she stopped asking permission</h2>
              <p>
                She had left three jobs before, and each time she had waited
                for someone to tell her it was allowed. This time no one did.
                She noticed that only later, on the drive home, when the
                silence in the car felt like a verdict she had handed down
                herself.
              </p>
              <p>
                What she told her mother was that the money was fine. What she
                told herself was harder to repeat.
              </p>
              <p className="cap">
                Written from a twenty-minute interview. Every sentence traces
                to something she said.
              </p>
            </div>
          </div>
        </div>

        <section>
          <div className="wrap">
            <h2>How it works</h2>
            <div className="step">
              <h3>
                <em>I</em>An interview, by voice
              </h3>
              <p>
                Twenty minutes. The questions are specific: what happened
                yesterday, who you told, what it cost you. Nothing about how
                you feel in the abstract. Skip anything. The last question is
                optional, and you’ll know when it’s coming.
              </p>
            </div>
            <div className="step">
              <h3>
                <em>II</em>Three chapters by tomorrow
              </h3>
              <p>
                A prologue set in your present. The most recent decision that
                changed your days. The thing you’re most sure of, and where it
                came from. Read them, then tell us the sentence that’s wrong.
              </p>
            </div>
            <div className="step">
              <h3>
                <em>III</em>One question a day after that
              </h3>
              <p>
                Thirty seconds, by voice, plus one deeper question each week.
                The book grows. Chapters get revised as it learns you. The last
                chapter is always titled “So far,” and it holds whatever is
                still open.
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <h2>What it isn’t</h2>
            <p>
              It isn’t therapy. It isn’t a quiz, a personality test, or a
              prompt to journal. It won’t tell you who you really are, and it
              won’t grade your answers. It’s an interview, and then it’s a
              book. If you say something is true, the book writes it as true.
              If you contradict yourself, it asks — it never decides.
            </p>
          </div>
        </section>

        <section>
          <div className="wrap">
            <h2>Privacy, plainly</h2>
            <div className="plain">
              <p>
                Your recordings are transcribed and then deleted within sixty
                days. Nothing you say is used to train anything.
              </p>
              <p>
                No one reads your transcript. The book is written by a model,
                and the only person who sees it is you.
              </p>
              <p>
                Your book is yours. Export it anytime as a PDF. Delete
                everything anytime, and it’s gone.
              </p>
              <p>
                Nothing is ever shared unless you choose it — and if you do,
                the names of other people in your life are changed first.
              </p>
            </div>
          </div>
        </section>

        <section id="start">
          <div className="wrap">
            <h2>The trial</h2>
            <p>
              Fourteen days, everything included: the interview, the daily
              questions, the revisions, the export. A card is required so that
              no one’s book stops halfway through — you won’t be charged until
              day fifteen, and you can cancel in one tap before then.
            </p>
            <dl className="terms">
              <dt>After the trial</dt>
              <dd>
                $14.99 a month, or $99 a year. Cancel anytime. Your book exports
                whether you stay or not.
              </dd>
              <dt>What you need</dt>
              <dd>
                A phone, a quiet room, and twenty minutes you won’t be
                interrupted.
              </dd>
            </dl>
            <p className="again">
              <Link className="btn" href="/signin">
                Start the interview
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>Sofar</span>
          {/* Terms and Contact are the founder's and counsel's; no dead links until then. */}
          <span>
            <Link href="/privacy">Privacy</Link> &nbsp; Terms &nbsp; Contact
          </span>
        </div>
      </footer>
    </div>
  );
}
