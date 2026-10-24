# Preview API

Express service that fetches link previews for the extension. It is the only component that
requests arbitrary URLs. Locally it listens on port 8787 when started via `pnpm dev`.

## `POST /v1/preview`

Authenticated clients send a JSON body `{ "url": "<http(s) url>", "force": <optional bool> }`
with `Authorization: Bearer <Supabase access token>`. The handler validates the token (ES256
against Supabase JWKS), applies rate limits, runs the preview pipeline (cache, oEmbed, safe
fetch, parse), and returns normalized metadata or a single error code.

`GET /healthz` returns `200 {"ok":true}` with no auth and no logging.

Full request flow, response shape, and CORS behavior:
[preview API contract](../../specs/004-m3-preview-api/contracts/preview-api.md).

| Error code       | HTTP | When (summary)                                            |
| ---------------- | ---- | --------------------------------------------------------- |
| `invalid_url`    | 400  | Bad JSON, body over 4 KB, or URL fails domain validation  |
| `unauthorized`   | 401  | Missing, invalid, or expired JWT                          |
| `blocked_target` | 422  | Scheme, port, or address blocked on any hop               |
| `rate_limited`   | 429  | IP, user, or force-refresh limit; includes `Retry-After`  |
| `fetch_failed`   | 502  | Network, HTTP status, content type, size, or redirect cap |
| `timeout`        | 504  | Total fetch deadline (5 s) exceeded                       |

## Environment

Validated in `src/env.ts` via `parseEnv`. Copy `.env.example` to `.env` or let `pnpm dev` create
it from Supabase status.

| Key                         | Default                                               | Meaning                                                 |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| `PORT`                      | `8787`                                                | TCP port (1–65535). Docker sets it; Vercel ignores it.  |
| `SUPABASE_URL`              | _(required)_                                          | Supabase API URL; JWKS and JWT issuer.                  |
| `CORS_ORIGINS`              | `chrome-extension://dapmmcamlgmaopfaicfjifakodajigha` | Comma-separated browser origins allowed for CORS.       |
| `RATE_LIMIT_IP_PER_MIN`     | `60`                                                  | Max preview requests per client IP per minute.          |
| `RATE_LIMIT_USER_PER_MIN`   | `20`                                                  | Max preview requests per authenticated user per minute. |
| `RATE_LIMIT_USER_PER_DAY`   | `300`                                                 | Max preview requests per authenticated user per day.    |
| `RATE_LIMIT_FORCE_PER_HOUR` | `10`                                                  | Max `force: true` preview requests per user per hour.   |
| `META_OEMBED_TOKEN`         | _(unset)_                                             | Optional Meta oEmbed access token when set (non-empty). |

## Local development

From the repo root, with local Supabase running (`pnpm db:start`):

```bash
pnpm dev
```

The preview API serves `http://127.0.0.1:8787` (see the `[dev]` summary).

### Get a local access token

Use `PUBLISHABLE_KEY` from `pnpm exec supabase status --workdir packages/database`. Sign up a
test user (confirm in Mailpit at `http://127.0.0.1:54324` if needed), then take `access_token`
from the password grant. Send the publishable key only in the `apikey` header; put only the user's
access token in `Authorization: Bearer`, never a project key.

```bash
PUBLISHABLE_KEY='<PUBLISHABLE_KEY from supabase status>'
EMAIL='you@example.com'
PASSWORD='your-test-password'

curl -s -X POST 'http://127.0.0.1:54321/auth/v1/signup' \
  -H "apikey: $PUBLISHABLE_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

TOKEN=$(curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: $PUBLISHABLE_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq -r .access_token)
```

### Call the preview endpoint

```bash
API=http://127.0.0.1:8787

curl -s -XPOST $API/v1/preview -H "content-type: application/json" -d '{"url":"https://example.com"}'
# {"error":"unauthorized"}

curl -s -XPOST $API/v1/preview -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"url":"https://example.com"}'
# 200 with title "Example Domain", mediaType "link"

curl -s -XPOST $API/v1/preview -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"url":"http://169.254.169.254/"}'
# {"error":"blocked_target"}

curl -s -XPOST $API/v1/preview -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
# 200 with embed {"provider":"youtube","id":"dQw4w9WgXcQ"}
```

Each handled request logs one JSON line to stdout with `host` (no URL path).

## Build and run the bundle

esbuild produces a single runnable file:

```bash
pnpm --filter @markme/preview-api build
PORT=8790 SUPABASE_URL=http://127.0.0.1:54321 node apps/preview-api/dist/server.mjs
```

Health check (separate shell):

