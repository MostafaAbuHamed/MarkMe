---
description: "Task list for M3 Preview API"
---

# Tasks: M3 Preview API

**Input**: design documents in `specs/004-m3-preview-api/`. Read these before starting a task:

- [spec.md](spec.md): US1–US4, FR-001–FR-029, SC-001–SC-009
- [plan.md](plan.md): request order, deviations 1–8, task shape
- [research.md](research.md): R1–R17 (the reason behind each rule below)
- [data-model.md](data-model.md): fetch states, metadata sources, limiter table, log line
- [contracts/preview-api.md](contracts/preview-api.md): HTTP contract, signatures, env, dependencies, files
- [quickstart.md](quickstart.md): V1–V7

**Prerequisites**:

- constitution v1.1.3;
- M1 (PR #46) and M2 (PR #53) merged on `main`;
- decisions A37–A50 approved.

The spec requires tests (FR-028, FR-029, constitution III), so every code task includes its tests.

## How every code task runs

Each code task is one red → green → commit loop:

1. **Test first.** Write the test file(s) under _Test first_, then run
   `pnpm --filter @markme/preview-api exec vitest run <file>`. They must fail because the module
   or export does not exist yet. The exception is T006, whose tests land as `it.fails` (R16).
2. **Implement.** Write the files under _Implement_ until those tests pass.
3. **Done check.** Run every command under _Done when_. All must pass.
4. **Commit.** Use the message given. It ends with the task id, and every commit is green.

Rules for all tasks:

- All paths are under `apps/preview-api/` unless they start with `/` (repo root).
- Non-interactive shells start with `source ~/.nvm/nvm.sh && nvm use`.
- Add dependencies with `pnpm --filter @markme/preview-api add -E <pkg>@<version>` (add `-D` for
  dev). Use exactly the versions in the contract's "Dependencies" table (R2). Never `^`, never a
  newer version.
- Import every shape and rule from `@markme/domain`: `previewRequest`, `previewResponse`,
  `PREVIEW_ERROR_CODES`, `LIMITS`, `normalizeUrl`, `detectProvider`, `extractYouTubeId`,
  `YOUTUBE_ID_PATTERN`, `detectMediaType` and `parseEnv`. Never redefine one locally
  (constitution II).
- Tests never touch the network or DNS. Targets are local `http.createServer` instances on
  `127.0.0.1`, and names resolve through `test/helpers/resolver.ts`.
- The test-only seams (`allowAll` policy, `ports` with the test server's port, the `onConnect`
  spy) are passed only by tests, through `createSafeFetch` or `createApp` options. No env key,
  flag or default may turn them on (FR-029, R6). The `scheme-port` suite always uses the default
  ports.
- Never weaken, skip or `.only` a test (constitution III). Turning `it.fails` into `it` (T007) is
  the only allowed change to a committed SSRF test.
- Error bodies are exactly `{ "error": "<code>" }`. Never put a message, stack or path in a
  response.
- Use plain functions and factories (`createX(deps)`), with no classes. The one exception is the
  `PreviewFailure` error class in the contract.

## Workflow (A36, A50)

- **One task = one commit**, using Conventional Commits with scope `preview-api` (or `ci`), for
  example `feat(preview-api): add ES256 JWT auth (T003)`.
- **One PR per user story** into `004-m3-preview-api`. All five required CI checks must be green
  before merge.
- **Before opening each PR**, run the guard skills: `clean-code-guard` on `src/**`, `test-guard`
  on `test/**`, and `docs-guard` on docs and README.

  | PR  | Branch                        | Tasks                      | Proves            |
  | --- | ----------------------------- | -------------------------- | ----------------- |
  | 1   | `m3/us1-secure-fetch`         | T001–T007                  | US1 (SSRF, auth)  |
  | 2   | `m3/us2-metadata`             | T008–T010                  | US2               |
  | 3   | `m3/us3-endpoint`             | T011–T013                  | US3               |
  | 4   | `m3/us4-ship`                 | T014–T018                  | US4, docs         |
  | 5   | `ci/deploy-workflow` → `main` | T019 (needs approval, R17) | dispatch possible |

- PRs run **in order**. Each story branch starts from the updated `004-m3-preview-api` after
  the previous PR merges, because every story edits `src/app.ts` and `package.json`.
- After T020 (exit verification) passes, the milestone PR `004-m3-preview-api` → `main` is
  opened. Mostafa merges it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task).
- **[Story]**: US1 = secure fetch, US2 = metadata, US3 = endpoint, US4 = ship.

---

## Phase 1: Setup (PR 1)

**Purpose**: put the milestone branch on GitHub so story PRs can target it.

- [ ] T001 Commit this task list and publish the milestone branch.
  - **Files**: `/specs/004-m3-preview-api/tasks.md`, `/specs/004-m3-preview-api/research.md`
    (R17, added with this list).
  - **Steps**:
    1. Commit on `004-m3-preview-api` with the message `docs(m3): add M3 task list (T001)`.
    2. Run `git ls-remote --heads origin 004-m3-preview-api`. If it prints nothing, **ask
       Mostafa**, then run `git push -u origin 004-m3-preview-api`. The `ci-gate` ruleset
       covers `NNN-*` branches.
    3. Run `git switch -c m3/us1-secure-fetch`.
  - **Done when**: `origin/004-m3-preview-api` has the spec, plan and task commits, and the
    current branch is `m3/us1-secure-fetch`.

---

## Phase 2: Foundational (PR 1, blocks every story)

**Purpose**: the env keys, the error type and an injectable `createApp`. Every later task builds on
these.

