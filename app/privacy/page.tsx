// Privacy, plainly. The four statements from the landing page, then what
// they mean in practice, in the same voice. SPEC §7 asks for the no-training
// statement here. Facts only — every line below is something the app does.

import Link from "next/link";
import "../landing.css";

// Rendered per request: the prerendered copy of this page came back 502 from
// Netlify's static path on every hit while every dynamic page was fine.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sofar — Privacy",
  description: "What Sofar keeps, who can see it, and how to take it with you.",
};

export default function Privacy() {
  return (
    <div className="landing">
      <header>
        <div className="wrap">
          <Link className="wordmark" href="/">
            <span className="rib" aria-hidden="true" />
            Sofar
          </Link>
          <span className="small">Privacy, plainly</span>
        </div>
      </header>

      <main>
        <section style={{ borderTop: "none", paddingTop: 72 }}>
          <div className="wrap">
            <h2>Privacy, plainly</h2>
            <div className="plain">
              <p>
                Your recordings are transcribed and then deleted within sixty days. Nothing you say
                is used to train anything.
              </p>
              <p>
                No one reads your transcript. The book is written by a model, and the only person
                who sees it is you.
              </p>
              <p>Your book is yours. Export it anytime as a PDF. Delete everything anytime, and it&rsquo;s gone.</p>
              <p>
                Nothing is ever shared unless you choose it — and if you do, the names of other
                people in your life are changed first.
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <h2>What that means in practice</h2>
            <div className="step">
              <h3>What is kept</h3>
              <p>
                Your answers as text, the recordings they came from, the facts the book draws from
                them — people, places, events, what you said you believe — and the chapters. Your
                email, so the sign-in link can reach you. No password exists.
              </p>
            </div>
            <div className="step">
              <h3>Recordings</h3>
              <p>
                A recording is sent for transcription and stored privately. Sixty days after it was
                made it is deleted, unless you turned on <em>Keep my recordings</em> in Settings.
                The transcript stays either way; it is what the book is written from.
              </p>
            </div>
            <div className="step">
              <h3>The models</h3>
              <p>
                The writing is done by Anthropic&rsquo;s Claude and the transcription by Deepgram,
                each receiving only what it needs for that one request. Anthropic does not retain
                the request beyond serving it and does not train on it. Nothing you say is used to
                train any model.
              </p>
            </div>
            <div className="step">
              <h3>Names</h3>
              <p>
                No one in your life is named in the book unless you allow it, person by person, in
                Settings. Until then the book says <em>her mother</em>, <em>his oldest friend</em>.
              </p>
            </div>
            <div className="step">
              <h3>Who can see it</h3>
              <p>
                You. Every table is locked to your account. The people who run Sofar do not read
                transcripts or books, and the logs never carry them.
              </p>
            </div>
            <div className="step">
              <h3>Taking it with you, or ending it</h3>
              <p>
                Export the whole book as a PDF from Settings, on any plan, at any time. Delete
                everything from Settings: the export comes first so nothing is lost, then every
                row, every recording, and the account itself are gone within 24 hours.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>Sofar</span>
          <span>
            <Link href="/privacy">Privacy</Link> &nbsp; Terms &nbsp; Contact
          </span>
        </div>
      </footer>
    </div>
  );
}
