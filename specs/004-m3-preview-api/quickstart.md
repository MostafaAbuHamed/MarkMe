# Quickstart: Validate M3

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

This runbook proves the M3 exit criteria (`docs/PLAN.md` M3). Behaviour and shapes are in the
[contract](contracts/preview-api.md) and the [data model](data-model.md); this file does not
repeat them.

## Prerequisites

- M0 prerequisites: Node 24 via `.nvmrc`, and pnpm through corepack. In non-interactive shells,
  run `source ~/.nvm/nvm.sh && nvm use` first.
- `pnpm install` is done.
- V1–V3 need no `.env`, Docker or network. The tests use local HTTP servers on `127.0.0.1`, a
  scripted resolver and test-signed tokens.
- V4 needs Docker.
- V5 needs `pnpm dev` (local Supabase).
- V6 needs the Vercel setup (V7) once.

## V1. SSRF suites pass (SC-001, SC-002, FR-006–FR-012, FR-028)

```bash
pnpm --filter @markme/preview-api exec vitest run ip-policy safe-fetch
```

Expected:

- Every case passes.
- No `it.fails` or `it.todo` remains: `grep -rE "it\.(fails|todo)" apps/preview-api/test`
  prints nothing.
- Blocked targets end as `blocked_target`, slow targets as `timeout`, and oversized or wrong-type
  bodies as `fetch_failed`.

Gate check (do not commit): in `src/ssrf/ip-policy.ts`, temporarily make `isBlockedAddress` return
`false` for every valid IP (skip both the `range()` check and the CIDR list), then rerun.
`ip-policy.test.ts` must fail. Restore the file. Disabling only one layer is not enough, because
the other still blocks.

## V2. Parsing, oEmbed and endpoint behaviour (SC-003–SC-006)

```bash
pnpm --filter @markme/preview-api test
```

Expected: every suite passes, among them `html-metadata`, `sanitize`, `oembed`, `auth`, `cors`,
`log` and `app`. In particular:

- the `windows-1256` fixture decodes to Arabic text;
- no response body contains `stack` or a file path;
- every 429 has `Retry-After`;
- the captured log lines contain the host but never the path, query or `sub`.

## V3. Repo gate (SC-009)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: everything is green. `pnpm build` writes `apps/preview-api/dist/server.mjs`.

## V4. The built service runs (FR-023, R1)

```bash
PORT=8790 SUPABASE_URL=http://127.0.0.1:54321 node apps/preview-api/dist/server.mjs &
curl -s http://127.0.0.1:8790/healthz            # {"ok":true}
kill %1

docker build -f apps/preview-api/Dockerfile -t markme-preview .
docker run --rm -d -p 8790:8080 -e PORT=8080 -e SUPABASE_URL=http://host.docker.internal:54321 --name mp markme-preview
curl -s http://127.0.0.1:8790/healthz            # {"ok":true}
docker inspect --format '{{.Config.User}}' mp    # node
docker stop mp
```

## V5. Local end to end with a real token (spec Story 3, exit check, local)

With `pnpm dev` running (local Supabase plus the preview API on 8787):

1. Sign up a test user through the Auth API on 54321. Confirm it in Mailpit (54324).
2. Sign in with the password grant and read `access_token` into `TOKEN`.

```bash
API=http://127.0.0.1:8787
curl -s -XPOST $API/v1/preview -H "content-type: application/json" -d '{"url":"https://example.com"}'
# 401 {"error":"unauthorized"}
curl -s -XPOST $API/v1/preview -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"url":"https://example.com"}'
# 200 with title "Example Domain", mediaType "link"
curl -s -XPOST $API/v1/preview -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"url":"http://169.254.169.254/"}'
# 422 {"error":"blocked_target"}
curl -s -XPOST $API/v1/preview -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
# 200 with embed {"provider":"youtube","id":"dQw4w9WgXcQ"}
```

The service's stdout shows one JSON line per request, with `host` and no path.

## V6. Deployed endpoint (SC-007, FR-024, exit check, cloud)

1. In GitHub, go to Actions → **Deploy preview API** → Run workflow, on branch
   `004-m3-preview-api`.
2. The workflow's smoke step passes: `/healthz` returns 200, and an unsigned `POST /v1/preview`
   returns 401.
3. Repeat V5's requests with `API=<PREVIEW_API_URL>`. Use a token from the **hosted** project
   (`SUPABASE_URL` in the deploy env is the hosted URL).

   Expected: 401 / 200 / 422 / 200, as in V5.

4. In the Vercel dashboard, the deployment's function runs in `fra1` (R18).

## V7. One-time cloud setup (FR-026, A51–A52)

Follow "One-time setup" in `apps/preview-api/README.md`: a Vercel account (no card), `vercel link`,
a token, then `gh secret set VERCEL_TOKEN` and the `gh variable set` commands.

Expected afterwards:

- `gh variable list` shows `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `PREVIEW_API_SUPABASE_URL` and
  `PREVIEW_API_URL`.
- `gh secret list` shows `VERCEL_TOKEN` only.
- No Git repository is connected in the Vercel project settings.