- [ ] T002 Add the M3 env keys, the error type and the `createApp(options)` seam.
  - **Files**: `src/env.ts`, `src/errors.ts`, `src/app.ts`, `src/server.ts`, `.env.example`,
    `test/env.test.ts`, `test/errors.test.ts`, `test/healthz.test.ts`.
  - **Test first**:
    - `test/env.test.ts`: extend the existing table. Each row is a source object and the expected
      result:
      - With only `SUPABASE_URL` set, the defaults are `CORS_ORIGINS` =
        `["chrome-extension://dapmmcamlgmaopfaicfjifakodajigha"]`, `RATE_LIMIT_IP_PER_MIN` 60,
        `RATE_LIMIT_USER_PER_MIN` 20, `RATE_LIMIT_USER_PER_DAY` 300,
        `RATE_LIMIT_FORCE_PER_HOUR` 10, and `META_OEMBED_TOKEN` `undefined`.
      - `CORS_ORIGINS="a://x, b://y"` → `["a://x","b://y"]` (split on commas, trimmed, empty
        parts dropped).
      - Each `RATE_LIMIT_*` set to `"0"`, `"-1"` or `"abc"` throws `EnvError`.
      - `META_OEMBED_TOKEN=""` throws `EnvError` (it must be non-empty when set).
    - `test/errors.test.ts`: `ERROR_STATUS` maps `invalid_url`→400, `unauthorized`→401,
      `blocked_target`→422, `rate_limited`→429, `fetch_failed`→502 and `timeout`→504. Its keys
      equal `PREVIEW_ERROR_CODES` exactly. `new PreviewFailure("timeout").code === "timeout"`.
    - `test/healthz.test.ts`: switch to `createApp({ env: testEnv })`. Keep the same three
      assertions.
  - **Implement**:
    - `src/env.ts`: add the six keys from the contract's Env table to `previewApiEnvSchema`, each
      with `.describe(...)` like the existing keys. Use `z.coerce.number().int().positive()` for
      the limits. There is **no** key for the address policy or the resolver.
    - `src/errors.ts`:
      - `class PreviewFailure extends Error`, with
        `readonly code: "blocked_target" | "fetch_failed" | "timeout"`;
      - `const ERROR_STATUS: Record<PreviewErrorCode, number>`;
      - `sendError(res, code)`, which writes the status and `{ error: code }`.
    - `src/app.ts`: `createApp(options: AppOptions)` with `AppOptions = { env }` for now. Later
      tasks add `jwks`, `safeFetch`, `log` and `now`, all optional with production defaults.
      Keep `disable("x-powered-by")` and `/healthz`.
    - `src/server.ts`: pass `{ env }` to `createApp`.
    - `.env.example`: add each new key, commented out, with its default and a one-line comment.
  - **Done when**: `pnpm --filter @markme/preview-api test`, `pnpm typecheck` and `pnpm lint` all
    pass, and `pnpm dev` still serves `GET http://127.0.0.1:8787/healthz` → `{"ok":true}`.
  - **Commit**: `feat(preview-api): add M3 env keys, error codes and createApp options (T002)`.

**Checkpoint**: `createApp` takes options, and every error code has one status.

---

## Phase 3: User Story 1 - Fetching a link can never reach a private network (P1) 🎯 MVP

**Goal**: only signed-in callers get in, and no fetch can reach a private, loopback, link-local or
metadata address, directly, through DNS or through a redirect (FR-002, FR-004–FR-012).

**Independent test**: `pnpm --filter @markme/preview-api test` passes, and quickstart V1 holds:
every SSRF case is green and no `it.fails` or `it.todo` remains.

- [ ] T003 [US1] Verify Supabase access tokens with ES256 JWKS (A37, R7).
  - **Files**: `src/auth.ts`, `src/app.ts`, `test/helpers/tokens.ts`, `test/auth.test.ts`,
    `package.json`, `/pnpm-lock.yaml`.
  - **Dependency**: `jose@6.2.12`.
  - **Test first**:
    - `test/helpers/tokens.ts`:
      - creates one ES256 key pair with `generateKeyPair("ES256")` and exposes
        `jwks = createLocalJWKSet({ keys: [publicJwk] })`;
      - `signToken(overrides)` returns a token with `iss = ${SUPABASE_URL}/auth/v1`,
        `aud = "authenticated"`, `sub = "user-1"`, `exp = now + 1h` and `kid`, plus any
        overrides.
    - `test/auth.test.ts` uses supertest against a test route behind the middleware. Rows are a
      header and the expected status:
      - no `Authorization` → 401;
      - `Basic abc` → 401;
      - `Bearer garbage` → 401;
      - expired → 401;
      - wrong `iss` → 401;
      - `aud: "anon"` → 401;
      - no `sub` → 401;
      - signed by a second key pair not in the JWKS → 401;
      - signed HS256 with any secret → 401;
      - valid → 200, and the handler sees `req.userId === "user-1"`.
    - Every 401 body equals `{ error: "unauthorized" }` exactly.
    - With a JWKS getter that throws (unreachable keys) → 401, not 500.
  - **Implement** (`src/auth.ts`):
    - `createAuth({ jwks, issuer })` returns middleware. It parses `Bearer <token>`, then calls
      `jwtVerify(token, jwks, { issuer, audience: "authenticated", algorithms: ["ES256"] })`.
    - It requires `typeof payload.sub === "string" && payload.sub !== ""`, then sets
      `req.userId = payload.sub`. Add the field through module augmentation of Express
      `Request`.
    - Any throw → `sendError(res, "unauthorized")`.
    - In `createApp`, the default `jwks` is
      `createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL))`, built
      once.
    - Do not mount the middleware on a route yet; T012 does that.
  - **Done when**: the auth suite passes, and `pnpm typecheck` and `pnpm lint` pass.
  - **Commit**: `feat(preview-api): verify Supabase JWTs with ES256 JWKS (T003)`.

- [ ] T004 [P] [US1] Add the CORS allowlist, the 4 KB body limit and the request log (A43, A44,
      R13, R14).
  - **Files**: `src/cors.ts`, `src/log.ts`, `src/app.ts`, `test/cors.test.ts`, `test/log.test.ts`.
  - **Test first**:
    - `test/cors.test.ts` (supertest, `createApp` with `CORS_ORIGINS = ["chrome-extension://ok"]`):
      - `Origin: chrome-extension://ok` gets `Access-Control-Allow-Origin: chrome-extension://ok`
        and `Vary: Origin`.
      - `Origin: https://evil.example` gets no `Access-Control-Allow-Origin`.
      - `OPTIONS /v1/preview` from the allowed origin → 204, with
        `Access-Control-Allow-Methods: POST`,
        `Access-Control-Allow-Headers: authorization, content-type` and
        `Access-Control-Max-Age: 600`.
      - `OPTIONS` from an unknown origin → 403.
      - No `Origin` header → passes through unchanged (A44).
    - `test/log.test.ts` (inject `log` and capture the lines):
      - One line per request, with exactly the keys `method`, `status`, `durationMs`, and when
        set, `error`, `cacheHit` and `host`.
      - Even when the handler sets `res.locals.host = "a.com"`, no line contains `/path`,
        `?q=`, `user-1` or `Bearer`.
      - `/healthz` is not logged.
    - Body limit: a 5 KB JSON body to a test POST route → 400 `{ error: "invalid_url" }`.
      Malformed JSON → 400 `{ error: "invalid_url" }`.
  - **Implement**:
    - `src/cors.ts`: `createCors(origins: readonly string[])`, following R13 and the contract's
      "Preflight".
    - `src/log.ts`:
      - `createRequestLog(write)` writes on `res.on("finish")`, reading `res.locals.error`,
        `res.locals.cacheHit` and `res.locals.host`. Its type is the data model's `LogLine`.
      - The default `write` is `(line) => process.stdout.write(JSON.stringify(line) + "\n")`.
    - `src/errors.ts`: `sendError` also sets `res.locals.error = code`.
    - `src/app.ts`, in this order: `cors` → _(IP limiter slot, filled by T013)_ →
      `express.json({ limit: "4kb" })` → routes → a final error handler.
      - The final error handler maps `entity.too.large` and `entity.parse.failed` to
        `invalid_url`. Anything else goes to `fetch_failed`, with the stack written to stderr in
        a separate line that carries no request data.
      - Leave a `// IP limiter (T013)` comment at the slot.
  - **Done when**: the cors and log suites pass, and `pnpm lint` passes.
  - **Commit**: `feat(preview-api): add CORS allowlist, body limit and host-only request log (T004)`.

