// The Block 0 form (SPEC §3.2). Eight fields, under two minutes, no LLM call.
// Used by onboarding (then straight to the interview) and by Settings.

import { saveFoundations } from "./foundations-actions";

export interface FoundationsData {
  book_name: string | null;
  pronoun: string | null;
  age: number | null;
  birthplace: string | null;
  current_city: string | null;
  prior_cities: string[] | null;
  occupation: string | null;
  occupation_since: string | null;
  household: string | null;
  family_of_origin: string | null;
  style: string | null;
  recording_consent_at?: string | null;
}

export default function FoundationsForm({
  data,
  next,
  submitLabel,
  showStyle = false,
  askConsent = false,
}: {
  data: FoundationsData | null;
  next: string;
  submitLabel: string;
  showStyle?: boolean;
  /** Block 0 asks once; the interview does not start without it. */
  askConsent?: boolean;
}) {
  return (
    <form action={saveFoundations} className="form">
      <input type="hidden" name="next" value={next} />

      <Field
        label="What should the book call you?"
        hint="Your name, a nickname, or leave it blank."
        name="book_name"
        defaultValue={data?.book_name ?? ""}
      />

      <div className="field">
        <label className="label" htmlFor="pronoun">
          He, she, or they?
        </label>
        <select id="pronoun" name="pronoun" defaultValue={data?.pronoun ?? ""} required className="input">
          <option value="" disabled>
            Choose
          </option>
          <option value="he">He</option>
          <option value="she">She</option>
          <option value="they">They</option>
        </select>
      </div>

      {showStyle && (
        <fieldset className="field choice">
          <legend className="label">Whose voice is the book in?</legend>
          <span className="hint">
            Third person reads like a biography. First person reads like you wrote it. Chapters
            already written keep their voice until they are revised.
          </span>
          <label className="option">
            <input type="radio" name="style" value="third" defaultChecked={(data?.style ?? "third") === "third"} />
            Third person — <em>he left before the coffee was ready.</em>
          </label>
          <label className="option">
            <input type="radio" name="style" value="first" defaultChecked={data?.style === "first"} />
            First person — <em>I left before the coffee was ready.</em>
          </label>
        </fieldset>
      )}

      <Field label="How old are you?" name="age" type="number" required defaultValue={data?.age ? String(data.age) : ""} />
      <Field label="Where were you born?" name="birthplace" required defaultValue={data?.birthplace ?? ""} />
      <Field label="Where do you live now?" name="current_city" required defaultValue={data?.current_city ?? ""} />
      <Field
        label="Anywhere in between?"
        hint="Just the list, separated by commas."
        name="prior_cities"
        defaultValue={(data?.prior_cities ?? []).join(", ")}
      />
      <Field label="What do you do for work right now?" name="occupation" defaultValue={data?.occupation ?? ""} />
      <Field label="And for how long?" name="occupation_since" defaultValue={data?.occupation_since ?? ""} />
      <Field label="Who lives with you?" name="household" defaultValue={data?.household ?? ""} />
      <Field
        label="Who's still around from the family you grew up in?"
        name="family_of_origin"
        defaultValue={data?.family_of_origin ?? ""}
      />

      {askConsent && (
        <label className="option consent">
          <input type="checkbox" name="recording_consent" required />
          <span>
            I&rsquo;m okay being recorded. Recordings are transcribed, and the recording itself is
            deleted after sixty days unless I choose to keep it. Nothing I say is used to train
            anything.
          </span>
        </label>
      )}

      <button type="submit" className="button">
        {submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  name,
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  hint?: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={name}>
        {label}
      </label>
      {hint && <span className="hint">{hint}</span>}
      <input id={name} name={name} type={type} required={required} defaultValue={defaultValue} className="input" />
    </div>
  );
}
