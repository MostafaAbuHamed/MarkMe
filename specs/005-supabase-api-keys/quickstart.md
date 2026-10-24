# Quickstart: validate the publishable-key switch

Local checks L1–L5 run after US1/US2 merge. Hosted checks H1–H5 are the owner's US3 steps, after
US1, US2 and US4 merge. Rules and messages: see [contracts/](./contracts/).

## Prerequisites

- Node 24 (`source ~/.nvm/nvm.sh && nvm use`), Docker running, `pnpm install` done.
- Local stack up: `pnpm db:start`.

## L1. Fresh config uses the publishable key (US1, SC-001)

```bash
mv apps/extension/.env apps/extension/.env.bak 2>/dev/null; mv apps/preview-api/.env apps/preview-api/.env.bak 2>/dev/null
pnpm dev
```

Expected: `[dev]` reports both `.env` files created. Then (in another shell):

```bash
grep -c '^WXT_SUPABASE_PUBLISHABLE_KEY=sb_publishable_' apps/extension/.env
grep -hv '^#' apps/extension/.env apps/preview-api/.env | grep -cE 'eyJ|sb_secret_|ANON|SERVICE'
```

Expected: `1`, then `0` (comment lines are skipped: `.env.example` names the old variable in one).

## L2. Sign-in and owned data on the publishable key (US1, FR-005)

```bash
eval "$(pnpm exec supabase status -o env --workdir packages/database | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
E="qs-$(date +%s)@example.test"; P='qs-Passw0rd!'
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API_URL/auth/v1/signup" \
  -H "apikey: $PUBLISHABLE_KEY" -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}"
TOKEN=$(curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $PUBLISHABLE_KEY" -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}" | jq -r .access_token)
curl -s -w '\n%{http_code}\n' "$API_URL/rest/v1/folders?select=id" -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $TOKEN"
```

Expected: `200`, then `[]` and `200`. No `Authorization: Bearer <project key>` anywhere.
Cross-user denial: `pnpm db:test` passes (pgTAP two-user RLS suite; role-based, key-independent).

## L3. Missing publishable key stops `pnpm dev` (US1 scenario 3)

Covered by `scripts/dev-env.test.mjs` ("Missing PUBLISHABLE_KEY", no values leaked):

```bash
pnpm exec vitest run --dir scripts
```

## L4. Wrong keys are refused (US2 scenarios 1–3, SC-002)

```bash
pnpm --filter @markme/extension test
```

Manual spot check with an old-style `.env`:

```bash
cp apps/extension/.env apps/extension/.env.good
sed -i 's/^WXT_SUPABASE_PUBLISHABLE_KEY=/WXT_SUPABASE_ANON_KEY=/' apps/extension/.env
pnpm --filter @markme/extension build
mv apps/extension/.env.good apps/extension/.env
```

Expected: the build exits 1 before writing output, with
`WXT_SUPABASE_PUBLISHABLE_KEY: missing` and the `.env.example` hint. The file is not rewritten.

## L5. Bundle check (US2 scenario 4, FR-006)

```bash
pnpm --filter @markme/extension build
node scripts/check-bundle-secrets.mjs
```

Expected: exit 0, `no findings` (confirms `supabase-js`'s bare `"sb_secret_"` is not flagged and
`SERVICE_ROLE` is absent). Then plant each bad value in a copy and expect exit 1:

```bash
D=$(mktemp -d); cp -r apps/extension/.output/chrome-mv3/. "$D"
eval "$(pnpm exec supabase status -o env --workdir packages/database | grep -E '^(ANON_KEY|SECRET_KEY)=')"
echo "const k='$SECRET_KEY'" > "$D/planted-secret.js"
echo "const k='$ANON_KEY'"   > "$D/planted-anon.js"
node scripts/check-bundle-secrets.mjs "$D"; echo "exit $?"
rm -r "$D"
```

Expected: `secret-key in planted-secret.js`, `legacy-jwt-anon in planted-anon.js`, `exit 1`, and
no key text in the output.

## Hosted cutover (US3, owner only)

### H1. Get and check the hosted publishable key

Dashboard → project `markme` → Settings → API Keys → "Publishable and secret API keys". Create
the publishable key if none exists. Do **not** create a secret key. Check its shape:

```bash
read -r HOSTED_PK   # paste
node -e 'process.exit(/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(process.argv[1]) ? 0 : 1)' "$HOSTED_PK" && echo ok
gh variable set WXT_SUPABASE_PUBLISHABLE_KEY --body "$HOSTED_PK"
```

Expected: `ok`. (Public value; M8's release build reads it, FR-010.)

### H2. Hosted check before disabling (baseline)

Sign in to the hosted project with `apikey: $HOSTED_PK` (L2's commands with
`API_URL=https://<ref>.supabase.co` and a confirmed test user), then run M3 quickstart V6 step 3
against the deployed preview API with that token.

Expected: sign-in 200; preview API 401 / 200 / 422 / 200.

### H3. Disable legacy keys

Dashboard → API Keys → Legacy API keys → "Disable JWT-based API keys". Confirm.

### H4. Recheck (SC-004)

Repeat H2. Expected: same results. Then send any request with the old hosted anon key as
`apikey`. Expected: refused (401).

### H5. Record

Note the date and H2/H4 results in `tasks.md` for the US3 task. Rollback if anything fails:
re-enable legacy keys in the same dashboard section, fix, retry H4.

## Docs sweep (US4, SC-003)

```bash
git grep -nIiE 'anon[_ ]?key|anonKey|service[_ ]?role[_ ]?key' -- ':!specs/00[1-4]*' ':!pnpm-lock.yaml' ':!specs/005-supabase-api-keys'
```

Expected: no hits, or only lines that explicitly say "legacy" / "do not use".
