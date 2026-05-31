#!/usr/bin/env bash
#
# One-command deploy for the Football Pool app (single Cloudflare Worker: SPA + API + D1).
#
# The same script handles the first deploy and every later one — it detects what is already
# set up and only does the missing pieces, so re-running is always safe:
#   * logs in to Cloudflare (interactive, only the first time / when the token expires)
#   * creates the D1 database and records its id in wrangler.toml (first time only)
#   * applies any unapplied schema migrations (never drops data)
#   * builds, checks, and deploys the Worker + static assets
#   * sets SESSION_SECRET (auto-generated) and ADMIN_PASSWORD_HASH (prompted) if missing
#
# Usage:  ./scripts/deploy.sh   (run from anywhere; it cds to the repo root)
#
set -euo pipefail
cd "$(dirname "$0")/.."

DB_NAME="football-pool"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# Ensure Node >= 22 (wrangler requires it). This script runs in its own non-interactive shell,
# which doesn't load nvm, so it can fall back to an older system Node — load nvm and switch if so.
node_ok() {
    local major
    major="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
    [ -n "$major" ] && [ "$major" -ge 22 ] 2>/dev/null
}
if ! node_ok; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck disable=SC1091
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && nvm use 22 >/dev/null 2>&1 || true
fi
if ! node_ok; then
    echo "Error: Node.js >= 22 is required (wrangler needs it); found $(node -v 2>/dev/null || echo 'none')." >&2
    echo "Activate it and re-run, e.g.:  nvm install 22 && nvm use 22 && ./scripts/deploy.sh" >&2
    exit 1
fi

# 1. Cloudflare auth — interactive only the first time; later runs skip it.
#    NOTE: `wrangler whoami` exits 0 even when unauthenticated, so detect auth from its OUTPUT,
#    not its exit code. Match a POSITIVE signal (whoami actually listing the account): a missing
#    token and a *revoked* one fail with different messages, so anything short of a real account
#    listing — "not authenticated", "permission denied", "Failed to … retrieve account IDs" — must
#    trigger a fresh login rather than be assumed authenticated.
#    Use "Account Name" (the account-table header, printed only when an account is actually
#    listed) as the signal — NOT "Account ID", which also appears in the *failure* message
#    "Failed to automatically retrieve account IDs".
step "Checking Cloudflare login"
whoami_out="$(npx wrangler whoami </dev/null 2>&1 || true)"
if printf '%s' "$whoami_out" | grep -qiE 'Account Name'; then
    echo "    already logged in (run 'npx wrangler whoami' to see which account)."
else
    echo "    not logged in or token expired/revoked — a browser window will open for 'wrangler login'…"
    npx wrangler login
fi

# 2. Ensure the D1 database exists and its id is written into wrangler.toml.
step "Ensuring D1 database '$DB_NAME'"
if grep -q 'PLACEHOLDER_SET_AT_DEPLOY' wrangler.toml; then
    # `</dev/null` keeps every wrangler call non-interactive so the one-time "install agent
    # skills?" prompt can't silently block. Create it (tolerating "already exists"), reading the
    # new id straight from the output; fall back to listing the account if it already existed.
    create_out="$(npx wrangler d1 create "$DB_NAME" </dev/null 2>&1 || true)"
    printf '%s\n' "$create_out"
    db_id="$(printf '%s' "$create_out" | grep -oiE '[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}' | head -n1)"
    if [ -z "$db_id" ]; then
        db_id="$(npx wrangler d1 list --json </dev/null 2>/dev/null | node -e '
            let s = "";
            process.stdin.on("data", (d) => (s += d)).on("end", () => {
                try {
                    const row = JSON.parse(s).find((x) => x.name === process.argv[1]);
                    process.stdout.write(row ? (row.uuid || row.database_id || "") : "");
                } catch { /* leave empty → handled below */ }
            });
        ' "$DB_NAME")"
    fi
    if [ -z "$db_id" ]; then
        echo "    Could not auto-detect the database id." >&2
        echo "    Run 'npx wrangler d1 list', copy ${DB_NAME}'s id, replace" >&2
        echo "    PLACEHOLDER_SET_AT_DEPLOY in wrangler.toml, and re-run this script." >&2
        exit 1
    fi
    # Portable in-place edit (works with both GNU and BSD/macOS sed).
    sed -i.bak "s/PLACEHOLDER_SET_AT_DEPLOY/$db_id/" wrangler.toml && rm -f wrangler.toml.bak
    echo "    created; wrote database_id=$db_id into wrangler.toml."
else
    echo "    already configured."
fi

# 3. Apply schema migrations. Idempotent: only unapplied migrations run; existing data is kept.
step "Applying D1 migrations (remote)"
npx wrangler d1 migrations apply "$DB_NAME" --remote </dev/null

# 4. Build + check + deploy the Worker and its static assets. Creates the Worker on first run.
#    Split out of `npm run release` so the deploy's stdin is non-interactive (no skills prompt).
step "Building, checking, and deploying"
npm run check
npx wrangler deploy </dev/null

# 5. Ensure runtime secrets. The Worker must exist first, so this runs after the deploy.
#    `wrangler secret put` updates the live Worker immediately — no extra redeploy needed.
step "Ensuring secrets"
secrets=$(npx wrangler secret list </dev/null 2>/dev/null || echo '[]')
if printf '%s' "$secrets" | grep -q 'SESSION_SECRET'; then
    echo "    SESSION_SECRET already set."
else
    echo "    generating and setting SESSION_SECRET…"
    openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET
fi
if printf '%s' "$secrets" | grep -q 'ADMIN_PASSWORD_HASH'; then
    echo "    ADMIN_PASSWORD_HASH already set."
else
    printf '    Enter a NEW admin password (input hidden): '
    read -r -s admin_pw; echo
    printf '%s' "$admin_pw" | npx tsx scripts/hash-admin-password.ts | npx wrangler secret put ADMIN_PASSWORD_HASH
    unset admin_pw
fi

step "Done — your app is live at the *.workers.dev URL shown above"
