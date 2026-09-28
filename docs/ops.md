# Operations

How Sofar is deployed and checked. Written the night of 2026-09-03/04, when
most of this was learned the hard way.

## Deploy

- Netlify site `sofar-book` (id `29263095-f7cb-4636-b53d-4c5f7be13fad`),
  Node 22, upload deploys through the Netlify MCP integration.
- **Always deploy with `scripts/deploy.sh <proxy-url>`.** The uploader zips
  the working directory and ignores only `node_modules`, `.git`, `.netlify`
  and `.env` — not `.gitignore`. Deploying from the repo directly would ship
  `.env.local`, `.next/` and `transcripts/` (personal data). The script
  exports HEAD to a throwaway directory and uploads that. Commit first; only
  HEAD is deployed.
- `netlify.toml` must keep `publish = ".next"`: the Next runtime refuses a
  publish directory equal to the base directory, and every early deploy
  failed on exactly that.
- After every deploy: `curl https://sofar-book.netlify.app/api/health`. It
  reports env presence (booleans) and whether the prompt files made it into
  the function bundle. 200 = fine, 503 = something is missing, read the body.

## Environment variables (Netlify → Site configuration → Environment variables)

| Key | Secret | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | safe: RLS stands behind it |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | server only |
| `ANTHROPIC_API_KEY` | yes | |
| `DEEPGRAM_API_KEY` | yes | |
| `SOFAR_ALLOWED_EMAILS` | no | invite list, comma-separated; unset = nobody |
| `SITE_URL` | no | `https://sofar-book.netlify.app`; redirects and the magic-link return address are built from it |
| `RESEND_API_KEY` | yes | morning emails; unset = none sent, nothing fails |
| `SOFAR_EMAIL_FROM` | no | e.g. `Sofar <morning@yourdomain.com>` — must be on a domain verified in Resend |
| `SOFAR_EMAIL_SECRET` | yes | optional; signs unsubscribe links. Falls back to the service role key |

Secrets must be set with **all scopes** (or at least builds + functions) and
**all contexts**. On 2026-09-04 the health endpoint showed
`SUPABASE_SERVICE_ROLE_KEY` and `DEEPGRAM_API_KEY` absent at runtime while
`ANTHROPIC_API_KEY` was present — the two were never stored on the site
despite the upserts reporting success. Set them in the UI, then redeploy
(env changes reach functions on the next deploy).

## Functions

- `___netlify-server-handler` — the Next app. Everything under `app/`.
- `export-pdf` (`netlify/functions/export-pdf.mts`, served at
  `/api/export-pdf`) — the PDF renderer, deliberately its own process.
  Bundled into the Next handler, react-pdf crashed the server seconds after
  every cold start (a third of requests 502, HTML truncated). `GET
  /api/export` checks the session and forwards to it. `?debug=1` returns the
  function's own diagnostics.
- `jobs-daily` — 05:00 UTC: audio past sixty days, pending account
  deletions. By hand: `npm run jobs -- retention|deletions|all [--dry]`.
- `daily-question` — hourly: writes the day's question for everyone whose
  local clock reached eight, and emails it when email is set up. Skips
  anyone still in their first interview, and anyone who left the last three
  unanswered (they are asked again when they come back to Today). By hand:
  `npm run sofar -- daily --user <id> [--dry]`.

Nothing under `app/` may import `lib/export/` — see the crash above.

## Checks

| Command | What it proves | Cost |
|---|---|---|
| `npm run typecheck` · `npm run build` | compiles | – |
| `npm run audit:logs` | no `console.*` outside `lib/log.ts`; no transcript, audio or prose field in a log call | – |
| `npm run accept:m0` | infrastructure | – |
| `npm run accept:m3` | contradiction → one proposal → decline changes nothing | ~$0.03 |
| `npm run accept:m6` | delete leaves zero rows and objects; 60-day audio deletion | – |
| `npm run test:export` | PDF end to end (`SOFAR_BASE_URL=https://sofar-book.netlify.app` for live) | – |
| `npm run test:machine` | interview state machine | – |
| `npm run test:auth` | a real magic link → session → a screen opens; spent and forged links refused | – |
| `npm run smoke` | every screen and endpoint, signed in and out, against a live deploy | – |
| `npm run test:meta` | the interview filter refuses meta-talk and keeps real material | – |
| `npm run test:session` | an interrupted interview resumes; only one is ever open | – |
| `npm run make-icons` | redraws the app icons from scratch (deterministic) | – |
| `npm run test:minutes` | the minute meter, the cap, top-ups, the monthly reset | – |
| `npm run test:daily` | the daily question's rules: no returning to a subject within two weeks, the quiet pause | – |
| `npm run test:email` | the morning email and its unsubscribe; nothing is really sent | – |
| `npm run test:render` | book typography and the revision diff | – |
| `npm run sofar -- process` | reads closed sessions into the book | extraction ~$0.05, a chapter ~$0.10 |

