// The morning question, by email (SPEC §3.4). The subject line is the
// question itself: it is what a friend's text would say, and it is the one
// line that is read on a locked phone. The body is the question again and one
// button to answer it — nothing about the product, nothing to scroll.

import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigured, sendEmail, unsubscribeToken, type Email, type SendResult } from "../email";
import { bookText } from "../typography";
import { log } from "../log";

const CREAM = "#F4EEE2";
const INK = "#1C1A17";
const OXBLOOD = "#7A2E2A";
const MUTED = "#7A746A";
const RULE = "#D9D0BF";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The site's public address, for links in mail. Configuration only — there is no request to read it from. */
export function publicOrigin(): string | null {
  const fixed = process.env.SITE_URL || process.env.URL;
  return fixed ? fixed.replace(/\/+$/, "") : null;
}

export function questionEmail(opts: {
  question: string;
  origin: string;
  userId: string;
}): Omit<Email, "to"> {
  const question = bookText(opts.question.trim());
  const answer = `${opts.origin}/today?from=email`;
  const settings = `${opts.origin}/settings#timezone`;
  const stop = `${opts.origin}/unsubscribe?u=${opts.userId}&t=${unsubscribeToken(opts.userId)}`;
  const oneClick = `${opts.origin}/api/email/unsubscribe?u=${opts.userId}&t=${unsubscribeToken(opts.userId)}`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escape(question)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;">About thirty seconds, out loud.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td style="font-family:${SANS};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};padding:0 0 18px;">Sofar &middot; this morning</td></tr>
<tr><td style="font-family:${SERIF};font-size:26px;line-height:1.3;color:${INK};padding:0 0 28px;">${escape(question)}</td></tr>
<tr><td><a href="${answer}" style="display:inline-block;background:${OXBLOOD};color:${CREAM};font-family:${SANS};font-size:16px;font-weight:600;text-decoration:none;padding:15px 26px;border-radius:4px;">Answer out loud</a></td></tr>
<tr><td style="font-family:${SANS};font-size:14px;line-height:1.5;color:${MUTED};padding:14px 0 0;">About thirty seconds. Say it the way you&rsquo;d tell someone who was there.</td></tr>
<tr><td style="font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};padding:40px 0 0;border-bottom:0;">
<div style="border-top:1px solid ${RULE};padding-top:14px;">One question each morning at eight. <a href="${stop}" style="color:${MUTED};">Stop these emails</a> &middot; <a href="${settings}" style="color:${MUTED};">Change the time zone</a></div>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text = [
    question,
    "",
    `Answer out loud: ${answer}`,
    "About thirty seconds. Say it the way you'd tell someone who was there.",
    "",
    "--",
    "One question each morning at eight.",
    `Stop these emails: ${stop}`,
  ].join("\n");

  return {
    subject: question,
    html,
    text,
    // One-click unsubscribe (RFC 8058): the mail client POSTs here with no
    // page and no sign-in. Gmail and Yahoo expect it of anyone sending daily.
    headers: {
      "List-Unsubscribe": `<${oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** Send this morning's question to its person, if they want it and email is set up. */
export async function emailQuestion(
  db: SupabaseClient,
  userId: string,
  question: string,
  fetcher?: typeof fetch,
): Promise<SendResult> {
  if (!emailConfigured()) return { sent: false, reason: "email is not configured" };
  const origin = publicOrigin();
  if (!origin) return { sent: false, reason: "no SITE_URL to link to" };

  const { data: user, error } = await db.from("users").select("email, email_daily").eq("id", userId).maybeSingle();
  if (error) throw new Error(`email lookup failed: ${error.code ?? error.message}`);
  if (!user?.email) return { sent: false, reason: "no address" };
  if (user.email_daily === false) return { sent: false, reason: "turned off" };

  const result = await sendEmail({ to: user.email as string, ...questionEmail({ question, origin, userId }) }, fetcher);
  log.info("daily.email", { userId, sent: result.sent, reason: result.sent ? undefined : result.reason });
  return result;
}
