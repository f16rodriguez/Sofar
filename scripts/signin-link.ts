// A working sign-in link, printed here instead of emailed (SPEC §3.1).
//
// The emailed link goes through Supabase's verify endpoint and comes back as
// a PKCE code, which only completes in the same browser that asked for it —
// mail on a phone does not guarantee that browser. This mints the token_hash
// form instead: it carries its own proof, so it works wherever it is opened.
//
// Single use, and it expires the way any magic link does. Treat one as a
// password for that person's book: hand it to them directly, never post it.
//
//   set -a; . ./.env.local; set +a
//   npm run signin-link -- someone@example.com

import { serviceClient } from "../lib/supabase";
import { isInvited } from "../lib/auth";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: signin-link <email>");
    process.exit(1);
  }
  const site = (process.env.SITE_URL ?? "https://sofar-book.netlify.app").replace(/\/+$/, "");

  // The allowlist is what stands between a public URL and the founder's card
  // (lib/auth.ts). A link that skips the sign-in form must not skip that.
  if (!isInvited(email)) {
    console.error(`${email} is not in SOFAR_ALLOWED_EMAILS — add them first.`);
    process.exit(1);
  }

  const db = serviceClient();
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);
  const hash = data.properties?.hashed_token;
  if (!hash) throw new Error("no token in the generated link");

  console.log(`${site}/auth/callback?token_hash=${hash}&type=magiclink`);
}

main().catch((err) => {
  console.error(`signin-link: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
