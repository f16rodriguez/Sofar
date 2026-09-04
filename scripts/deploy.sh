#!/usr/bin/env sh
# Deploy exactly what is committed, nothing else.
#
# The Netlify MCP uploader zips the *working directory* and skips only
# node_modules, .git, .netlify, .env and a few others — it does not read
# .gitignore. Run from the repo it would upload .env.local (every secret),
# .next/ (123 MB of stale build output) and transcripts/ (a person's
# interview — personal data that must never leave this machine, SPEC §7).
# So the upload is a fresh export of HEAD in a throwaway directory.
#
# Usage: scripts/deploy.sh <proxy-url>
# The proxy URL comes from the Netlify MCP "deploy-site" tool and is valid
# for 30 minutes. Uncommitted changes are not deployed — commit first.
set -eu

PROXY="${1:?usage: scripts/deploy.sh <proxy-url from the Netlify deploy-site tool>}"
ROOT="$(git rev-parse --show-toplevel)"
SITE_ID="$(node -p "require('$ROOT/.netlify/state.json').siteId" 2>/dev/null || echo 29263095-f7cb-4636-b53d-4c5f7be13fad)"

if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]; then
  echo "deploy: uncommitted changes — commit first, only HEAD is deployed" >&2
  exit 1
fi

DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT
git -C "$ROOT" archive HEAD | tar -x -C "$DIR"
echo "deploy: $(git -C "$ROOT" rev-parse --short HEAD) → $SITE_ID from $(find "$DIR" -type f | wc -l) committed files"

cd "$DIR"
exec npx -y @netlify/mcp@latest --site-id "$SITE_ID" --proxy-path "$PROXY"