- [ ] T005 [P] [US1] Implement the address policy and its full suite (R5).
  - **Files**: `src/ssrf/ip-policy.ts`, `test/ip-policy.test.ts`, `package.json`,
    `/pnpm-lock.yaml`.
  - **Dependency**: `ipaddr.js@2.5.0`.
  - **Test first** (`test/ip-policy.test.ts`, `it.each`):
    - **Blocked** (`isBlockedAddress` → `true`), one row per range in
      `docs/IMPLEMENTATION_PLAN.md` §3 M3 `ssrf/ip-policy.ts`:
      - IPv4: `0.0.0.0`, `10.0.0.1`, `100.64.0.1`, `127.0.0.1`, `127.255.255.254`,
        `169.254.169.254`, `172.16.0.1`, `172.31.255.255`, `192.0.0.1`, `192.0.2.1`,
        `192.168.1.1`, `198.18.0.1`, `198.51.100.1`, `203.0.113.1`, `224.0.0.1`, `240.0.0.1`
        and `255.255.255.255`.
      - IPv6: `::`, `::1`, `[::1]`, `fc00::1`, `fd00:ec2::254`, `fe80::1`, `ff02::1`,
        `64:ff9b::7f00:1`, `64:ff9b::808:808` (NAT64 is blocked even when it embeds a public
        IPv4, deviation 3), `64:ff9b:1::1`, `2001::1` (Teredo), `2001:db8::1`,
        `2002:7f00:1::` (6to4) and `2002:808:808::` (6to4 with a public IPv4, still blocked).
      - IPv4-mapped: `::ffff:127.0.0.1`, `::ffff:7f00:1`, `::ffff:10.0.0.1` and
        `::ffff:169.254.169.254`.
      - Not an IP: `localhost`, `""`, `example.com`, `1.2.3` and `::g`.
    - **Encoded IPv4 literals**: for `http://2130706433`, `http://0177.0.0.1`, `http://0x7f.1`
      and `http://127.1`, assert `new URL(u).hostname === "127.0.0.1"` and that it is blocked.
    - **Allowed** (`false`): `8.8.8.8`, `1.1.1.1`, `93.184.215.14`, `2606:4700::1111`,
      `[2606:4700::1111]` and `::ffff:8.8.8.8`.
  - **Implement** (`src/ssrf/ip-policy.ts`):
    - `export type AddressPolicy = (ip: string) => boolean` (true = blocked).
    - `isBlockedAddress` strips one pair of `[]`. If `!ipaddr.isValid`, it returns `true`.
      Otherwise it runs `ipaddr.process(...)` and returns `true` when `range() !== "unicast"`
      or the address matches the explicit CIDR list (checked with `ipaddr.parseCIDR` and
      `.match`).
    - Export `allowAll: AddressPolicy = () => false` from `test/helpers/policy.ts`, **not** from
      `src/`.
  - **Done when**: `pnpm --filter @markme/preview-api exec vitest run test/ip-policy.test.ts`
    passes. Gate check (do not commit): make `loopback` allowed, then confirm the suite fails.
  - **Commit**: `feat(preview-api): add IPv4/IPv6 address policy for SSRF (T005)`.

- [ ] T006 [US1] Write the five `safe-fetch` suites before the fetcher exists (constitution III,
      R16).
  - **Files**: `src/ssrf/safe-fetch.ts` (stub), `src/ssrf/resolve.ts` (types only),
    `test/helpers/servers.ts`, `test/helpers/resolver.ts`,
    `test/safe-fetch.scheme-port.test.ts`, `test/safe-fetch.dns.test.ts`,
    `test/safe-fetch.redirect.test.ts`, `test/safe-fetch.limits.test.ts` and
    `test/safe-fetch.headers.test.ts`.
  - **Stub**:
    - `src/ssrf/resolve.ts` exports `type Resolver` and `type ResolvedAddress` from the contract.
    - `src/ssrf/safe-fetch.ts` exports the contract's `SafeFetchOptions`, `SafeFetchResult`,
      `SafeFetch` and `createSafeFetch(deps)`. Calling the returned function throws
      `new Error("not implemented")`.
  - **Helpers**:
    - `servers.ts`: `startServer(handler)` → `{ url, port, close, requests }`. `requests`
      records each request's method, path and headers. The servers listen on `127.0.0.2:0`. Linux
      routes all of `127/8` to loopback, and CI runs on Ubuntu. This keeps `127.0.0.1` free to be a
      blocked redirect target.
    - `resolver.ts`: `scriptedResolver(answers: Record<host, Answer[][]>)`. Call _n_ for a host
      returns the _n_-th answer list. The helper also counts calls per host.
    - `policy.ts` (from T005) also exports
      `testFetchDeps(server, resolver, policy = allowAll)`. It returns
      `{ resolve, policy, ports: ["", "80", "443", String(server.port)], onConnect }` and records
      every `onConnect` address.
  - **Test bodies** (all written in full, each marked `it.fails`):
    - **scheme-port**: `file:///etc/passwd`, `ftp://a.com`, `gopher://a.com` and
      `data:text/html,x` → `PreviewFailure("blocked_target")`, with no resolver call.
      `http://a.com:22`, `:8080` and `:6379` → `blocked_target`, with no resolver call.
      `:80`, `:443` and no port pass the port check. Use the default `ports` and a scripted
      resolver that throws `ENOTFOUND`, then assert the resolver was called exactly once and the
      result is `fetch_failed`, not `blocked_target`.
    - **dns** (production `isBlockedAddress`, scripted resolver):
      - `a.test` → `[10.0.0.1]` → `blocked_target`.
      - `[8.8.8.8, 127.0.0.1]` → `blocked_target` (mixed answers).
      - **Rebinding**: call 1 → `[93.184.215.14]`, call 2 → `[127.0.0.1]`. The fetch uses
        address `93.184.215.14`: assert through the `onConnect` spy that the
        resolver ran exactly once. Use `allowAll` for the
        connection and the production policy for the check.
      - `[AAAA 2606:4700::1111, A 93.184.215.14]` → connects to `93.184.215.14` (A41).
      - IPv6-only `[2606:4700::1111]` → connects to the IPv6 address.
      - A resolver that throws `ENOTFOUND` → `fetch_failed`.
    - **redirect**:
      - Setup: a local server on `127.0.0.2`. The policy is
        `allowOnly("127.0.0.2")`, which is the production `isBlockedAddress` except for that one
        address, exported from `test/helpers/policy.ts`.
      - So the first hop connects, and every `Location` is checked by the production rules.
      - `302 → http://127.0.0.1/`, `302 → http://169.254.169.254/latest/meta-data` and
        `302 → http://internal.test/` (which resolves to `10.0.0.1`) → `blocked_target`.
      - `302 → ftp://a.com` → `blocked_target`.
      - `Location: /next` is resolved against the current URL and followed.
      - Three redirects → success with `finalUrl` = the last hop; four → `fetch_failed`.
    - **limits** (local servers, `allowAll`):
      - A server that writes a byte every 500 ms for 10 s → `timeout`, and the call returns in
        under 6 s.
      - Three redirects of 2 s each → `timeout` (one shared deadline).
      - A 3 MB `text/html` body → `fetch_failed`.
      - A gzip body of about 50 KB that inflates past 2 MB → `fetch_failed`.
      - `application/json` → `fetch_failed`; `application/octet-stream` → `fetch_failed`.
      - `application/json` with `allowedTypes: ["application/json"]` → success.
      - `image/png` → success with `body.length === 0`, and the server sees the request end
        without the body being read.
      - A 200 response with no `Content-Type` → `fetch_failed`.
      - Final `404` and `500` → `fetch_failed`.
      - A connection reset before the deadline → `fetch_failed`, **not** `timeout` (R4).
    - **headers**:
      - The target sees `user-agent: MarkMeBot/1.0 (+https://github.com/MostafaAbuHamed/MarkMe)`,
        and no `cookie` or `authorization` header.
      - A `302` with `Set-Cookie: s=1` → the next hop has no `cookie` header.
      - `accept` is sent as given.
  - **Done when**:
    - `pnpm --filter @markme/preview-api test` passes, with every `it.fails` reported as an
      expected failure.
    - `grep -c "it.fails" test/safe-fetch.*.test.ts` lists all five files.
    - `pnpm typecheck` and `pnpm lint` pass.
  - **Commit**: `test(preview-api): add SSRF safe-fetch suites ahead of the fetcher (T006)`.

