// The interview screen. Identity comes from the auth cookie; Block 0 must be
// done first, because the writer cannot say "he" or name a city without it.

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import Recorder from "./Recorder";

export const metadata = { title: "Sofar — Interview" };

export default async function InterviewPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const db = serviceClient();
  const { data } = await db
    .from("users")
    .select("pronoun, birthplace, recording_consent_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!data?.pronoun || !data?.birthplace || !data?.recording_consent_at) redirect("/onboarding");

  return (
    <main>
      <Recorder />
    </main>
  );
}
