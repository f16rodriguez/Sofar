// Server-side auth (SPEC §3.1). Supabase Auth, cookie-backed so a session
// survives a refresh mid-interview.
//
// Every route that touches a person's material calls requireUser() and uses
// the id it returns. Nothing accepts a user id from the client: an id in a
// request body is a claim, and a claim from the browser is not identity.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireEnv } from "./env";

export async function authClient() {
  const store = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) {
              store.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh happens in middleware instead.
          }
        },
      },
    },
  );
}

export interface SignedInUser {
  id: string;
  email: string;
}

/** The signed-in user, or null. */
export async function currentUser(): Promise<SignedInUser | null> {
  const supabase = await authClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

/**
 * The signed-in user, or a thrown 401. Route handlers catch this and return
 * the response; there is no path where a missing session silently proceeds.
 */
export class Unauthorized extends Error {
  constructor() {
    super("not signed in");
    this.name = "Unauthorized";
  }
}

export async function requireUser(): Promise<SignedInUser> {
  const user = await currentUser();
  if (!user) throw new Unauthorized();
  return user;
}

/**
 * The app profile row, created on first sight. Supabase Auth owns identity;
 * public.users owns everything the book needs (SPEC §2).
 */
export async function ensureProfile(user: SignedInUser): Promise<void> {
  const { serviceClient } = await import("./supabase");
  const db = serviceClient();
  const { error } = await db
    .from("users")
    .upsert({ id: user.id, email: user.email }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`ensureProfile failed: ${error.code ?? error.message}`);
}