- [ ] T007 [US1] Implement `resolve.ts` and `safe-fetch.ts`, then turn every `it.fails` into `it`
      (R3, R4, A41, A45).
  - **Files**: `src/ssrf/resolve.ts`, `src/ssrf/safe-fetch.ts`, the five `test/safe-fetch.*.test.ts`
    files (`it.fails` → `it` only), `package.json` and `/pnpm-lock.yaml`.
  - **Dependency**: `undici@8.11.2`.
  - **Test first**: change `it.fails` to `it` in all five suites, then run them. They fail
    against the stub.
  - **Implement**:
    - `src/ssrf/resolve.ts`: `createResolveSafe(resolve, policy)`.
      - IP literal host (brackets stripped) → check it directly.
      - Otherwise `await resolve(host)`. Empty → `fetch_failed`. Any address blocked →
        `blocked_target`.
      - Return the first `family === 4` address, else the first IPv6 one.
      - The production resolver is
        `(h) => dns.promises.lookup(h, { all: true, verbatim: true })`.
    - `src/ssrf/safe-fetch.ts`: `createSafeFetch({ resolve, policy, ports = ["", "80", "443"], onConnect? })`.
      Per call:
      1. `const signal = AbortSignal.timeout(deadlineMs)` (default 5000), created once.
      2. Loop over hops 0..`maxRedirects` (default 3). Check the protocol ∈ {`http:`, `https:`}
         and the port ∈ `ports`; otherwise `blocked_target`. Then
         `const target = await resolveSafe(url.hostname)`, then `onConnect?.(target.address)`.
      3. `const agent = new Agent({ connect: { lookup: (_h, opts, cb) => opts.all ? cb(null, [target]) : cb(null, target.address, target.family) } })`.
      4. `await fetch(url, { dispatcher: agent, redirect: "manual", signal, headers: { "user-agent": UA, accept } })`,
         with no `cookie` and no `credentials`. Close the agent in `finally`.
      5. A 3xx with `Location` → `url = new URL(location, url)` and continue. Past
         `maxRedirects` → `fetch_failed`.
      6. A non-2xx → `fetch_failed`. Take the media type from `content-type`, before `;`,
         lower-cased. Missing, or not matched by `allowedTypes` (`image/*` is a prefix match) →
         `fetch_failed`.
      7. `image/*` → cancel the body and return `body: new Uint8Array()`. Otherwise read
         `response.body` chunks and sum their length; past `maxBytes` (default 2 MiB) → cancel,
         then `fetch_failed`.
      8. Return `{ finalUrl, status, contentType, charset, body }`.
    - Error mapping (R4): wrap everything after step 1. In `catch`, keep a `PreviewFailure` as
      it is. Otherwise, if `signal.aborted && signal.reason?.name === "TimeoutError"` →
      `timeout`, else `fetch_failed`.
    - `UA` is one exported constant.
  - **Done when**:
    - Every SSRF suite passes (quickstart V1).
    - `grep -rnE "it\.(fails|todo)" test` prints nothing.
    - `git diff` of the five suites shows only `it.fails` → `it` changes.
    - `pnpm typecheck` and `pnpm lint` pass.
  - **Commit**: `feat(preview-api): add pinned-IP safe fetch with redirect, size and time limits (T007)`.

**Checkpoint (PR 1)**: open `m3/us1-secure-fetch` → `004-m3-preview-api`. Run the guards first.
CI must be green.

---

## Phase 4: User Story 2 - A link becomes a clean, readable preview (P2)

**Goal**: page metadata and provider data become sanitized preview fields within the shared limits
(FR-013–FR-019).

**Independent test**: `html-metadata`, `sanitize` and `oembed` suites pass on fixtures and canned
JSON, with no network.

Start the branch: `git switch 004-m3-preview-api && git pull && git switch -c m3/us2-metadata`.

