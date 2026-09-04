// Block 0 — foundations (SPEC §3.2). A typed form, eight fields, under two
// minutes, written straight to the users row. No LLM call.
//
// These are facts the book cannot exist without: the model cannot write "he"
// or name a city without them. Nothing here becomes a chapter opening — it is
// context, not story (phase0 §3).

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import FoundationsForm, { type FoundationsData } from "../FoundationsForm";

export const metadata = { title: "Sofar — Foundations" };

export default async function Onboarding() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const db = serviceClient();
  const { data } = await db.from("users").select("*").eq("id", user.id).maybeSingle();

  return (
    <main className="page-narrow rise">
      <h1 className="page-title">Before the questions</h1>
      <p className="lede">
        Eight things the book needs to exist. A minute, no stories yet — those come next.
      </p>
      <FoundationsForm
        data={(data as FoundationsData | null) ?? null}
        next="/interview"
        submitLabel="Start the interview"
      />
    </main>
  );
}
