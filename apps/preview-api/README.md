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
| `PORT`                      | `8787`                                                | TCP port (1–65535). Cloud Run sets this in production.  |
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

Use the anon key from `pnpm exec supabase status --workdir packages/database` (field
`ANON_KEY`). Sign up a test user (confirm in Mailpit at `http://127.0.0.1:54324` if needed),
then take `access_token` from the password grant:

```bash
ANON='<ANON_KEY from supabase status>'
EMAIL='you@example.com'
PASSWORD='your-test-password'

curl -s -X POST 'http://127.0.0.1:54321/auth/v1/signup' \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

TOKEN=$(curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
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

The image runs as user `node` and starts `node server.mjs` on `PORT`. Cloud Run sets `PORT=8080`;
without it the server listens on 8787. `/healthz` needs no Supabase, so the placeholder
`SUPABASE_URL` is enough for this check.

## Deploy (Cloud Run)

**Needs GCP.** These steps need a Google Cloud account and were not run when this README was written.

1. Run `bash scripts/setup-gcp.sh` once. The wizard configures the GCP project, Artifact
   Registry, Workload Identity Federation, deploy and runtime service accounts, and sets five
   GitHub repository variables: `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`,
   `PREVIEW_API_RUNTIME_SA`, `PREVIEW_API_SUPABASE_URL`.
2. Deploy when `apps/preview-api/**`, `packages/domain/**`, or `pnpm-lock.yaml` changes on
   `main`, or manually:

   ```bash
   gh workflow run deploy-preview-api.yml
   ```

The workflow builds and pushes the image, deploys `markme-preview-api` in `europe-west1`, and
smoke-tests `/healthz` and an unsigned `POST /v1/preview` (expect `401`). Cloud Run runs the
service as `PREVIEW_API_RUNTIME_SA` (no extra IAM roles) with `SUPABASE_URL` from
`PREVIEW_API_SUPABASE_URL`.

## Security

SSRF controls: DNS resolution with a pinned validated IP per connection hop; `http`/`https` and
ports 80/443 only; every redirect target re-checked; 5 s total deadline, 2 MB body cap, at most
three redirects; a lookup is refused if any resolved address is private, loopback, link-local or
metadata. Image and icon URLs found in page metadata are dropped when their host is `localhost`
(or `*.localhost`) or a blocked IP literal, with no DNS lookup. JWTs
must verify as Supabase ES256 access tokens. IP, per-user, and force-refresh rate limits apply.
Request logs include host only, not full URLs.

Details and rationale: [PRD §7.3](../../docs/PRD.md#73-preview-api-appspreview-api).
