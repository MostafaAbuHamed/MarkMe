# Contract: Preview API

**Spec**: [../spec.md](../spec.md) · **Plan**: [../plan.md](../plan.md) · **Data model**:
[../data-model.md](../data-model.md)

This file covers:

- the HTTP interface the extension (M5) calls;
- the internal seams the tests use;
- the env keys;
- the dependencies, with their reasons;
- the file list.

Types come from `@markme/domain` unless noted.

## HTTP

### `GET /healthz`

Unchanged from M0: `200 { "ok": true }`. It is not authenticated, not rate limited and not logged.

### `POST /v1/preview`

The request runs through these steps in order. The first failure ends the request.

| #   | Step        | Failure                                                                       |
| --- | ----------- | ----------------------------------------------------------------------------- |
| 1   | CORS        | unknown `Origin`: no CORS headers; preflight `403`                            |
| 2   | IP limiter  | over 60/min: `429 rate_limited` + `Retry-After`                               |
| 3   | JSON body   | over 4 KB or not JSON: `400 invalid_url`                                      |
| 4   | Auth        | `401 unauthorized`                                                            |
| 5   | User limit  | over 20/min or 300/day: `429 rate_limited` + `Retry-After`                    |
| 6   | Force limit | `force === true` over 10/hour: `429 rate_limited` + `Retry-After`             |
| 7   | Validate    | `previewRequest` fails (any `httpUrl` code or a bad shape): `400 invalid_url` |
| 8   | Pipeline    | `422 blocked_target`, `502 fetch_failed` or `504 timeout`                     |
| 9   | Response    | `previewResponse.parse`; a failure here is a bug, logged, `502 fetch_failed`  |

**Request headers**

- `Authorization: Bearer <Supabase access token>`
- `Content-Type: application/json`
- `Origin` is optional.

**Request body**

`PreviewRequestInput`, for example `{ "url": "https://example.com/post", "force": true }`.
`force` is optional. Unknown keys are stripped, not rejected (zod default, as in M2).

**200 body**

`PreviewResponse`. Fields without a value are left out, never sent as `null` or `""`:

```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "…",
  "description": "…",
  "imageUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "faviconUrl": "https://www.youtube.com/favicon.ico",
  "siteName": "YouTube",
  "mediaType": "video",
  "provider": "youtube",
  "embed": { "provider": "youtube", "id": "dQw4w9WgXcQ" }
}
```

`url` is the final URL after redirects. A direct image link returns `imageUrl === url` and
`mediaType: "image"`.

**Error body**

`PreviewError`, which is exactly `{ "error": "<code>" }`:

| Code             | Status | When                                                                                                                       |
| ---------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `invalid_url`    | 400    | Body not JSON, over 4 KB, or failing `previewRequest`                                                                      |
| `unauthorized`   | 401    | Missing/bad/expired token, wrong issuer/audience/algorithm, JWKS unreachable                                               |
| `blocked_target` | 422    | A scheme, port or address refused on any hop                                                                               |
| `rate_limited`   | 429    | Any limiter; `Retry-After: <seconds>` is always set                                                                        |
| `fetch_failed`   | 502    | DNS failure, connection error, non-2xx final status, content type missing or not allowed, over 2 MB, more than 3 redirects |
| `timeout`        | 504    | The 5 s total deadline passed                                                                                              |

**Response headers**

- Every response: `RateLimit` / `RateLimit-Policy` (draft-8).
- Allowed origins also get `Access-Control-Allow-Origin` and `Vary: Origin`.
- No `X-Powered-By`.

**Preflight**

`OPTIONS /v1/preview` from an allowed origin returns `204` with:

- `Access-Control-Allow-Methods: POST`
- `Access-Control-Allow-Headers: authorization, content-type`
- `Access-Control-Max-Age: 600`

## Internal seams (`apps/preview-api/src`)

```ts
// app.ts — every option has a production default; tests override them
export interface AppOptions {
  env: PreviewApiEnv;
  jwks?: JWTVerifyGetKey; // default: createRemoteJWKSet(env.SUPABASE_URL)
  safeFetch?: SafeFetch; // default: createSafeFetch({ resolve: dnsResolve, policy: isBlockedAddress })
  log?: (line: LogLine) => void; // default: JSON line to stdout
  now?: () => number; // limiter/cache clock, for tests
}
export function createApp(options: AppOptions): Express;

// ssrf/ip-policy.ts
export function isBlockedAddress(ip: string): boolean; // brackets allowed; not-an-IP → true
export type AddressPolicy = (ip: string) => boolean; // true = blocked

// ssrf/resolve.ts
export type Resolver = (host: string) => Promise<{ address: string; family: 4 | 6 }[]>;
export function createResolveSafe(resolve: Resolver, policy: AddressPolicy): (host: string) => Promise<{ address: string; family: 4 | 6 }>;

// ssrf/safe-fetch.ts
export interface SafeFetchOptions {
  deadlineMs?: number; // 5000
  maxBytes?: number; // 2 * 1024 * 1024
  maxRedirects?: number; // 3
  accept?: string; // request header only
  allowedTypes?: readonly string[]; // ["text/html", "application/xhtml+xml", "image/*"]
}
export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string; // media type only, lower-case, no parameters
  charset: string | undefined;
  body: Uint8Array; // empty for image/*: never read (A39)
}
export type SafeFetch = (url: string, options?: SafeFetchOptions) => Promise<SafeFetchResult>;
export function createSafeFetch(deps: {
  resolve: Resolver;
  policy: AddressPolicy;
  ports?: readonly string[]; // default ["", "80", "443"]; tests only (R6)
  onConnect?: (address: string) => void; // test spy for the pinned address
}): SafeFetch;

// errors.ts
export class PreviewFailure extends Error {
  constructor(readonly code: "blocked_target" | "fetch_failed" | "timeout");
}

// parse/html-metadata.ts
export function parseHtmlMetadata(body: Uint8Array, charset: string | undefined, finalUrl: string): PageMetadata;

// parse/sanitize.ts
export function sanitizeText(value: string | undefined, max: number): string | undefined;

// oembed/index.ts
export interface OEmbedAdapter {
  match(url: URL): boolean;
  fetch(url: URL, safeFetch: SafeFetch): Promise<OEmbedResult | null>; // null → HTML path
}
export function createAdapters(env: PreviewApiEnv): readonly OEmbedAdapter[];

// pipeline.ts
export function createPipeline(deps: { safeFetch: SafeFetch; adapters: readonly OEmbedAdapter[]; cache: PreviewCache }):
  (request: PreviewRequest) => Promise<{ preview: PreviewResponse; cacheHit: boolean }>;
```

