// Block 0 — foundations (SPEC §3.2). A typed form, eight fields, under two
// minutes, written straight to the users row. No LLM call.
//
// These are facts the book cannot exist without: the model cannot write "he"
// or name a city without them. Nothing here becomes a chapter opening — it is
// context, not story (phase0 §3).

import { redirect } from "next/navigation";
import { currentUser, requireUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";

export const metadata = { title: "Sofar — Foundations" };

async function save(formData: FormData) {
  "use server";
  const user = await requireUser();
  const text = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v.length > 0 ? v : null;
  };

  const age = Number(formData.get("age"));
  const priors = String(formData.get("prior_cities") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const db = serviceClient();
  const { error } = await db
    .from("users")
    .update({
      book_name: text("book_name"),
      pronoun: text("pronoun"),
      age: Number.isFinite(age) && age > 0 ? age : null,
      birthplace: text("birthplace"),
      current_city: text("current_city"),
      prior_cities: priors,
      occupation: text("occupation"),
      occupation_since: text("occupation_since"),
      household: text("household"),
      family_of_origin: text("family_of_origin"),
    })
    .eq("id", user.id);
  if (error) throw new Error(`foundations save failed: ${error.code ?? error.message}`);

  redirect("/interview");
}

export default async function Onboarding() {
  // A page redirects a signed-out visitor; only route handlers and actions
  // throw. requireUser() still guards the save action below, so the form
  // cannot be posted without a session.
  const user = await currentUser();
  if (!user) redirect("/signin");

  const db = serviceClient();
  const { data } = await db.from("users").select("*").eq("id", user.id).maybeSingle();

  return (
    <main style={wrap}>
      <h1 style={title}>Before the questions</h1>
      <p style={lede}>
        Eight things the book needs to exist. A minute, no stories yet — those
        come next.
      </p>

      <form action={save} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Field
          label="What should the book call you?"
          hint="Your name, a nickname, or leave it blank."
          name="book_name"
          defaultValue={data?.book_name ?? ""}
        />

        <div style={fieldWrap}>
          <label style={labelStyle} htmlFor="pronoun">
            He, she, or they?
          </label>
          <select
            id="pronoun"
            name="pronoun"
            defaultValue={data?.pronoun ?? ""}
            required
            style={input}
          >
            <option value="" disabled>
              Choose
            </option>
            <option value="he">He</option>
            <option value="she">She</option>
            <option value="they">They</option>
          </select>
        </div>

        <Field
          label="How old are you?"
          name="age"
          type="number"
          required
          defaultValue={data?.age ? String(data.age) : ""}
        />
        <Field
          label="Where were you born?"
          name="birthplace"
          required
          defaultValue={data?.birthplace ?? ""}
        />
        <Field
          label="Where do you live now?"
          name="current_city"
          required
          defaultValue={data?.current_city ?? ""}
        />
        <Field
          label="Anywhere in between?"
          hint="Just the list, separated by commas."
          name="prior_cities"
          defaultValue={(data?.prior_cities ?? []).join(", ")}
        />
        <Field
          label="What do you do for work right now?"
          name="occupation"
          defaultValue={data?.occupation ?? ""}
        />
        <Field
          label="And for how long?"
          name="occupation_since"
          defaultValue={data?.occupation_since ?? ""}
        />
        <Field
          label="Who lives with you?"
          name="household"
          defaultValue={data?.household ?? ""}
        />
        <Field
          label="Who's still around from the family you grew up in?"
          name="family_of_origin"
          defaultValue={data?.family_of_origin ?? ""}
        />

        <button type="submit" style={button}>
          Start the interview
        </button>
      </form>
    </main>
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
    <div style={fieldWrap}>
      <label style={labelStyle} htmlFor={name}>
        {label}
      </label>
      {hint && <span style={hintStyle}>{hint}</span>}
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        style={input}
      />
    </div>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: "32rem",
  margin: "0 auto",
  padding: "clamp(32px, 8vh, 72px) 24px 96px",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};
const title: React.CSSProperties = {
  fontFamily: "var(--font-book)",
  fontWeight: 400,
  fontSize: "clamp(26px, 4vw, 34px)",
  margin: 0,
};
const lede: React.CSSProperties = {
  fontFamily: "var(--font-book)",
  fontSize: 19,
  lineHeight: 1.55,
  color: "#3d3932",
  margin: 0,
};
const fieldWrap: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-book)",
  fontSize: 18,
  color: "#1c1a17",
};
const hintStyle: React.CSSProperties = {
  fontFamily: "var(--font-chrome)",
  fontSize: 13,
  color: "#7a746a",
};
const input: React.CSSProperties = {
  fontFamily: "var(--font-chrome)",
  fontSize: 16,
  padding: "12px 14px",
  border: "1px solid #d9d0bf",
  borderRadius: 4,
  background: "#fbf7ef",
  color: "#1c1a17",
};
const button: React.CSSProperties = {
  alignSelf: "flex-start",
  fontFamily: "var(--font-chrome)",
  fontSize: 16,
  fontWeight: 500,
  background: "#7a2e2a",
  color: "#f4eee2",
  border: "none",
  borderRadius: 4,
  padding: "15px 26px",
  cursor: "pointer",
  marginTop: 8,
};
