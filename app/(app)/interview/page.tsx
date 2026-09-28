// The interview screen. Identity comes from the auth cookie; Block 0 must be
// done first, because the writer cannot say "he" or name a city without it.

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { journey } from "@/lib/journey";
import Recorder from "./Recorder";

export const metadata = { title: "Sofar — Interview" };

export default async function InterviewPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  // The interview builds the first book. Someone who already has one belongs
  // on Today, where the book grows a question at a time — not in front of a
  // button that starts the first interview again.
  const where = await journey(serviceClient(), user.id);
  if (where.stage === "foundations") redirect("/onboarding");
  if (where.stage === "book") redirect("/today");

  return (
    <main>
      <Recorder />
    </main>
  );
}