- [ ] T008 [US2] Add `sanitizeText` (R10).
  - **Files**: `src/parse/sanitize.ts`, `test/sanitize.test.ts`, `package.json`,
    `/pnpm-lock.yaml`.
  - **Dependency**: `cheerio@1.2.0`.
  - **Test first** (`it.each`, input and max → output):
    - `"<b>Hi</b> <script>alert(1)</script>there"` → `"Hi there"`. Script text is removed, not
      kept.
    - `"Tom &amp; Jerry &#x27;s"` → `"Tom & Jerry 's"`.
    - `"a\u0000b\u0007c\u009f"` → `"abc"`.
    - `"  a \n\t  b  "` → `"a b"`.
    - `""`, `"   "` and `undefined` → `undefined`.
    - `"x".repeat(301)` with max 300 → length 300.
    - A string whose cut would split `"😀"` → it ends before the emoji, with no lone surrogate.
    - Arabic `"مرحبا"` → unchanged.
  - **Implement**: `sanitizeText(value, max)` as R10 describes. Load with cheerio, remove
    `script` and `style`, then `.text()`. Strip `[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]`,
    collapse `\s+`, trim, then cut at `max` UTF-16 units, backing off one unit when the last
    kept one is a high surrogate.
  - **Done when**: the sanitize suite passes, and `pnpm lint` passes.
  - **Commit**: `feat(preview-api): add text sanitizer with shared length limits (T008)`.

- [ ] T009 [US2] Parse HTML metadata, with charset detection and private image hosts dropped (A40,
      A42, R9).
  - **Files**: `src/parse/html-metadata.ts`, `test/html-metadata.test.ts`, `test/fixtures/*.html`.
  - **Test first**: fixtures, and the expected `PageMetadata` for each, from the data model's
    "Page metadata" table:
    - `og-complete.html`: every `og:*` tag, plus a `<title>` that loses.
    - `twitter-only.html`: `twitter:*` fills in.
    - `bare-title.html`: `<title>` and `meta[name=description]` only. The favicon falls back to
      `<origin>/favicon.ico`.
    - `relative-urls.html`: `og:image="/img/a.png"` and `<link rel="shortcut icon" href="ico.png">`,
      both resolved against `finalUrl` `https://a.com/blog/post`.
    - `script-title.html`: `<title><script>x</script>Real</title>` → `Real`, after
      `sanitizeText`, which the pipeline applies. This test asserts the raw value only.
    - `huge-description.html`: a 5,000-character description, kept raw. The pipeline cuts it.
    - `empty.html`: no metadata at all → every field `undefined`, except the `/favicon.ico`
      fallback.
    - `win1256-header.html`: `windows-1256` bytes, decoded with the charset argument
      `"windows-1256"` → the Arabic title reads correctly.
    - `win1256-meta.html`: the same bytes with `<meta charset="windows-1256">` in the first
      1,024 bytes and no header charset → decoded correctly.
    - `unknown-charset.html`: header charset `x-made-up` → decoded as UTF-8, with no throw.
    - `private-image.html`: `og:image` on `http://127.0.0.1/a.png`, the icon on
      `http://[::1]/f.ico`, and `twitter:image` on `http://localhost/x.png` → all dropped.
      `og:image` on `javascript:alert(1)` → dropped.
    - Store the Windows-1256 fixtures as bytes. Write them from the test with `Buffer.from([...])`,
      or commit them with a `.gitattributes` `binary` line.
  - **Implement**: `parseHtmlMetadata(body, charset, finalUrl)`, following the data model and R9.
    The URL check uses `isBlockedAddress` for IP literals plus `hostname === "localhost"`, with no
    DNS lookup.
  - **Done when**: the html-metadata suite passes, and `pnpm lint` passes.
  - **Commit**: `feat(preview-api): parse page metadata with charset detection (T009)`.

- [ ] T010 [US2] Add the YouTube, X and Instagram oEmbed adapters (A6, A19, A26, R12).
  - **Files**: `src/oembed/index.ts`, `src/oembed/youtube.ts`, `src/oembed/x.ts`,
    `src/oembed/instagram.ts`, `test/oembed.test.ts`.
  - **Test first** (a fake `SafeFetch` that records the URL and options it gets, and returns
    canned JSON bytes):
    - YouTube `https://www.youtube.com/watch?v=dQw4w9WgXcQ`:
      - It calls exactly `https://www.youtube.com/oembed?format=json&url=<encoded link>`, with
        `allowedTypes: ["application/json"]`.
      - The result has `title`, `imageUrl` = `thumbnail_url`, `siteName` = `provider_name`,
        `oembedType` `"video"` and `embed` `{ provider: "youtube", id: "dQw4w9WgXcQ" }`.
      - The `html` field from the provider is **not** in the result.
    - A YouTube link whose id fails `YOUTUBE_ID_PATTERN` → no `embed`, other fields kept.
    - X `https://x.com/a/status/1`:
      - It calls `https://publish.x.com/oembed?omit_script=true&url=…`.
      - The text of the `html` blockquote → `description`, with no markup.
      - No `embed`.
    - Instagram `https://www.instagram.com/p/abc/`:
      - It calls `https://graph.facebook.com/v25.0/instagram_oembed?url=…`, with **no**
        `access_token`.
      - With `META_OEMBED_TOKEN=t`, `access_token=t` is added.
    - These all → `null`:
      - the fake throws `PreviewFailure("fetch_failed")`;
      - the fake throws `blocked_target`;
      - the JSON is `{ "error": { "code": 24 } }`;
      - the JSON has the wrong shape;
      - the body is not JSON.
    - `createAdapters(env)` returns the adapters in the order youtube, x, instagram. `match` is
      true only for the provider hosts (via `detectProvider`).
  - **Implement**: follow the contract's `OEmbedAdapter` and R12. The endpoint bases are `const`
    strings. Build URLs with `URL` + `searchParams.set`, never with string concatenation. Parse
    with a small zod schema in each file.
  - **Done when**: the oembed suite passes, and `pnpm lint` passes.
  - **Commit**: `feat(preview-api): add YouTube, X and Instagram oEmbed adapters (T010)`.

**Checkpoint (PR 2)**: open `m3/us2-metadata` → `004-m3-preview-api`. Run the guards first.

---

## Phase 5: User Story 3 - A signed-in user gets a preview fast and fairly (P3)

**Goal**: `POST /v1/preview` returns a validated preview or one error code, cached for 24 h and
rate limited (FR-001, FR-003, FR-020–FR-022).

**Independent test**: `app.test.ts` and `pipeline.test.ts` pass in-process, and quickstart V5 works
locally.

Start the branch: `git switch 004-m3-preview-api && git pull && git switch -c m3/us3-endpoint`.

