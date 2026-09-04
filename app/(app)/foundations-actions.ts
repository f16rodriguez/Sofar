"use server";

// Block 0 — foundations (SPEC §3.2), saved from onboarding and again from
// Settings. Facts the book cannot exist without; context, not story.

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";

export async function saveFoundations(formData: FormData) {
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
  const style = text("style");

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
      ...(style === "first" || style === "third" ? { style } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) throw new Error(`foundations save failed: ${error.code ?? error.message}`);

  // Only our own paths; a "next" from the form is a suggestion, not a jump.
  const next = String(formData.get("next") ?? "/interview");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/interview");
}
