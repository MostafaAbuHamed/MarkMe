# Research: M3 Preview API

**Date**: 2026-10-23 · **Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Inputs:

- `docs/IMPLEMENTATION_PLAN.md` §3 M3 and §4. All the relevant decisions (A6, A19, A26, A37–A50)
  are approved.
- The spec.
- Checks run on 2026-10-23: a Node 24.22.0 build of the current `apps/preview-api`, an esbuild
  bundle probe, `ipaddr.js` 2.5.0 range probes, WHATWG `URL` probes, `TextDecoder` probes, and the
  npm registry (versions, publish dates, engines).

The design review settled every product decision, so the Technical Context had no NEEDS
CLARIFICATION. Each item below either confirms a platform fact the design relies on or settles a
detail the design left open.

R1, R2, R5, R12, R13 and R16 differ from the implementation plan. They are copied back into it in
this change (v1.9), as its change rule requires.

---

## R1. A `tsc` build cannot run; bundle with esbuild into one file (difference)

- **Finding**:
  - `pnpm --filter @markme/preview-api build` followed by `node dist/server.js` fails today with
    `ERR_MODULE_NOT_FOUND .../packages/domain/src/env/parse-env`.
  - The cause: `@markme/domain` exports TypeScript source (`"." : "./src/index.ts"`) with
    extensionless relative imports. Node cannot run that.
  - The same failure would hit the Docker runtime stage. Node's type stripping does not help:
    it refuses files under `node_modules` and needs explicit extensions.
  - `tsx` (dev) and Vitest (tests) work because they transpile on the fly.
  - Probe: `esbuild src/server.ts --bundle --platform=node --target=node24 --format=esm` with a
    `createRequire` banner gives one 1.9 MB `server.mjs`. It serves `/healthz` correctly, and
    contains no `supabase` code (the rules entry does not load the client, M2 A31).
- **Decision**:
  - `build` = esbuild bundles `src/server.ts` and everything it imports (workspace packages and
    npm dependencies) into `dist/server.mjs`. The banner is
    `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);`
    so bundled CommonJS dependencies (Express) can `require` Node built-ins.
  - `tsc --noEmit` stays the type check, and `tsconfig.build.json` is removed.
  - The Docker runtime stage copies only `dist/server.mjs`: no `node_modules`, no `pnpm deploy`.
  - esbuild 0.28.2 is already in the lockfile (through tsx/Vite) and allowlisted in
    `pnpm-workspace.yaml`. It becomes a direct, exact-pinned dev dependency.
- **Rationale**:
  - One file is the smallest image and the simplest Dockerfile.
  - The image cannot pick up an unbundled TypeScript import.
  - `pnpm deploy` would also copy `@markme/domain`'s `@supabase/supabase-js` into a service that
    never loads it.
- **Alternatives considered**:
  - `tsc` alone: does not run, as shown above.
  - `tsup` 9.0.0: published 2026-10-14, under the two-week age rule (R2), and only a wrapper over
    esbuild.
  - Building `@markme/domain` to JS with its own `dist`: a package-level change outside M3, and
    every consumer would need a build step.
  - `pnpm deploy --prod` + Node type stripping: blocked inside `node_modules`.
- **Check in M3-T8**: CI runs the built image and calls `/healthz`. The exit check calls
  `/v1/preview` on the image, which proves cheerio and undici work when bundled.

## R2. Dependency versions: exact pins, each published at least 14 days ago

- **Finding** (npm registry, 2026-10-23):

  | Package              | Pinned | Published  | Engines        | Newer, skipped                |
  | -------------------- | ------ | ---------- | -------------- | ----------------------------- |
  | `jose`               | 6.2.12 | 2026-09-05 | —              | 6.2.13 (2026-10-20)           |
  | `ipaddr.js`          | 2.5.0  | 2026-08-04 | `>=10`         | —                             |
  | `undici`             | 8.11.2 | 2026-09-24 | `>=22.19.0`    | 8.12.0–8.12.3 (2026-10-14–19) |
  | `cheerio`            | 1.2.0  | 2026-01-23 | `>=20.18.1`    | —                             |
  | `lru-cache`          | 11.5.3 | 2026-09-18 | `20 \|\| >=22` | —                             |
  | `express-rate-limit` | 8.7.1  | 2026-10-06 | `>=16`         | — (peer `express >= 4.11`)    |
  | `esbuild` (dev)      | 0.28.2 | 2026-08-08 | `>=18`         | — (already in the lockfile)   |