- [ ] T011 [US3] Add the preview cache and the pipeline (A39, A45, R11).
  - **Files**: `src/cache.ts`, `src/pipeline.ts`, `test/pipeline.test.ts`, `package.json`,
    `/pnpm-lock.yaml`.
  - **Dependency**: `lru-cache@11.5.3`.
  - **Test first** (`test/pipeline.test.ts`, with a fake `SafeFetch`, fake adapters and a real
    cache):
    - HTML page → `previewResponse.parse(result.preview)` succeeds. The title is sanitized and cut
      to `LIMITS.title`.
    - A 5,000-character description → length `LIMITS.description`.
    - Direct image `https://a.com/img/My%20Cat.png` (`image/png`) → `imageUrl === url`,
      `mediaType "image"`, title `"My Cat.png"`. A bad `%` sequence → the raw segment.
    - Empty page → exactly `{ url, mediaType: "link" }`, with no other keys.
    - A YouTube adapter result → `provider "youtube"`, `embed` set, `mediaType "video"`.
    - An X adapter result plus the HTML path → `description` from the adapter, `title` and
      `imageUrl` from HTML, `mediaType "post"`.
    - An adapter returns `null` → the HTML path result.
    - Cache:
      - The second call with the same `normalizedUrl` makes no `safeFetch` call and returns
        `cacheHit: true`.
      - `https://a.com/x?utm_source=y` and `https://a.com/x` share one entry.
      - `force: true` → it fetches again and replaces the entry.
      - A `PreviewFailure` is not cached: the next call fetches again.
      - Entries expire after 24 h, using the injected `now`.
    - `PreviewFailure` codes propagate unchanged.
  - **Implement**:
    - `src/cache.ts`: `createPreviewCache({ now? })`, wrapping
      `new LRUCache({ max: 5000, ttl: 86_400_000, perf: { now } })`.
    - `src/pipeline.ts`: `createPipeline(deps)`, following the data model's "Preview" section:
      1. Look up the cache (unless `force`).
      2. Run the matching adapter.
      3. Call `safeFetch(url)` for HTML (always for X and Instagram, which fill gaps; skipped for
         YouTube when the adapter succeeded).
      4. `parseHtmlMetadata`.
      5. Merge, with adapter fields first.
      6. Run `sanitizeText` on every text field, and `normalizeUrl(...).ok` on `imageUrl` and
         `faviconUrl`.
      7. `detectMediaType({ url, provider, oembedType, ogType, contentType })`.
      8. `previewResponse.parse`.
      9. `cache.set`.
  - **Done when**: the pipeline suite passes, and `pnpm lint` passes.
  - **Commit**: `feat(preview-api): add preview pipeline with 24h shared cache (T011)`.

