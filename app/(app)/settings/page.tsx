// Settings. What the book knows about you, who it may name, what happens to
// your voice, the way out, and the way to take it all with you or end it
// (SPEC §3.8, §3.9).

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import FoundationsForm, { type FoundationsData } from "../FoundationsForm";
import TimezoneSelect from "./TimezoneSelect";
import DeleteAccount from "./DeleteAccount";
import { savePerson, saveRecordings, saveTimezone } from "./actions";

export const metadata = { title: "Sofar — Settings" };

interface Person {
  id: string;
  label: string;
  relationship: string | null;
  may_name_in_prose: boolean;
  prose_reference: string | null;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; problem?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { saved, problem } = await searchParams;

  const db = serviceClient();
  const [{ data: profile }, { data: people }] = await Promise.all([
    db.from("users").select("*").eq("id", user.id).maybeSingle(),
    db
      .from("memory_people")
      .select("id, label, relationship, may_name_in_prose, prose_reference")
      .eq("user_id", user.id)
      .order("label"),
  ]);

  const Saved = ({ section }: { section: string }) =>
    saved === section ? <p className="saved">Saved.</p> : null;

  return (
    <main className="page-narrow rise">
      <h1 className="page-title">Settings</h1>

      <section className="settings-section" id="foundations">
        <h2 className="section-title">What the book knows</h2>
        <p className="lede">
          The facts every chapter rests on. Change one and the next chapter uses it; chapters
          already written are revised only when you accept a revision.
        </p>
        <Saved section="foundations" />
        <FoundationsForm
          data={(profile as FoundationsData | null) ?? null}
          next="/settings?saved=foundations#foundations"
          submitLabel="Save"
          showStyle
        />
      </section>

      <section className="settings-section" id="people">
        <h2 className="section-title">People in your book</h2>
        <p className="lede">
          Nobody is named unless you allow it. Unchecked, the book refers to them the way you
          set here — <em>his mother</em>, <em>her oldest friend</em> — and a chapter that prints
          the name is rejected before you ever see it.
        </p>
        <Saved section="people" />
        {(people ?? []).length === 0 ? (
          <p className="hint">Nobody yet. People arrive with your answers.</p>
        ) : (
          <ul className="people">
            {((people ?? []) as Person[]).map((p) => (
              <li key={p.id} className="person">
                <form action={savePerson} className="person-form">
                  <input type="hidden" name="person_id" value={p.id} />
                  <div className="person-head">
                    <span className="person-label">{p.label}</span>
                    {p.relationship && <span className="hint">{p.relationship}</span>}
                  </div>
                  <label className="option">
                    <input type="checkbox" name="may_name" defaultChecked={p.may_name_in_prose} />
                    The book may print this name
                  </label>
                  <div className="field">
                    <label className="hint" htmlFor={`ref-${p.id}`}>
                      Otherwise, refer to them as
                    </label>
                    <input
                      id={`ref-${p.id}`}
                      name="prose_reference"
                      className="input"
                      defaultValue={p.prose_reference ?? ""}
                      placeholder={p.relationship ? `${p.relationship}` : "his brother, her friend from work"}
                    />
                  </div>
                  <button type="submit" className="button-quiet">
                    Save
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section" id="recordings">
        <h2 className="section-title">Your voice</h2>
        <p className="lede">
          Each recording is transcribed, and the transcript is what the book is written from.
          The recording itself is deleted sixty days after you made it unless you choose to keep
          it.
        </p>
        <Saved section="recordings" />
        <form action={saveRecordings} className="form">
          <label className="option">
            <input type="checkbox" name="keep_audio" defaultChecked={Boolean(profile?.keep_audio)} />
            Keep my recordings
          </label>
          <button type="submit" className="button-quiet">
            Save
          </button>
        </form>
      </section>

      <section className="settings-section" id="timezone">
        <h2 className="section-title">Where your day is</h2>
        <p className="lede">The daily question arrives at a local hour. This is the clock it uses.</p>
        <Saved section="timezone" />
        {problem === "timezone" && <p className="problem">That isn&rsquo;t a time zone the book knows.</p>}
        <form action={saveTimezone} className="form">
          <div className="field">
            <TimezoneSelect saved={String(profile?.timezone ?? "UTC")} />
          </div>
          <button type="submit" className="button-quiet">
            Save
          </button>
        </form>
      </section>

      <section className="settings-section" id="account">
        <h2 className="section-title">Account</h2>
        <p className="lede">
          Signed in as <span className="mono">{user.email}</span>. There is no password; the link
          in your email is the key.
        </p>
        <div className="row">
          <a className="button-quiet" href="/api/export" download>
            Export the book as PDF
          </a>
          <form action="/auth/signout" method="post">
            <button type="submit" className="button-quiet">
              Sign out
            </button>
          </form>
        </div>
      </section>

      <section className="settings-section" id="delete">
        <h2 className="section-title">Delete everything</h2>
        <DeleteAccount />
      </section>
    </main>
  );
}