```bash
curl -s http://127.0.0.1:8790/healthz
```

## Docker

Build context is the repo root:

```bash
docker build -f apps/preview-api/Dockerfile -t markme-preview .
docker run --rm -d -p 8790:8080 -e PORT=8080 -e SUPABASE_URL=http://127.0.0.1:54321 --name mp markme-preview
curl -s http://127.0.0.1:8790/healthz
docker inspect --format '{{.Config.User}}' mp
docker stop mp
```

The image runs as user `node` and starts `node server.mjs` on `PORT` (8787 when unset). Production
runs on Vercel, not this image; the image keeps the service portable to any container host. `/healthz` needs no Supabase, so the placeholder
`SUPABASE_URL` is enough for this check.

## Deploy (Vercel)

Production runs as one Vercel Function on the free Hobby plan, region `fra1` (Frankfurt, next to
Supabase). CI ships the esbuild bundle as a prebuilt function, so Vercel never builds from source:

```bash
pnpm --filter @markme/preview-api build      # dist/server.mjs and dist/vercel/index.mjs
SUPABASE_URL=https://<ref>.supabase.co node apps/preview-api/scripts/vercel-output.mjs
```

`vercel-output.mjs` writes `apps/preview-api/.vercel/output` (git-ignored): `index.func` with
`nodejs24.x`, `regions: ["fra1"]`, `maxDuration: 30` and `SUPABASE_URL` (plus `CORS_ORIGINS` when
set), and a route that sends every path to it.

Hobby is for personal, non-commercial use. MarkMe will not pay Vercel anything: there is no plan to
upgrade to a paid Vercel plan. Before MarkMe ships a paid feature, the service moves to another
host that allows commercial use (constitution; IMPLEMENTATION_PLAN A54).

### One-time setup

**Not run yet.** These steps need a Vercel account (free, no card).

1. Sign up at [vercel.com](https://vercel.com/signup) with GitHub. Do **not** import the repo as a
   Git project: Git builds would try to build from source and fail.
2. From `apps/preview-api`, create and link the project:

   ```bash
   npx vercel@63.1.2 login
   npx vercel@63.1.2 link --yes --project markme-preview-api
   ```

   This creates the project if it does not exist. `.vercel/project.json` (git-ignored) now holds
   `orgId` and `projectId`.

3. Create a token at [vercel.com/account/settings/tokens](https://vercel.com/account/settings/tokens)
   (scope: your account; set an expiry).
4. Store it as the only GitHub secret, then set the repository variables:

   ```bash
   gh secret set VERCEL_TOKEN
   gh variable set VERCEL_ORG_ID --body '<orgId>'
   gh variable set VERCEL_PROJECT_ID --body '<projectId>'
   gh variable set PREVIEW_API_SUPABASE_URL --body 'https://<ref>.supabase.co'
   gh variable set PREVIEW_API_URL --body 'https://<production domain>'
   ```

   The production domain is on the project's **Domains** page (usually
   `markme-preview-api.vercel.app`). Optional: `PREVIEW_API_CORS_ORIGINS`.

### Deploys

The workflow runs when `apps/preview-api/**`, `packages/domain/**`, or `pnpm-lock.yaml` changes on
`main`, or manually from `main` or a `NNN-*` milestone branch:

```bash
gh workflow run deploy-preview-api.yml --ref <branch>
```

It builds, writes `.vercel/output`, runs `vercel deploy --prebuilt --prod`, then smoke-tests
`PREVIEW_API_URL`: `/healthz` returns `200` and an unsigned `POST /v1/preview` returns `401`. The
smoke test uses the production domain because per-deployment URLs sit behind Vercel
Authentication.

Behavior on Vercel: the cache and rate limits live in each instance's memory, and Vercel may run
more than one instance, so limits are per instance (A53). `trust proxy` stays `1`: Vercel
overwrites `X-Forwarded-For` with the client IP.

## Security

SSRF controls: DNS resolution with a pinned validated IP per connection hop; `http`/`https` and
ports 80/443 only; every redirect target re-checked; 5 s total deadline, 2 MB body cap, at most
three redirects; a lookup is refused if any resolved address is private, loopback, link-local or
metadata. Image and icon URLs found in page metadata are dropped when their host is `localhost`
(or `*.localhost`) or a blocked IP literal, with no DNS lookup. JWTs
must verify as Supabase ES256 access tokens. IP, per-user, and force-refresh rate limits apply.
Request logs include host only, not full URLs.

Details and rationale: [PRD §7.3](../../docs/PRD.md#73-preview-api-appspreview-api).
