"use server";

// Settings actions. Every one reads the user from the session, never from the
// form. Memory writes go through lib/memory.ts (CLAUDE.md conventions).

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { setNamingPermission } from "@/lib/memory";

export async function savePerson(formData: FormData) {
  const user = await requireUser();
  const personId = String(formData.get("person_id") ?? "");
  if (!personId) redirect("/settings");
  const reference = String(formData.get("prose_reference") ?? "").trim();
  await setNamingPermission(serviceClient(), user.id, personId, {
    mayName: formData.get("may_name") === "on",
    proseReference: reference.length > 0 ? reference : null,
  });
  redirect("/settings?saved=people#people");
}

export async function saveRecordings(formData: FormData) {
  const user = await requireUser();
  const db = serviceClient();
  const { error } = await db
    .from("users")
    .update({ keep_audio: formData.get("keep_audio") === "on", updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(`recordings save failed: ${error.code ?? error.message}`);
  redirect("/settings?saved=recordings#recordings");
}

export async function saveTimezone(formData: FormData) {
  const user = await requireUser();
  const tz = String(formData.get("timezone") ?? "").trim();
  // A time zone is a name the platform knows, or it is nothing.
  let valid = false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    valid = tz.length > 0;
  } catch {
    valid = false;
  }
  if (!valid) redirect("/settings?problem=timezone#timezone");
  const db = serviceClient();
  const { error } = await db
    .from("users")
    .update({ timezone: tz, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error(`timezone save failed: ${error.code ?? error.message}`);
  redirect("/settings?saved=timezone#timezone");
}
