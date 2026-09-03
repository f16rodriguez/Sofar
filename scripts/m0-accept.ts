// M0 acceptance test (SPEC §8):
//   1. Insert an answer for user A; verify user B cannot read it (RLS).
//   2. transcribe() returns a real result from the STT provider.
//   3. complete() returns a real result from the Anthropic API.
//
// Run: npm run accept:m0        (or: npx tsx scripts/m0-accept.ts)
// Requires the M0 env vars from .env.example and migration 0001 applied.
// Creates two throwaway auth users and deletes them afterwards.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "../lib/supabase";
import { createAnswer } from "../lib/repo";
import { transcribe } from "../lib/stt";
import { complete } from "../lib/llm";
import { requireEnv } from "../lib/env";

// Load .env.local so `npm run accept:m0` works without exporting anything.
// lib/* read env lazily at call time, so loading here is early enough.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — fall back to the ambient environment.
}

const results: { name: string; pass: boolean; detail: string }[] = [];

function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// 1s 440Hz sine as PCM16 WAV — a real audio payload for the STT smoke test.
// (Content is irrelevant; the test is that the provider round-trips.)
function makeToneWav(seconds = 1, freq = 440, rate = 16000): Uint8Array {
  const samples = seconds * rate;
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 0.3 * 32767);
    buf.writeInt16LE(v, 44 + i * 2);
  }
  return new Uint8Array(buf);
}

async function makeUser(
  admin: SupabaseClient,
  tag: string,
): Promise<{ id: string; client: SupabaseClient }> {
  const email = `m0-${tag}-${Date.now()}@example.com`;
  const password = `m0-accept-${crypto.randomUUID()}`;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) {
    throw new Error(`auth user creation failed: ${createError?.message}`);
  }

  const { error: profileError } = await admin
    .from("users")
    .insert({ id: created.user.id, email });
  if (profileError) {
    throw new Error(`users profile insert failed: ${profileError.message}`);
  }

  const client = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw new Error(`sign-in failed: ${signInError.message}`);

  return { id: created.user.id, client };
}

async function rlsTest(admin: SupabaseClient): Promise<void> {
  const a = await makeUser(admin, "a");
  const b = await makeUser(admin, "b");

  try {
    const { id: answerId } = await createAnswer(a.client, {
      userId: a.id,
      transcript: "rls-canary — visible to A only",
      input: "text",
    });
    record("A can insert and owns an answer", Boolean(answerId));

    const { data: aRead } = await a.client
      .from("answers")
      .select("id")
      .eq("id", answerId);
    record("A can read own answer", (aRead ?? []).length === 1);

    const { data: bRead, error: bError } = await b.client
      .from("answers")
      .select("id, transcript")
      .eq("id", answerId);
    record(
      "B cannot read A's answer",
      !bError && (bRead ?? []).length === 0,
      bError ? `unexpected error: ${bError.code}` : "0 rows returned",
    );

    const { data: bUpdate } = await b.client
      .from("answers")
      .update({ transcript: "hijacked" })
      .eq("id", answerId)
      .select("id");
    record("B cannot update A's answer", (bUpdate ?? []).length === 0);

    const { data: bInsert, error: bInsertError } = await b.client
      .from("answers")
      .insert({ user_id: a.id, transcript: "forged", input: "text" })
      .select("id");
    record(
      "B cannot insert an answer as A",
      Boolean(bInsertError) && (bInsert ?? []).length === 0,
      bInsertError?.code ?? "",
    );
  } finally {
    await admin.auth.admin.deleteUser(a.id);
    await admin.auth.admin.deleteUser(b.id);
  }
}

async function sttTest(): Promise<void> {
  const result = await transcribe(makeToneWav(), "audio/wav");
  record(
    "transcribe() returns a real result",
    typeof result.text === "string" &&
      Array.isArray(result.segments) &&
      result.durationSec > 0,
    `duration=${result.durationSec}s`,
  );
}

async function llmTest(): Promise<void> {
  const text = await complete({
    task: "interviewer",
    prompt: 'Reply with exactly the single word "ready" and nothing else.',
    includePreamble: false, // M0 smoke test only — preamble is required from M1
  });
  record(
    "complete() returns a real result",
    text.trim().length > 0,
    `got ${text.trim().length} chars`,
  );
}

async function main() {
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DEEPGRAM_API_KEY",
  ]) {
    requireEnv(name);
  }

  const admin = serviceClient();

  await rlsTest(admin);
  await sttTest();
  await llmTest();

  const failed = results.filter((r) => !r.pass);
  console.log(
    `\nM0 acceptance: ${results.length - failed.length}/${results.length} checks passed`,
  );
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`M0 acceptance aborted: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