`PageMetadata`, `OEmbedResult`, `PreviewCache` and `LogLine` are defined in the
[data model](../data-model.md).

## Env (`src/env.ts`, validated by `parseEnv`)

| Key                         | Type / default                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `PORT`                      | int 1–65535, default 8787 (unchanged)                                                |
| `SUPABASE_URL`              | http(s) URL (unchanged); JWKS URL + issuer                                           |
| `CORS_ORIGINS`              | comma list of origins, default `chrome-extension://dapmmcamlgmaopfaicfjifakodajigha` |
| `RATE_LIMIT_IP_PER_MIN`     | positive int, default 60                                                             |
| `RATE_LIMIT_USER_PER_MIN`   | positive int, default 20                                                             |
| `RATE_LIMIT_USER_PER_DAY`   | positive int, default 300                                                            |
| `RATE_LIMIT_FORCE_PER_HOUR` | positive int, default 10                                                             |
| `META_OEMBED_TOKEN`         | optional non-empty string; unset in v1                                               |

There is no key for the address policy, the resolver or any "allow" switch (FR-029).
`.env.example` lists every key, with the defaults commented out. `scripts/dev-env.mjs` keeps
filling `SUPABASE_URL` only.

## Dependencies

| Package              | Version | Kind    | Reason                                                                        |
| -------------------- | ------- | ------- | ----------------------------------------------------------------------------- |
| `jose`               | 6.2.12  | runtime | JWKS fetch + cache and ES256 `jwtVerify` (A37, R7)                            |
| `ipaddr.js`          | 2.5.0   | runtime | Correct IPv4/IPv6 parsing and range classes, including mapped forms (R5)      |
| `undici`             | 8.11.2  | runtime | `Agent` with a pinned `connect.lookup`, plus its matching `fetch` (R3)        |
| `cheerio`            | 1.2.0   | runtime | HTML parsing and text extraction for metadata and sanitizing (R9, R10)        |
| `lru-cache`          | 11.5.3  | runtime | Bounded 24 h preview cache (R11)                                              |
| `express-rate-limit` | 8.7.1   | runtime | IP, user and force limiters with standard headers (R8)                        |
| `esbuild`            | 0.28.2  | dev     | Bundles the service and the workspace TS packages into one runnable file (R1) |

All are pinned exactly (R2). No `cors` package (R13). No logging library (R14).

## Files

```text
apps/preview-api/
├── Dockerfile                     # T8: builder + runtime, USER node, HEALTHCHECK
├── .dockerignore                  # T8 (at repo root if the context is the root)
├── package.json                   # build = esbuild bundle; new deps
├── .env.example                   # new keys
├── README.md                      # T9: local run, env, deploy, wizard
├── src/
│   ├── server.ts                  # wires env + production defaults
│   ├── app.ts                     # middleware order, error mapper
│   ├── env.ts                     # new keys
│   ├── errors.ts                  # PreviewFailure + code → status map
│   ├── auth.ts                    # T1
│   ├── cors.ts                    # T1
│   ├── log.ts                     # T1
│   ├── ratelimit.ts               # T7
│   ├── cache.ts                   # T6
│   ├── pipeline.ts                # T6
│   ├── ssrf/ip-policy.ts          # T2
│   ├── ssrf/resolve.ts            # T3
│   ├── ssrf/safe-fetch.ts         # T2 stub, T3 implementation
│   ├── parse/html-metadata.ts     # T4
│   ├── parse/sanitize.ts          # T4
│   └── oembed/{index,youtube,x,instagram}.ts   # T5
└── test/
    ├── helpers/{servers,tokens,resolver}.ts    # local http targets, ES256 signer, scripted DNS
    ├── fixtures/*.html            # T4 parser fixtures (incl. a windows-1256 page)
    ├── env.test.ts, healthz.test.ts            # existing (env extended)
    ├── auth.test.ts, cors.test.ts, log.test.ts # T1
    ├── ip-policy.test.ts          # T2
    ├── safe-fetch.{scheme-port,dns,redirect,limits,headers}.test.ts   # T2 (it.fails) → T3
    ├── html-metadata.test.ts, sanitize.test.ts # T4
    ├── oembed.test.ts             # T5 (fake SafeFetch with canned provider JSON)
    └── app.test.ts                # T6, T7
.github/workflows/ci.yml           # T8: + preview-api-image job
.github/workflows/deploy-preview-api.yml        # T9
apps/preview-api/src/vercel.ts     # T021 Vercel entry
apps/preview-api/scripts/vercel-output.mjs   # T021 .vercel/output writer
scripts/archive/setup-gcp.sh       # retired T9 wizard (Cloud Run dropped, R18)
docs/IMPLEMENTATION_PLAN.md        # plan deviations copied back in v1.9 (done in /speckit-plan)
CLAUDE.md                          # current-state paragraph for M3 (close-out)
```