- [ ] T012 [US3] Mount `POST /v1/preview` (FR-001, FR-003).
  - **Files**: `src/app.ts`, `src/server.ts`, `test/app.test.ts`.
  - **Test first** (`test/app.test.ts`: supertest; `createApp` with the test `jwks`, a
    `safeFetch` built from `testFetchDeps` (scripted resolver, `allowAll`, the server's port), local target servers, and a
    captured `log`):
    - No token → 401. Valid token + `https://ok.test/` (served locally) → 200, and the body
      passes `previewResponse`.
    - `{"url":"ftp://a.com"}`, `{"url":"not a url"}`, `{"url":"https://u:p@a.com"}`, a URL of
      2,100 characters, `{}`, `{"url":1}` and `[]` → 400 `{ error: "invalid_url" }`.
    - Built with the production policy, `{"url":"http://169.254.169.254/"}` → 422
      `{ error: "blocked_target" }`.
    - A target returning 500 → 502 `fetch_failed`. A slow target → 504 `timeout`.
    - Every error body has exactly one key, `error`. No body contains `stack`, `at ` or `/src/`.
    - The same URL twice → one target request. The second log line has `cacheHit: true`.
    - Log lines carry `host: "ok.test"`, and no path, query or `user-1`.
    - A direct image link → `imageUrl` plus the file-name title.
    - CORS on this route: an unknown origin gets no allow header; no `Origin` → 200.
  - **Implement**:
    - Mount `POST /v1/preview` as auth → handler. The handler does
      `previewRequest.safeParse(req.body)` (failure → `invalid_url`), then
      `res.locals.host = new URL(url.url).host`, then the pipeline.
    - A `PreviewFailure` → `sendError(res, failure.code)`. Success sets
      `res.locals.cacheHit`, then `res.json(preview)`.
    - Default `safeFetch` in `createApp`:
      `createSafeFetch({ resolve: dnsResolve, policy: isBlockedAddress })`.
    - `server.ts` keeps passing only `{ env }`.
  - **Done when**: the app suite passes. `pnpm dev`, then
    `curl -XPOST localhost:8787/v1/preview -d '{}' -H 'content-type: application/json'` → 401.
  - **Commit**: `feat(preview-api): add POST /v1/preview endpoint (T012)`.

- [ ] T013 [US3] Add the IP, user and force rate limiters (A38, R8).
  - **Files**: `src/ratelimit.ts`, `src/app.ts`, `test/app.test.ts`, `package.json`,
    `/pnpm-lock.yaml`.
  - **Dependency**: `express-rate-limit@8.7.1`.
  - **Test first** (add to `test/app.test.ts`, with the env limits set small, e.g. IP 5, user/min
    3, user/day 4, force 2):
    - The 6th request from one IP within a minute, **with no token** → 429
      `{ error: "rate_limited" }` with a `Retry-After` header that is a positive integer.
      This shows a bad-token flood is throttled before auth.
    - The 4th valid request from one user in a minute → 429. A second user is still served.
    - The user/day limit → 429 once 4 requests have been made inside the day window, even with
      the minute limit raised.
    - The 3rd `force: true` request in an hour → 429. A `force: false` or `force: "yes"`
      request is not counted by the force limiter (`"yes"` then fails zod with 400).
    - With `X-Forwarded-For: 1.2.3.4, 5.6.7.8` from the test client, the IP key is the last hop
      (`trust proxy` = 1). Assert two different spoofed first values share one bucket.
    - Every response has `RateLimit` and `RateLimit-Policy` headers.
    - Limiters are per app: two `createApp` calls do not share counters.
  - **Implement**:
    - `src/ratelimit.ts`: `createLimiters(env)` returns `{ ip, userMinute, userDay, force }`,
      as in R8. They share one `handler`, which sets `Retry-After` from
      `req.rateLimit.resetTime` and calls `sendError(res, "rate_limited")`.
    - `src/app.ts`: `app.set("trust proxy", 1)`. Put `ip` in the T004 slot, **before**
      `express.json`. On the route: auth → userMinute → userDay → force → handler.
  - **Done when**: the app suite passes, and `pnpm lint` passes.
  - **Commit**: `feat(preview-api): add IP, user and force rate limits (T013)`.

**Checkpoint (PR 3)**: open `m3/us3-endpoint` → `004-m3-preview-api`. Run the guards first. Run
quickstart V5 locally before opening it.

---

## Phase 6: User Story 4 - The service ships as an image and answers on a public endpoint (P4)

**Goal**: a runnable bundle and image, CI proof that it builds and runs, and a CI deploy to Cloud
Run through WIF (FR-023–FR-027).

**Independent test**: quickstart V3, V4, V6 and V7.

Start the branch: `git switch 004-m3-preview-api && git pull && git switch -c m3/us4-ship`.

- [ ] T014 [US4] Switch `build` to an esbuild single-file bundle (R1, deviation 1).
  - **Files**: `scripts/build.mjs` (new, inside `apps/preview-api/`), `package.json`, and
    `tsconfig.build.json` (deleted; it is unused after this change).
  - **Dependency**: `esbuild@0.28.2` (dev).
  - **Test first**: run `pnpm --filter @markme/preview-api build && node apps/preview-api/dist/server.mjs`
    on the current code. It fails, because `dist/server.mjs` does not exist (R1 shows the old
    `dist/server.js` also fails).
  - **Implement**:
    - `scripts/build.mjs` calls esbuild's JS API with `entryPoints: ["src/server.ts"]`,
      `bundle: true`, `platform: "node"`, `target: "node24"`, `format: "esm"`,
      `outfile: "dist/server.mjs"`, the `createRequire` banner from R1, and `sourcemap: false`.
      Before building, it clears `dist/`.
    - `package.json`: `"build": "node scripts/build.mjs"`. `dev`, `typecheck` and `test` stay
      unchanged.
    - Make sure ESLint covers `scripts/build.mjs`: lint it, and if the config ignores it, add it.
  - **Done when**: quickstart V4's first block works (`/healthz` from `dist/server.mjs`).
    `grep -c supabase apps/preview-api/dist/server.mjs` → `0`. `pnpm build`, `pnpm lint` and
    `pnpm typecheck` pass.
  - **Commit**: `build(preview-api): bundle the service with esbuild into dist/server.mjs (T014)`.

- [ ] T015 [US4] Add the Dockerfile and the `preview-api-image` CI job (R15).
  - **Files**: `Dockerfile`, `/.dockerignore`, `/.github/workflows/ci.yml`.
  - **Implement**:
    - `Dockerfile`, with the repo root as the build context:
      1. Builder `node:24-slim`. Run `corepack enable`. Copy `package.json`,
         `pnpm-lock.yaml`, `pnpm-workspace.yaml` and every `packages/*/package.json` and
         `apps/preview-api/package.json`, then run
         `pnpm install --frozen-lockfile --filter @markme/preview-api...`.
      2. Copy `packages/` and `apps/preview-api/`, then run
         `pnpm --filter @markme/preview-api build`.
      3. Runtime `node:24-slim`, `WORKDIR /app`. `COPY --from=builder /repo/apps/preview-api/dist/server.mjs ./`.
         Set `ENV NODE_ENV=production`, `USER node`, `EXPOSE 8080`, and
         `HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"`.
         `CMD ["node","server.mjs"]`.
    - `/.dockerignore`: `**/node_modules`, `**/dist`, `**/.turbo`, `**/.env`, `**/.env.*`
      (but `!**/.env.example`), `.git`, `apps/extension`, `specs`, `docs` and `coverage`.
    - `ci.yml`, new job `preview-api-image`:
      - pinned `actions/checkout` (same SHA as the other jobs);
      - `docker build -f apps/preview-api/Dockerfile -t markme-preview .`;
      - `docker run -d --name mp -p 8080:8080 -e PORT=8080 -e SUPABASE_URL=http://127.0.0.1:54321 markme-preview`;
      - wait up to 20 s for `curl -fsS http://127.0.0.1:8080/healthz`;
      - `test "$(docker inspect -f '{{.Config.User}}' mp)" = node`.
      - `timeout-minutes: 15`.
  - **Done when**:
    - quickstart V4 passes locally;
    - the image is under 300 MB (`docker image ls markme-preview`);
    - the new job is green on the PR.
    - Then **ask Mostafa** whether to add `preview-api-image` to the `ci-gate` required checks.
      That is a repo setting outside git; do not change it without a yes.
  - **Commit**: `ci(preview-api): add Dockerfile and image build-and-run job (T015)`.

- [ ] T016 [P] [US4] Write the GCP setup wizard (A49, R15).
  - **Files**: `/scripts/setup-gcp.sh`.
  - **Implement**: generate it with the **`wizard` skill**. It is an interactive bash script that
    Mostafa runs; the agent never runs it. Its steps, in order, each idempotent (check before
    create):
    1. Check that `gcloud` exists. If it is missing, print the official install command and stop.
       Installing system software needs Mostafa's own action.
    2. `gcloud auth login` (it opens a browser).
    3. Create project `markme` (or reuse it), then set it as the default.
    4. Link billing: list accounts, Mostafa picks one.
    5. Budget: $1, alerts at 50/90/100%, emailed to the billing admins.
    6. Enable `run`, `artifactregistry`, `iamcredentials` and `sts`.
    7. Artifact Registry repo `markme` (docker, `europe-west1`) with a cleanup policy that keeps
       the 3 most recent versions and deletes the rest.
    8. Deploy service account `preview-api-deploy`, with `roles/run.admin`,
       `roles/artifactregistry.writer` and `roles/iam.serviceAccountUser` on the runtime service
       account.
    9. WIF pool `github` and provider `markme-repo`, issuer
       `https://token.actions.githubusercontent.com`. Attribute condition:
       `assertion.repository == "MostafaAbuHamed/MarkMe" && (assertion.ref == "refs/heads/main" || assertion.ref.matches("^refs/heads/[0-9]{3}-"))`.
       Bind `roles/iam.workloadIdentityUser` for that repository principal set.
    10. `gh variable set` for `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA` and
        `PREVIEW_API_SUPABASE_URL` (`https://cpvcrpwysjovwohjpxru.supabase.co`). Print each
        value, then print `gh variable list`.
  - **Done when**: `bash -n scripts/setup-gcp.sh` passes, `shellcheck` passes if it is installed,
    and no step needs a secret value or writes one to disk.
  - **Commit**: `chore(preview-api): add GCP setup wizard for Cloud Run deploy (T016)`.

- [ ] T017 [US4] Add the Cloud Run deploy workflow (A46–A48, R15).
  - **Files**: `/.github/workflows/deploy-preview-api.yml`.
  - **Implement**:
    - Triggers:
      - `push` to `main` with `paths: ["apps/preview-api/**", "packages/domain/**", "pnpm-lock.yaml"]`;
      - `workflow_dispatch`.
    - `permissions: { contents: read, id-token: write }`.
    - `concurrency: deploy-preview-api` (no cancel in progress).
    - Steps, with every action pinned by SHA and a version comment, as in `ci.yml`:
      1. checkout;
      2. `google-github-actions/auth` with `workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}`
         and `service_account: ${{ vars.GCP_DEPLOY_SA }}`;
      3. `google-github-actions/setup-gcloud`;
      4. `gcloud auth configure-docker europe-west1-docker.pkg.dev`;
      5. build and push `europe-west1-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/markme/preview-api:${{ github.sha }}`;
      6. `gcloud run deploy markme-preview-api --image … --region europe-west1 --max-instances=1 --min-instances=0 --memory=256Mi --allow-unauthenticated --set-env-vars SUPABASE_URL=${{ vars.PREVIEW_API_SUPABASE_URL }}`;
      7. smoke: read the service URL, check `curl -fsS $URL/healthz`, then check that
         `POST $URL/v1/preview` with no token returns `401`.
    - No `secrets.*` reference anywhere (A47).
  - **Done when**: `actionlint` passes (run it through
    `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7`, or skip it and say so),
    and `grep -n "secrets\." .github/workflows/deploy-preview-api.yml` prints nothing.
  - **Commit**: `ci(preview-api): add Cloud Run deploy workflow via WIF (T017)`.

- [ ] T018 [P] [US4] Document running, configuring and deploying the service.
  - **Files**: `README.md` (new, inside `apps/preview-api/`), `/README.md` (Commands and
    Repository layout lines only), `/CLAUDE.md` ("Current state" paragraph for M3).
  - **Implement**:
    - `apps/preview-api/README.md`:
      - the endpoint (link to the contract);
      - the env table;
      - `pnpm dev` and the curl examples from quickstart V5;
      - the build and the Docker commands from V4;
      - the deploy flow (wizard, then repo variables, then dispatch or push to `main`);
      - a security summary that links PRD 7.3.
    - `CLAUDE.md`: describe M3 as implemented (endpoint, SSRF layer, esbuild build, deploy
      workflow), in the same style as the M1 and M2 paragraphs.
  - **Done when**: `docs-guard` passes. Every command in the README was run once, or is marked
    as needing GCP.
  - **Commit**: `docs(preview-api): document the M3 preview API (T018)`.

**Checkpoint (PR 4)**: open `m3/us4-ship` → `004-m3-preview-api`. Run the guards first.

---

## Phase 7: Polish and exit

- [ ] T019 Make the deploy workflow dispatchable (R17). **Needs Mostafa's approval first.**
  - **Why**: GitHub only dispatches workflows that exist on `main`.
  - **Steps (after a yes)**:
    1. `git switch main && git pull && git switch -c ci/deploy-workflow`.
    2. `git checkout 004-m3-preview-api -- .github/workflows/deploy-preview-api.yml`.
    3. Commit with `ci: add preview API deploy workflow ahead of M3 merge (T019)`.
    4. Open a PR to `main`. The five checks must be green. Mostafa merges it.
  - **Prerequisite**: Mostafa has run `scripts/setup-gcp.sh` (quickstart V7).
  - **Done when**: `gh workflow list` shows "Deploy preview API".

- [ ] T020 Run the exit verification (no code change).
  - **Steps**: quickstart V1–V6 in order:
    - V6 is `gh workflow run deploy-preview-api.yml --ref 004-m3-preview-api`, then the curl
      checks against the Cloud Run URL with a token from the hosted project.
    - Record each result (command and output) in the milestone PR description.
  - **Then**:
    - Mark T001–T020 `[x]` in this file and commit
      `docs(m3): mark T001–T020 done after exit verification (T020)`.
    - Open `004-m3-preview-api` → `main`. Mostafa merges it.
  - **Done when**: every quickstart check matches its expected output and the milestone PR is
    open.

---

## Dependencies & execution order

### Phase dependencies

- **Setup (T001)** comes first.
- **Foundational (T002)** blocks everything: `createApp(options)`, env keys and error codes.
- **US1 (T003–T007)** depends on T002. T003, T004 and T005 touch different modules and may run in
  any order; T004 and T005 are marked [P]. T003 and T004 both edit `src/app.ts`, so commit them
  one after the other. T006 needs T005 (the dns and redirect suites use `isBlockedAddress`).
  T007 needs T006.
- **US2 (T008–T010)** depends on US1: T009 uses `isBlockedAddress`, and T010 uses `SafeFetch`
  and `PreviewFailure`. T009 needs T008 (the cheerio dependency).
- **US3 (T011–T013)** depends on US1 and US2. Order: T011, then T012, then T013.
- **US4 (T014–T018)** depends on US3. T014 comes before T015 (the image copies `server.mjs`).
  T016 and T018 can run alongside T014 and T015. T017 can be written at any point in US4.
- **T019** needs PR 4 merged, Mostafa's approval and the wizard run. **T020** needs T019.

### Story completion order

```text
T001 ─▶ T002 ─▶ US1 (PR 1) ─▶ US2 (PR 2) ─▶ US3 (PR 3) ─▶ US4 (PR 4) ─▶ T019 (PR → main) ─▶ T020 ─▶ milestone PR → main
```

## Parallel examples

```text
# PR 1, after T002 (different files):
T004 src/cors.ts + src/log.ts + tests
T005 src/ssrf/ip-policy.ts + test/ip-policy.test.ts

# PR 4 (different files):
T016 /scripts/setup-gcp.sh
T018 apps/preview-api/README.md, /README.md, /CLAUDE.md
```

Everything else is sequential, because each later task imports the previous one's exports or edits
`src/app.ts`.

## Implementation strategy

- **MVP = PR 1 (US1)**: the SSRF layer and auth, the part that must be right before anything
  fetches. Its tests exist before the fetcher (T006 before T007).
- **Then** PR 2 (what a preview contains), PR 3 (the endpoint M5 calls), and PR 4 (image and
  deploy).
- Stop at each PR checkpoint: the story's independent test must pass in CI before the next story
  branch is created.

## Notes

- `[P]` means different files and no unfinished dependency. `[USn]` maps the task to spec.md.
- Outward-facing steps need Mostafa's yes each time:
  - pushing the milestone branch (T001);
  - changing the `ci-gate` required checks (T015);
  - the PR to `main` (T019);
  - running the wizard (T016, which he runs himself).
- Do not install system software (gcloud, shellcheck, actionlint) without asking.
- If an implementation finding contradicts research R1–R17, stop. Update research.md, plan.md
  and `docs/IMPLEMENTATION_PLAN.md` in the same PR, and tell Mostafa.
