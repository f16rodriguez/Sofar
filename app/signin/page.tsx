// Sign in (SPEC §3.1). Magic link — no password to invent, forget, or reset,
// and one fewer thing between a person and the first question.

import { redirect } from "next/navigation";
import { authClient, currentUser, isInvited } from "@/lib/auth";
import { headers } from "next/headers";
import { log } from "@/lib/log";
import { siteOrigin } from "@/lib/site";
import { serviceClient } from "@/lib/supabase";
import { allowSafe, LIMITS } from "@/lib/ratelimit";

export const metadata = { title: "Sofar — Sign in" };

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/signin?problem=email");
  // Checked before the link is sent, so an uninvited address never reaches
  // Supabase Auth and no account is created for it.
  if (!isInvited(email)) redirect("/signin?problem=invite");
  // Five links an hour per address. Supabase has its own cap; this one is
  // ours, and it answers with a sentence instead of a 429.
  const gate = await allowSafe(serviceClient, {
    action: "signin_link",
    subject: email.toLowerCase(),
    ...LIMITS.signin_link,
  });
  if (!gate.allowed) redirect("/signin?problem=slow");

  const supabase = await authClient();
  const host = siteOrigin(await headers());
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${host}/auth/callback` },
  });
  // The person sees "that didn't send"; the cause has to be findable. Name
  // and status only — never the address.
  if (error) log.error("signin.send", error, { status: error.status ?? null });
  redirect(error ? "/signin?problem=send" : "/signin?sent=1");
}

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; problem?: string; deleted?: string }>;
}) {
  if (await currentUser()) redirect("/onboarding");
  const { sent, problem, deleted } = await searchParams;

  return (
    <main style={wrap} className="rise">
      <h1 style={title}>Sofar</h1>
      {deleted && (
        <p style={lede}>
          Your book will be deleted within 24 hours. Thank you for writing it down.
        </p>
      )}
      {sent ? (
        <p style={lede}>
          Check your email. The link signs you in — no password.
        </p>
      ) : (
        <>
          <p style={lede}>
            Your email, and we&rsquo;ll send a link. There is no password to
            remember.
          </p>
          <form action={sendLink} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              style={input}
            />
            <button type="submit" style={button}>
              Send the link
            </button>
          </form>
          {problem === "send" && (
            <p style={problemStyle}>That didn&rsquo;t send. Check the address and try again.</p>
          )}
          {problem === "link" && (
            <p style={problemStyle}>
              That link has been used already, or it expired. Send yourself a fresh one — links
              last an hour, and each one works once.
            </p>
          )}
          {problem === "slow" && (
            <p style={problemStyle}>
              That&rsquo;s a few links in a row. Check your inbox and spam; the last one still works.
            </p>
          )}
          {problem === "invite" && (
            <p style={problemStyle}>
              Sofar is invite-only while it&rsquo;s being built.
            </p>
          )}
        </>
      )}
    </main>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: "26rem",
  margin: "0 auto",
  padding: "clamp(48px, 12vh, 120px) 24px",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};
const title: React.CSSProperties = {
  fontFamily: "var(--font-book)",
  fontWeight: 400,
  fontSize: 34,
  margin: 0,
};
const lede: React.CSSProperties = {
  fontFamily: "var(--font-book)",
  fontSize: 19,
  lineHeight: 1.55,
  color: "#3d3932",
  margin: 0,
};
const input: React.CSSProperties = {
  fontFamily: "var(--font-chrome)",
  fontSize: 16,
  padding: "14px 16px",
  border: "1px solid #d9d0bf",
  borderRadius: 4,
  background: "#fbf7ef",
  color: "#1c1a17",
};
const button: React.CSSProperties = {
  fontFamily: "var(--font-chrome)",
  fontSize: 16,
  fontWeight: 500,
  background: "#7a2e2a",
  color: "#f4eee2",
  border: "none",
  borderRadius: 4,
  padding: "15px 26px",
  cursor: "pointer",
};
const problemStyle: React.CSSProperties = {
  fontFamily: "var(--font-chrome)",
  fontSize: 14,
  color: "#7a2e2a",
  margin: 0,
};