- **Decision**:
  - Pin these runtime dependencies exactly, not with `^`. They sit on the SSRF and auth path, so
    an unreviewed minor version must not arrive through a fresh lockfile.
  - Dev dependencies stay exact, as in the rest of the repo.
  - Renovate-style bumps are out of scope until M8.
- **Rationale**: A two-week age gives time for a compromised or broken release to be found and
  yanked. All the engine ranges allow Node 24.
- **Alternatives considered**: `^` ranges like `express` (they would float the security path);
  the newest versions (some are a few days old).

## R3. Fetch with `undici`'s own `fetch` and one pinned `Agent` per hop

- **Finding**:
  - Node 24's global `fetch` is an internal copy of undici whose version differs from npm
    `undici` 8.x. Passing an npm `Agent` as `dispatcher` to the global `fetch` mixes two
    implementations.
  - Node's `net.connect` calls a custom `lookup` with `{ all: true }` when it auto-selects the
    address family, and then expects an array of `{ address, family }`.
  - `fetch` with `redirect: "manual"` in undici returns the real 3xx response, with `Location`
    readable (unlike a browser's opaque redirect).
  - undici `fetch` decodes `gzip`, `deflate` and `br` itself, so `response.body` yields
    **decompressed** bytes.
- **Decision**:
  - `import { Agent, fetch } from "undici"`. Both come from the same package.
  - For each hop, `new Agent({ connect: { lookup } })`, where `lookup` ignores the host and returns
    the one validated address (as an array when `options.all` is set). The agent is closed after
    the hop.
  - TLS server name and the `Host` header still come from the URL's hostname, so certificate
    checks are unchanged.
  - The byte counter reads `response.body` (decompressed), which meets A45 without our own
    decompression.
  - The `Accept-Encoding` header is left to undici.
- **Rationale**:
  - One implementation.
  - Pinning through `lookup` is the documented seam. It holds for every connection the agent
    opens, so a second DNS answer cannot be used (FR-008).
- **Alternatives considered**:
  - The global `fetch` with an npm `Agent`: two undici versions.
  - `undici.request`: no automatic decompression, so we would need our own zip-bomb-safe inflate.
  - Rewriting the URL to the IP: breaks SNI and certificate checks.

## R4. One deadline for the whole fetch

- **Decision**:
  - `const signal = AbortSignal.timeout(5000)` is created once, before hop 0, and passed to every
    hop's `fetch` and to the body reader.
  - Every error is classified by checking the **shared signal**, not the thrown error. undici may
    throw `AbortError`, `UND_ERR_ABORTED` or a wrapped `TypeError` depending on timing.
  - `signal.aborted && signal.reason?.name === "TimeoutError"` → `timeout` (504).
  - Any other network error → `fetch_failed` (502).
  - A policy refusal → `blocked_target` (422), thrown by our own code before any connection.
  - Tests cover both branches: a timeout during headers and during the body, and a connection
    reset before the deadline.
  - A 2xx response without `Content-Type` fails the allowlist → `fetch_failed` (plan debate).
- **Rationale**: FR-010 sets 5 s as the total. A per-hop timer would allow 4 × 5 s.
- **Alternatives considered**: undici `headersTimeout`/`bodyTimeout` (per hop and per phase, not a
  total).

## R5. Address policy: everything that is not `unicast` is blocked (difference)

- **Finding** (`ipaddr.js` 2.5.0):
  - `parse(x).range()` reports `loopback`, `private`, `carrierGradeNat`, `linkLocal`
    (incl. `169.254.169.254`), `reserved` (`192.0.0/24`, `192.0.2/24`, `198.18/15`,
    `198.51.100/24`, `203.0.113/24`, `240/4`, `2001:db8::/32`), `multicast`, `broadcast`,
    `unspecified`, `uniqueLocal` (`fd00:ec2::254`), `rfc6052` (`64:ff9b::/96` **and**
    `64:ff9b:1::/48`), `6to4`, `teredo` and `ipv4Mapped`.
  - `8.8.8.8` and `2606:4700::1111` are `unicast`.
  - `ipaddr.process("::ffff:127.0.0.1")` returns the IPv4 `127.0.0.1` (`loopback`).
  - WHATWG `URL` already rewrites `2130706433`, `0177.0.0.1` and `0x7f.1` to `127.0.0.1`, and
    keeps IPv6 hosts in brackets (`[::ffff:7f00:1]`).
- **Decision**:
  - `isBlockedAddress(ip)`: strip any brackets, then run `ipaddr.process`. Blocked when `range()`
    is not `unicast`, or when the address falls in the explicit CIDR list in the implementation
    plan. That list stays as defense in depth, in case a library version renames a range.
  - NAT64, 6to4 and Teredo are blocked **outright**, even when the embedded IPv4 is public.
    `ipaddr.js` never reports them as `unicast`, so no embedded-address extraction is needed.
    This is stricter than "check the embedded v4". It costs nothing, because Cloud Run egress is
    IPv4-only (A41).
  - The policy reads `new URL(...).hostname`, never the raw input, so the encoded IPv4 forms are
    caught by the same check.
- **Rationale**: One rule ("only public unicast"), with an explicit list as a second check. Less
  code than embedded-address extraction, with the same or stronger blocking.
- **Alternatives considered**: Extracting and re-checking embedded IPv4 for NAT64/6to4 (more code;
  it only allows addresses nobody needs); a hand-written CIDR table alone (easy to get wrong for
  IPv6).

## R6. Resolver and policy are injected; "allow all" exists only in tests

- **Decision**:
  - `createSafeFetch({ resolve, policy, ... })`. Production builds it with
    `dns.promises.lookup(host, { all: true, verbatim: true })` and `isBlockedAddress`.
  - Tests inject a resolver (scripted answers, for rebinding and mixed answers). Suites that
    need a live target also inject `allowAll` plus `ports` holding the test server's port. Local
    servers listen on `127.0.0.1` with a random port, which the default port rule (80/443 only)
    would refuse.
  - `onConnect` is a spy that reports the pinned address, which the rebinding case asserts.
  - The `scheme-port` suite and the production-policy cases always use the default `ports` and
    `isBlockedAddress`. Neither seam is reachable from env or `server.ts`.
  - `createApp` takes the same options. `server.ts` never reads a policy from env.
  - The production policy has its own suite, which asserts that loopback is blocked (FR-029).
- **Rationale**: The SSRF suites must reach local servers without weakening production. The seam
  is constructor injection, so a misconfigured env cannot turn it on.

## R7. JWT verification with `jose`

- **Decision**:
  - `createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", SUPABASE_URL))` is built once at
    start. jose caches the keys and refetches on an unknown `kid`, with its built-in cooldown.
  - `jwtVerify(token, jwks, { issuer: ${SUPABASE_URL}/auth/v1, audience: "authenticated", algorithms: ["ES256"] })`.
  - `sub` must be a non-empty string.
  - Every failure (no `Bearer`, bad signature, wrong `iss`/`aud`/`alg`, expired, missing `sub`,
    JWKS unreachable) → 401 `unauthorized`.
  - Tests use `createLocalJWKSet` with an ES256 key pair made by `generateKeyPair("ES256")`.
- **Rationale**:
  - A37: one code path; no shared secret to store.
  - The anon key's JWT has `role: anon` and no `authenticated` audience, so it is refused.
  - An unreachable JWKS is treated as a failed sign-in, never as an open door.
- **Alternatives considered**: An HS256 fallback (rejected in A37); calling `auth.getUser()` per
  request (a network round trip per preview).

## R8. Rate limits with `express-rate-limit` 8 (memory store)

- **Decision**:
  - Four limiters, each with `windowMs` + `limit` from env (defaults 60/min IP, 20/min and
    300/day user, 10/hour force), `standardHeaders: "draft-8"` and `legacyHeaders: false`.
  - A shared `handler` sets `Retry-After` (seconds until the window resets, from
    `req.rateLimit.resetTime`) and sends `429 { error: "rate_limited" }`.
  - **IP**: the default key generator (it applies v8's IPv6 /56 subnet). `app.set("trust proxy", 1)`
    so that `req.ip` is the client behind Cloud Run's front end.
  - **User**: `keyGenerator: (req) => req.userId`.
  - **Force**: the same key, with `skip: (req) => req.body?.force !== true`. It runs before zod;
    only a literal `true` counts.
  - Order: IP → 4 KB body parser → auth → user (minute, then day) → force. The IP limiter runs
    before the body parser, so bad bodies are counted too.
  - Each limiter is created inside `createApp`, so every test app gets fresh counters.
- **Rationale**:
  - A38.
  - The library's memory store matches the accepted per-instance state (PLAN M3).
  - `draft-8` headers give clients the quota. `Retry-After` is what the spec requires.
- **Alternatives considered**: A hand-written counter map (more edge cases); a shared store
  (Redis), which is a new service and out of scope for v1.

## R9. Page parsing with `cheerio` and the built-in `TextDecoder`

- **Finding**:
  - Node 24 official builds (and `node:24-slim`) ship full ICU.
  - `new TextDecoder("windows-1256").decode([0xC7, 0xE1])` → `ال`.
  - An unknown label throws `RangeError`.
- **Decision**:
  - Charset comes from the `Content-Type` header, then a regex over the first 1,024 bytes
    (decoded as latin1) for `<meta charset=…>` or `http-equiv` `content="…charset=…"`, then UTF-8.
  - The decoder is created inside `try`, and a `RangeError` falls back to UTF-8 (A40).
  - The decoded text goes to `cheerio.load(html)`.
  - Field order: `og:*` → `twitter:*` → `<title>` / `meta[name=description]`.
  - URLs are resolved with `new URL(value, finalUrl)` and kept only if they are `http(s)` and not
    dropped by the host check (A42).
- **Rationale**: No `iconv-lite` dependency (A40). cheerio is the parser approved in the plan.

## R10. Sanitizing and limits

- **Decision**:
  - `sanitizeText(value, max)`: parse with cheerio and take `.text()`, which removes markup and
    decodes entities in one step.
  - Then remove C0/C1 control characters except whitespace, collapse whitespace runs to one space,
    trim, and cut to `max` code points.
  - Empty → `undefined`.
  - `max` comes from `LIMITS` in `@markme/domain` (title 300, description 1,000, siteName 200).
  - The cut counts UTF-16 units, as the domain's `z.string().max()` does. When the cut would
    split a surrogate pair, it backs off one unit, so no lone surrogate is left.
- **Rationale**: The output must pass `previewResponse` (FR-001, FR-016). Reusing cheerio adds no
  dependency.

## R11. Cache with `lru-cache`

- **Decision**:
  - `new LRUCache<string, PreviewResponse>({ max: 5000, ttl: 24 * 60 * 60 * 1000 })` inside
    `createApp`, keyed by `normalizedUrl` from `previewRequest`.
  - `force: true` skips `get` but still calls `set`.
  - Errors are never cached.
- **Rationale**: Implementation plan §M3 `cache.ts`; A45 (shared across users). Not caching
  errors keeps one bad minute from lasting 24 hours.

## R12. oEmbed adapters

- **Decision**:
  - Each adapter has `{ match(url): boolean; fetch(url, safeFetch): Promise<Partial<Preview> | null> }`.
  - Endpoints are constants. The user link goes only into the `url` query parameter, encoded with
    `URLSearchParams`.
  - Each adapter calls `safeFetch` with `allowedTypes: ["application/json"]`, then parses the JSON
    with a small zod schema (`title`, `author_name`, `thumbnail_url`, `html`, `type`).
  - X and Instagram: the text of the `html` blockquote (cheerio `.text()`) becomes the
    description. The HTML is never returned (A6, A19).
  - YouTube: `embed = { provider: "youtube", id }` only when `extractYouTubeId(url)` passes
    `YOUTUBE_ID_PATTERN` (A26).
  - Any failure (non-2xx, Meta `code 24`, a bad shape, a policy refusal of the provider host)
    returns `null`, and the HTML path runs.
  - Instagram adds `access_token` only when `META_OEMBED_TOKEN` is set.
- **Rationale**: Implementation plan §M3 `oembed/*`; S0 Q6. Provider endpoints go through the same
  SSRF checks as any other target.
- **Test seam** (small difference): `safeFetch` builds a fresh pinned `Agent` per hop, so undici's
  `MockAgent` cannot intercept it. `oembed.test.ts` passes a fake `SafeFetch` that returns canned
  provider JSON instead. The real fetch path is already covered by the SSRF suites.

## R13. CORS without a dependency

- **Decision**:
  - A small middleware in `src/cors.ts`. When `Origin` is in `CORS_ORIGINS`, it sets
    `Access-Control-Allow-Origin: <origin>` and `Vary: Origin`, and answers `OPTIONS` preflight
    with `204`, `Access-Control-Allow-Methods: POST` and
    `Access-Control-Allow-Headers: authorization, content-type`.
  - An unknown origin gets no CORS headers and a `403` on preflight.
  - No `Origin` → pass through (A44).
- **Rationale**: About 20 lines, against adding `cors` 2.8.6 for one allowlist (constitution IV).

## R14. Logging

- **Decision**:
  - `src/log.ts` writes one line per request on `response.on("finish")`:
    `{"method","status","durationMs","error","cacheHit","host"}`.
  - `host` is set by the pipeline from the parsed request URL (`new URL(url).host`) and is
    `undefined` before validation.
  - Unhandled errors log their stack once in a separate line, with no request data. The client
    gets only the error code (A43).
  - No logging library.
- **Rationale**: Cloud Run reads JSON lines from stdout as structured logs. A43 is easy to prove by
  testing the logger's input shape.

## R15. Docker image and deploy

- **Decision**:
  - **Dockerfile**: the builder `node:24-slim` (corepack pnpm 12.14.0) runs
    `pnpm install --frozen-lockfile --filter @markme/preview-api...`, then
    `pnpm --filter @markme/preview-api build`.
  - Runtime `node:24-slim`: `COPY dist/server.mjs`, `USER node`, `ENV NODE_ENV=production`,
    `HEALTHCHECK` with `node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz')..."`
    (the slim image has no curl), and `CMD ["node","server.mjs"]`.
  - The build context is the repo root (it needs the workspace and the lockfile), with a
    `.dockerignore`.
  - **CI job `preview-api-image`**: `docker build -f apps/preview-api/Dockerfile .`, then
    `docker run` and a `/healthz` check. It runs on PRs and pushes; it is not a required check
    until the ruleset is updated in M3-T8.
  - **`deploy-preview-api.yml`**:
    - Uses `google-github-actions/auth` (WIF; `permissions: id-token: write`),
      `setup-gcloud` and `docker push` to `europe-west1-docker.pkg.dev/<project>/markme/preview-api:<sha>`.
    - Then
      `gcloud run deploy markme-preview-api --region europe-west1 --max-instances=1 --min-instances=0 --memory=256Mi --allow-unauthenticated --set-env-vars SUPABASE_URL=…,CORS_ORIGINS=…`,
      then the smoke checks.
    - Actions are pinned by SHA, like `ci.yml`.
    - The ids come from `vars.GCP_PROJECT_ID`, `vars.GCP_WIF_PROVIDER`, `vars.GCP_DEPLOY_SA` and
      `vars.PREVIEW_API_SUPABASE_URL`.
  - **Wizard** (`scripts/setup-gcp.sh`, built with the `wizard` skill):
    - Walks through: install `gcloud` (asks first: system software), project `markme`, billing
      link, $1 budget with alerts at 50/90/100%, enable the `run`, `artifactregistry`,
      `iamcredentials` and `sts` APIs, the Artifact Registry repo plus a cleanup policy (keep 3),
      the WIF pool/provider with the A47 attribute condition, and a deploy service account with
      `run.admin`, `artifactregistry.writer` and `iam.serviceAccountUser`.
    - Ends with `gh variable set` for the four variables.
- **Rationale**: A46–A49. WIF means no JSON key exists anywhere. Repository variables are not
  secrets.
- **Alternatives considered**: A service-account JSON key in GitHub secrets (a long-lived
  credential); Cloud Build triggers (a second CI system).

## R16. Order of work and the "tests before the fetcher" rule

- **Decision**:
  - M3-T2 commits the full `ip-policy` suite, green.
  - It also commits the five `safe-fetch` suites with full test bodies, marked `it.fails`, against
    a `createSafeFetch` stub that throws `not implemented`. The bodies run in CI and are expected
    to fail.
  - M3-T3 implements `resolve.ts` and `safe-fetch.ts` and turns every `it.fails` into `it`. No
    test body changes.
- **Rationale**:
  - Constitution III ("SSRF tests are written before the fetcher") is met with real, executed
    assertions, not `it.todo` placeholders.
  - CI stays green on every commit (implementation plan note on M3-T2).
  - Changing `it.fails` to `it` cannot weaken a test.
  - If a stubbed case passes by accident, `it.fails` turns red, so a test that cannot fail is
    caught.
- **Alternatives considered**: `it.todo` (no assertions exist before the fetcher); committing red
  tests (breaks the required `test` check).

## R18. Hosting moves to Vercel Hobby (2026-10-24; replaces the deploy and wizard parts of R15)

- **Finding**: Cloud Run needs an active billing account even on the free tier. Opening one,
  Google asked for a $30 prepayment. Mostafa declined, and the account was closed with $0 spent.
- **Decision** (A51–A54, approved by Mostafa):
  - One Vercel Function on the free Hobby plan (no card), region `fra1`.
  - `scripts/build.mjs` adds a second esbuild entry, `src/vercel.ts` → `dist/vercel/index.mjs`,
    which default-exports the Express app (an Express app is a valid Node request handler).
  - `scripts/vercel-output.mjs` writes `.vercel/output` (Build Output API v3): `index.func` with
    `nodejs24.x`, `launcherType: Nodejs`, `regions: ["fra1"]`, `maxDuration: 30` and
    `SUPABASE_URL`/`CORS_ORIGINS` in `environment`; `config.json` routes every path to it.
  - `deploy-preview-api.yml`: same triggers as A47; a first step refuses refs other than `main`
    and `NNN-*` (the guard the WIF condition gave); install, build, write the output, then
    `npx vercel@63.1.2 deploy --prebuilt --prod --token "$VERCEL_TOKEN"`; smoke checks on
    `vars.PREVIEW_API_URL` (per-deployment URLs sit behind Vercel Authentication).
  - The Dockerfile and `preview-api-image` job stay; the GCP wizard moves to `scripts/archive/`.
  - `trust proxy` stays `1`: Vercel overwrites `X-Forwarded-For` with the client IP and does not
    forward client-sent values.
  - Cache and limits stay in memory per instance; Hobby cannot cap instances (A53).
- **Rationale**: no card and no prepayment; `fra1` is Supabase's city; shipping our own bundle
  avoids a Vercel build of the workspace, whose `@markme/domain` exports TS source (R1).
- **Alternatives considered**: Cloud Run with the prepayment; Render free (often asks for a card;
  sleeps after 15 minutes); Koyeb and Railway (no free compute); Vercel Git integration or
  zero-config Express (builds from source on Vercel).
- **Not verified yet**: the first real deploy. Nothing here has run against Vercel; T020 proves it.
- **Monetization**: Hobby is non-commercial only. Mostafa plans paid plans later; before the first
  paid feature ships, the service moves to another host; MarkMe never pays Vercel (A54). The
  Dockerfile keeps that move cheap.

## R17. `workflow_dispatch` only works once the workflow file is on `main` (found in `/speckit-tasks`)

- **Finding**: GitHub runs `workflow_dispatch` (UI or `gh workflow run`) only for workflow files
  that exist on the default branch. Once the file is there, a dispatch may pick another ref, and it
  runs that ref's copy of the file. A47 plans an exit-check deploy from `004-m3-preview-api`
  before the milestone merges. While `deploy-preview-api.yml` exists only on the milestone branch,
  that dispatch cannot be started.
- **Decision (proposed, needs Mostafa's approval at T017)**: Once the US4 PR has merged into the
  milestone branch, open a small PR to `main` that adds only `deploy-preview-api.yml`. It must
  pass the same five checks.
  - On `main` the file does nothing until the repository variables exist. Its `push` path filter
    (`apps/preview-api/**`, `packages/domain/**`, `pnpm-lock.yaml`) does not match the workflow
    file itself.
  - After that, the exit check dispatches it with `ref: 004-m3-preview-api`. The workflow's
    branch guard accepts `refs/heads/NNN-*` (R18; it replaced the WIF condition of A47).
- **Alternatives considered**: Add `push` on `NNN-*` branches (deploys every milestone push, not
  approved in A47); deploy by hand with `gcloud` from the laptop (skips the CI path the exit check
  is meant to prove); defer the cloud exit check until after the merge (breaks "merge only when
  exit criteria pass").
