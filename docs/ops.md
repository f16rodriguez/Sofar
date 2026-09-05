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
  local clock reached eight. By hand: `npm run sofar -- daily --user <id>
  [--dry]`.

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
