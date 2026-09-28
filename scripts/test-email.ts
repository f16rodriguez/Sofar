// The morning email (SPEC §3.4). Nothing is sent: every send goes to a stub
// in place of Resend. The unsubscribe link is exercised against a running app
// when one is up (SOFAR_BASE_URL, default localhost:3000).
//
//   set -a; . ./.env.local; set +a; npm run test:email

import { serviceClient } from "../lib/supabase";
import { sendEmail, unsubscribeToken, verifyUnsubscribe } from "../lib/email";
import { emailQuestion, questionEmail } from "../lib/daily/email";

const BASE = (process.env.SOFAR_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
let failed = 0;
const check = (ok: boolean, label: string, detail?: string) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};

type Sent = { url: string; body: Record<string, unknown> };
function stub(status = 200) {
  const sent: Sent[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ id: "stub-1" }), { status });
  }) as unknown as typeof fetch;
  return { sent, fetcher };
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    before[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const out = fn();
  if (out instanceof Promise) return out.finally(restore) as T;
  restore();
  return out;
}

const CONFIGURED = { RESEND_API_KEY: "re_test", SOFAR_EMAIL_FROM: "Sofar <morning@example.com>", SITE_URL: "https://sofar.example" };
const USER = "00000000-0000-4000-8000-000000000001";

async function composing() {
  console.log("the email");
  const mail = questionEmail({ question: `What did "Dee" say when the <truck> left?`, origin: "https://sofar.example", userId: USER });
  check(mail.subject === "What did “Dee” say when the <truck> left?", "the subject is the question, set in book quotes", mail.subject);
  check(mail.html.includes("&lt;truck&gt;") && !mail.html.includes("<truck>"), "the question is escaped in the page");
  check(mail.html.includes("https://sofar.example/today?from=email"), "one link to answer it, on Today");
  check(!/\b(book|chapter|page|story|interview|manuscript)s?\b/i.test(mail.text), "the text never mentions the book or the interview");
  check(
    mail.headers?.["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && /^<https:\/\/sofar\.example\/api\/email\/unsubscribe\?u=/.test(mail.headers?.["List-Unsubscribe"] ?? ""),
    "mail clients get a one-click unsubscribe",
  );
  check(mail.text.includes(`/unsubscribe?u=${USER}&t=`), "and the reader gets a link to stop them");
}

function tokens() {
  console.log("unsubscribe links");
  const t = unsubscribeToken(USER);
  check(verifyUnsubscribe(USER, t), "a link made for someone works for them");
  check(!verifyUnsubscribe("00000000-0000-4000-8000-000000000002", t), "and for nobody else");
  check(!verifyUnsubscribe(USER, t.slice(0, -2) + "xx"), "a forged token is refused");
  check(!verifyUnsubscribe("not-a-user", t) && !verifyUnsubscribe(USER, ""), "so are malformed ones");
}

async function sending() {
  console.log("sending");
  await withEnv({ RESEND_API_KEY: undefined, SOFAR_EMAIL_FROM: undefined }, async () => {
    const { sent, fetcher } = stub();
    const r = await sendEmail({ to: "x@example.com", subject: "s", html: "h", text: "t" }, fetcher);
    check(!r.sent && sent.length === 0, "without a key nothing is sent and nothing fails", r.sent ? "sent" : r.reason);
  });
  await withEnv(CONFIGURED, async () => {
    const { sent, fetcher } = stub();
    const r = await sendEmail({ to: "x@example.com", subject: "s", html: "h", text: "t", headers: { "X-A": "1" } }, fetcher);
    const body = sent[0]?.body ?? {};
    check(r.sent && sent[0]?.url === "https://api.resend.com/emails", "with one, it goes to Resend");
    check(body.from === CONFIGURED.SOFAR_EMAIL_FROM && JSON.stringify(body.to) === '["x@example.com"]', "from the configured address, to one person");
    const failing = stub(422);
    const bad = await sendEmail({ to: "x@example.com", subject: "s", html: "h", text: "t" }, failing.fetcher);
    check(!bad.sent && bad.reason === "resend 422", "a refusal is reported, not thrown");
  });
}

async function perPerson() {
  console.log("per person");
  const db = serviceClient();
  const email = `email-${Date.now()}@example.com`;
  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw new Error(`auth user: ${error?.message}`);
  const userId = created.user.id;
  try {
    await db.from("users").insert({ id: userId, email });
    await withEnv(CONFIGURED, async () => {
      const on = stub();
      const r = await emailQuestion(db, userId, "Who drove you to the airport?", on.fetcher);
      check(r.sent && JSON.stringify(on.sent[0]?.body.to) === JSON.stringify([email]), "on by default: the question goes to their address");

      await db.from("users").update({ email_daily: false }).eq("id", userId);
      const off = stub();
      const r2 = await emailQuestion(db, userId, "Who drove you to the airport?", off.fetcher);
      check(!r2.sent && off.sent.length === 0, "turned off, nothing is sent", r2.sent ? "sent" : r2.reason);
      await db.from("users").update({ email_daily: true }).eq("id", userId);
    });

    // The link in the email, against the running app.
    const alive = await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false);
    if (!alive) {
      console.log(`  - unsubscribe endpoint skipped: nothing running at ${BASE}`);
      return;
    }
    const forged = await fetch(`${BASE}/api/email/unsubscribe?u=${userId}&t=forged`, { method: "POST" });
    check(forged.status === 400, "a forged unsubscribe is refused", String(forged.status));
    const page = await fetch(`${BASE}/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`);
    const html = await page.text();
    check(page.status === 200 && /Stop the morning emails\?/.test(html), "the link opens a page that asks first");
    const { data: still } = await db.from("users").select("email_daily").eq("id", userId).single();
    check(still?.email_daily === true, "and opening it changes nothing");
    const oneClick = await fetch(`${BASE}/api/email/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    const { data: after } = await db.from("users").select("email_daily").eq("id", userId).single();
    check(oneClick.status === 200 && after?.email_daily === false, "one-click from a mail client turns them off", String(oneClick.status));

    await db.from("users").update({ email_daily: true }).eq("id", userId);
    const form = new URLSearchParams({ u: userId, t: unsubscribeToken(userId), confirm: "1" });
    const confirm = await fetch(`${BASE}/api/email/unsubscribe`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      redirect: "manual",
    });
    const { data: final } = await db.from("users").select("email_daily").eq("id", userId).single();
    check(
      confirm.status === 303 && (confirm.headers.get("location") ?? "").includes("/unsubscribe?done=1") && final?.email_daily === false,
      "the page's button turns them off and says so",
      `${confirm.status} ${confirm.headers.get("location")}`,
    );
  } finally {
    await db.auth.admin.deleteUser(userId);
  }
}

async function main() {
  await composing();
  tokens();
  await sending();
  await perPerson();
  console.log(failed ? `\n${failed} failed` : "\nemail: all passed");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
