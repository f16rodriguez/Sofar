// Where a person is, and so where they should land.
//
// Every sign-in used to send people to the interview, including people who
// had finished it weeks ago and had a book waiting: a returning reader was
// greeted with "Twenty minutes of questions" and a button to start again.
// Nothing recorded that onboarding was over, so nothing could tell.
//
// Three stages, in order:
//   foundations  Block 0 is not done, or recording consent was never given
//   interview    foundations are in, but no book exists yet
//   book         there is at least one chapter, or onboarding is marked done
//
// "Has a chapter" counts as finished on purpose: a book written from a typed
// transcript, or by hand, is still a book, and its reader belongs on Today.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Stage = "foundations" | "interview" | "book";

export interface Journey {
  stage: Stage;
  /** Where this person should land after signing in. */
  home: "/onboarding" | "/interview" | "/today";
}

export async function journey(db: SupabaseClient, userId: string): Promise<Journey> {
  const [{ data: user }, { count }] = await Promise.all([
    db
      .from("users")
      .select("pronoun, birthplace, recording_consent_at, onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle(),
    db
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .neq("kind", "sofar"),
  ]);

  if (!user?.pronoun || !user?.birthplace || !user?.recording_consent_at) {
    return { stage: "foundations", home: "/onboarding" };
  }
  if (!user.onboarding_completed_at && (count ?? 0) === 0) {
    return { stage: "interview", home: "/interview" };
  }
  return { stage: "book", home: "/today" };
}

/** Record that the first interview is over. Idempotent: the first time wins. */
export async function markOnboarded(db: SupabaseClient, userId: string): Promise<void> {
  await db
    .from("users")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", userId)
    .is("onboarding_completed_at", null);
}