Live checks take `SOFAR_BASE_URL=https://sofar-book.netlify.app`. Run
`test:auth` and `smoke` after every deploy — a green `/api/health` says the
server booted, not that a person can sign in.

## Handing someone a sign-in link

`npm run signin-link -- someone@example.com` prints a link that works on any
device. The emailed link goes through Supabase's verify endpoint and comes
back as a PKCE code, which only completes in the browser that requested it —
mail on a phone does not guarantee that browser. To fix the emailed ones,
Supabase → Authentication → Email Templates → Magic Link:

    <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink">Log in</a>

## Email: sign-in links and the morning question

**Until this is done, nobody but members of the Supabase team can sign in.**
Supabase's built-in sender refuses any address outside the project's team
("Email address not authorized") and is capped at a few messages an hour.
One domain and one Resend account fix both sign-in and the morning email:

1. Buy a domain (any registrar, ~$12/yr). The netlify.app address cannot be
   verified for sending.
2. Resend → Domains → add it, then add the DNS records it lists (SPF, DKIM).
   Free tier: 3,000 emails a month, 100 a day — about 100 daily users.
3. Resend → API keys → create one with sending access.
4. Supabase → Authentication → SMTP Settings → enable custom SMTP:
   host `smtp.resend.com`, port `465`, user `resend`, password = the API key,
   sender e.g. `signin@yourdomain.com`. Then raise Authentication → Rate
   Limits → emails per hour from 30.
5. Netlify env: `RESEND_API_KEY`, `SOFAR_EMAIL_FROM`
   (`Sofar <morning@yourdomain.com>`); redeploy.

Separate From addresses for sign-in and the morning question keep one
reputation from dragging down the other.

## Processing sessions

A finished session sits at `status = processing` until something reads it.
`npm run sofar -- process` does that by hand: extraction and merge, a chapter
once five answers have accumulated since the last one, and a revision where
new material contradicts canon. `--session <id>` for one, `--no-chapters` to
skip the expensive half.

`netlify/functions/process-sessions.mts` does the same every fifteen minutes,
but **only when `SOFAR_PROCESS_SESSIONS=on`**. It is off deliberately: this is
the one job that spends money without anyone asking, and it should not be
switched on until someone wants the bill.

## Housekeeping

`npm run cleanup:threads -- --user <id>` reports interview talk and duplicate
threads in a record, and only acts with `--apply`. Retiring is reversible: a
thread is marked resolved, never deleted.

Every paid run prints `RUN COST` (D5). The meter charges a reply the SDK
could not parse, so a failed run never reports $0.

## Supabase

- Project `onfxavpzvdazocvandeh`, org "Sofar only". Migrations in
  `supabase/migrations`, applied through the MCP; never edit an applied one.
- Auth: magic links only. Redirect URLs must include
  `https://sofar-book.netlify.app/auth/callback`.
- The founder's user id is `11111111-1111-4111-8111-111111111111`. It was
  hand-inserted during M1 and repaired into a real auth user on 2026-09-04.

## Security posture

Reviewed 2026-09-06, before any tester had access.

- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, set the same way in
  all three places it is written (`lib/cookies.ts`). Nothing in the browser
  reads it; every Supabase call happens on the server.
- Headers on every response: `frame-ancestors 'none'` + `X-Frame-Options:
  DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` granting only the microphone, `nosniff`, and
  `no-store` on `/api/*`.
- Every route takes identity from the session; none accepts a user id from a
  client. Storage paths are built from the session user and a session already
  verified to belong to them.
- No service-role, Anthropic or Deepgram key appears in built output.

Known and accepted, not defects:

- **No full CSP.** An over-tight policy that breaks the recorder is worse
  than none. Worth adding with care once the script surface stops moving.
- **Session lifetime is 400 days** (Supabase's default). Long for a private
  book; shortening it trades safety against a daily habit, so it is a product
  decision rather than a fix.
- **Prompt injection.** A person can write instructions into their own
  transcript. The blast radius is their own book, and the citation, naming and
  entailment gates all still apply, so it degrades their prose rather than
  crossing to anyone else.
