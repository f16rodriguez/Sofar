// Outbound email, through Resend's HTTP API (SPEC §1: "Resend or
// equivalent"). One function, no SDK: a POST with a bearer key.
//
// Off until configured. Without RESEND_API_KEY and SOFAR_EMAIL_FROM nothing is
// sent and nothing fails — the caller is told why, and the question still
// waits on Today. The From address must be on a domain verified in Resend;
// the netlify.app address cannot be.
//
// Never log an address or a body: the question is written from someone's
// life (SPEC §7). Callers log the user id and the outcome, nothing else.

import crypto from "node:crypto";

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers — List-Unsubscribe, chiefly. */
  headers?: Record<string, string>;
}

export type SendResult = { sent: true; id: string } | { sent: false; reason: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.SOFAR_EMAIL_FROM);
}

export async function sendEmail(email: Email, fetcher: typeof fetch = fetch): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SOFAR_EMAIL_FROM;
  if (!key || !from) return { sent: false, reason: "email is not configured" };

  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    }),
  });
  if (!res.ok) return { sent: false, reason: `resend ${res.status}` };
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { sent: true, id: body.id ?? "" };
}

// --- unsubscribe ------------------------------------------------------------
//
// A link that works without signing in, so it has to prove who it is for: an
// HMAC of the user id under a server-only key. Rotating the key retires every
// old link, which is the right failure — the Settings box still works.

function signingKey(): string {
  const key = process.env.SOFAR_EMAIL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("no key to sign unsubscribe links with");
  return key;
}

export function unsubscribeToken(userId: string): string {
  return crypto.createHmac("sha256", signingKey()).update(`unsubscribe:${userId}`).digest("base64url");
}

export function verifyUnsubscribe(userId: string, token: string): boolean {
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !token) return false;
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
