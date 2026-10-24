# Implementation Plan: M3 Preview API

**Branch**: `004-m3-preview-api` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-m3-preview-api/spec.md`. Technical design from
`docs/IMPLEMENTATION_PLAN.md` §3 M3 and §4 (A6, A19, A26, A37–A50, approved).

## Summary

M3 turns `apps/preview-api` from a `/healthz` stub into the only place in MarkMe that fetches
arbitrary links. It exposes one endpoint, `POST /v1/preview`, for signed-in users.

- **Safe fetch** (`src/ssrf/`):
  - Every hop checks scheme, port and address against an "only public unicast" policy built on
    `ipaddr.js` (R5).
  - The connection is pinned to the checked IP through an undici `Agent` lookup (R3).
  - Up to 3 redirects, each re-checked. One 5 s deadline in total (R4). A 2 MB cap on
    decompressed bytes.
  - Content types are allowed per call. No cookies; a fixed user agent.
- **Preview building**:
  - Parsing: `cheerio` metadata with charset detection through `TextDecoder` (R9), and sanitizing
    to the shared `LIMITS` (R10).
  - Providers: oEmbed adapters for YouTube, X and Instagram, each falling back to the page (R12).
    YouTube returns provider + id only.
- **Endpoint**:
  - Request order: CORS allowlist (R13), then IP limiter, then 4 KB body, then ES256 JWKS auth
    (R7), then user and force limiters (R8), then zod, then the pipeline.
  - Previews are cached for 24 h in an LRU (R11).
  - Every request writes one JSON log line that names the target host only (R14).
- **Ship**:
  - Build: esbuild bundles the service into one runnable file (R1); `tsc` alone cannot run the
    workspace's TS packages.
  - Image: a `node:24-slim` image that runs as `node`.
  - CI: an image job.
  - Deploy: a Cloud Run deploy through WIF from `main` or a milestone branch, plus a wizard for the
    console-only GCP steps (R15).

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), ESM, Node 24.22 (`.nvmrc`). Express 5.3 (already a
dependency).

**Primary Dependencies**:

- Existing: `express` ^5.3.0, `zod` ^4.6.7, `@markme/domain` (`previewRequest`,
  `previewResponse`, `PREVIEW_ERROR_CODES`, `LIMITS`, `normalizeUrl`, `detectProvider`,
  `extractYouTubeId`, `detectMediaType`, `parseEnv`).
- New runtime, each pinned exactly (R2): `jose` 6.2.12, `ipaddr.js` 2.5.0, `undici` 8.11.2,
  `cheerio` 1.2.0, `lru-cache` 11.5.3, `express-rate-limit` 8.7.1.
- New dev: `esbuild` 0.28.2.

Each has a stated reason (contract "Dependencies").

**Storage**: In-memory only. The LRU preview cache and the rate-limit counters live per instance
and are lost on scale to zero (accepted, PLAN M3). No database access: the service only fetches
the Supabase JWKS.

**Testing**:

- Vitest 5.0.5 with `supertest` 7.3.1.
- Local `http.createServer` targets on `127.0.0.1`, reached through an injected allow-all policy
  in the limits suites only (R6).
- A scripted resolver for the DNS and rebinding cases.
- ES256 test tokens from `jose`, verified with `createLocalJWKSet`.
- A fake `SafeFetch` for the oEmbed adapters.
- HTML fixtures, including a `windows-1256` page.
- No network, Docker or `.env` in unit tests.

**Target Platform**:

- Linux container `node:24-slim` on Google Cloud Run (`europe-west1`, IPv4 egress).
- Locally, `tsx watch` through `pnpm dev`.

**Project Type**: An HTTP web service (`apps/preview-api`) in the pnpm + Turborepo monorepo.

**Performance Goals**:

- A cache hit answers without any outbound request.
- A cache miss is bounded by the 5 s total deadline.
- No throughput target. Max one instance at concurrency 80 is enough for manual saves (A38, A48).

**Constraints**:

- The SSRF rules of PRD 7.3 and constitution I, without exception.
- 256 MiB memory. 80 concurrent × 2 MB of body is a **lower bound** of about 160 MB. Parsed DOMs
  (a few times the HTML), the LRU (5,000 small previews, a few MB) and Node's baseline
  (~60 MB) sit on top of it. That is tight only at the theoretical 80-request peak, which
  manual saves never reach (A38). If memory alerts fire, lower `--concurrency`, not the 2 MB cap.
- Free tiers only, with a $1 budget alert (A49).
- No secrets in git or GitHub secrets: WIF plus repository variables (A47).
- `pnpm dev` keeps working.

**Scale/Scope**:

- About 17 source files and 15 test files.
- 6 runtime dependencies and 1 dev dependency.
- 1 CI job and 1 deploy workflow.
- 1 wizard script.
- 4 user stories as 4 PRs (A50).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below)._

| Principle / constraint                                                                     | How M3 complies                                                                                                                                               | Status |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I. Ownership from the verified JWT, never a submitted id                                   | `userId = payload.sub` after `jwtVerify` (ES256, `iss`, `aud`). The body has no user field, and unknown keys are stripped (R7)                                | ✅     |
| I. Clients never fetch arbitrary pages; all fetching in `apps/preview-api`                 | `safeFetch` is the only outbound path. oEmbed endpoints go through it too (R12). The extension only calls `/v1/preview` (M5)                                  | ✅     |
| I. http/https, ports 80/443                                                                | Checked on every hop before resolve (FR-006); `scheme-port` suite                                                                                             | ✅     |
| I. DNS resolve; block private, loopback, link-local, CGNAT, multicast, metadata, v4 and v6 | Any non-`unicast` address plus the explicit CIDR list. Mixed answers are refused. Encoded IPv4 is caught by the WHATWG parse (R5); `ip-policy` + `dns` suites | ✅     |
| I. Connect to the validated IP; re-validate every redirect                                 | Pinned `connect.lookup` per hop. Manual redirects, each re-checked (R3); rebinding + `redirect` suites                                                        | ✅     |
| I. Max 3 redirects, 5 s, 2 MB                                                              | Hop counter; one `AbortSignal.timeout` for all hops (R4); counter on decompressed bytes; `limits` suite                                                       | ✅     |
| I. Content-type allowlist                                                                  | Default `text/html`, `application/xhtml+xml`, `image/*`; JSON only for fixed oEmbed endpoints; `limits` suite                                                 | ✅     |
| I. No cookies; fixed User-Agent                                                            | No cookie jar; headers built from constants; `headers` suite                                                                                                  | ✅     |
| I. Per-user and per-IP rate limits                                                         | IP before auth, user after it, plus force (R8); `app` suite                                                                                                   | ✅     |
| I. Sanitized output; embeds as provider + validated id, never HTML                         | `sanitizeText` on every string, then `previewResponse.parse`. Embed only `{ youtube, id }` with `YOUTUBE_ID_PATTERN` (R10, R12)                               | ✅     |
| I. SSRF tests before the fetcher                                                           | T2 commits all six suites with executed bodies (`it.fails` against a stub); T3 adds the fetcher and turns them on (R16)                                       | ✅     |
| I. Secrets only in env files / host secret store; none in git                              | No secret exists in v1. WIF instead of a key; ids are repository variables. `META_OEMBED_TOKEN` would come through `--set-secrets` (A47)                      | ✅     |
| II. Shared contracts from `packages/domain`                                                | Request, response, error codes, limits, URL, provider and media-type rules are all imported, never redefined. No Supabase client in the service               | ✅     |
| III. Preview API tests: SSRF, limits, parsing fixtures, oEmbed, rate limits                | One suite per area (contract "Files"); every spec scenario is mapped to a case                                                                                | ✅     |
| III. Never skip or weaken a test                                                           | `it.fails` → `it` only makes tests stricter. The production policy has its own suite that blocks loopback                                                     | ✅     |
| IV. No new dependency without a stated reason                                              | 7 new ones, each with a reason. `cors` and a logging library are deliberately not added (R13, R14)                                                            | ✅     |
| IV. No microservices beyond the preview API                                                | Only the preview API. No Redis or queue: in-memory state, accepted for v1                                                                                     | ✅     |
| IV. YAGNI                                                                                  | No per-user cache, no shared limiter store, no NAT64 embedded-address logic (R5), no secret store entries                                                     | ✅     |
| V. Save never blocks on preview                                                            | The service is stateless toward items. The `pending` → `ok`/`failed` flow is M5                                                                               | ✅ n/a |
| VI. Quality UX                                                                             | No UI. Stable error codes let M5 show a specific message                                                                                                      | ✅ n/a |
| Tech: Express in Docker on Cloud Run; free tiers                                           | Yes. A billing account is required by Cloud Run even on the free tier; Mostafa approved it with a $1 alert (A49)                                              | ✅     |
| Workflow: one commit per task, one PR per story; `pnpm dev` keeps working                  | US1 → US4 into `004-m3-preview-api` (A50). `pnpm dev` still runs `tsx watch src/server.ts`                                                                    | ✅     |

**Gate result: PASS.** No violations, so Complexity Tracking is empty.

**Post-design re-check (after Phase 1): PASS.**

- The design added the esbuild build (R1). It replaces a build that could not run, so it removes
  a defect rather than adding complexity.
- It added exact version pins (R2) and a stricter NAT64/6to4 rule (R5).
- None of these adds a service or an abstraction beyond the approved modules.

**Deviations from `docs/IMPLEMENTATION_PLAN.md`** (not constitution violations; copied back into
that file in this change, per its change rule):

1. `build` is an esbuild bundle (`dist/server.mjs`), not `tsc`/`tsup`. The runtime image copies
   one file and has no `pnpm deploy` (R1).
2. New runtime dependencies are pinned exactly, at versions at least 14 days old (R2).
3. NAT64 (`64:ff9b::/96`, `64:ff9b:1::/48`), 6to4 and Teredo are blocked outright, with no check
   of the embedded IPv4 (R5).
4. `oembed.test.ts` uses a fake `SafeFetch` rather than undici `MockAgent` (R12).
5. M3-T2 lands the `safe-fetch` suites as `it.fails` against a stub, not `it.todo` (R16).
6. CORS is a small in-app middleware, without the `cors` package (R13).
7. The IP limiter runs before the body parser, so oversized or malformed bodies count against the
   IP bucket too. This still satisfies A38 ("IP before auth").
8. Timeout detection reads the shared signal, not undici's error type. A 2xx without
   `Content-Type` → `fetch_failed` (R4).

## Project Structure

### Documentation (this feature)

```text
specs/004-m3-preview-api/
├── plan.md                     # this file
├── research.md                 # Phase 0: R1–R16
├── data-model.md               # Phase 1: in-memory entities, fetch states, limits, log line
├── quickstart.md               # Phase 1: validation runbook V1–V7
├── contracts/
│   └── preview-api.md          # HTTP contract, internal seams, env, dependencies, files
├── checklists/requirements.md
└── tasks.md                    # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root, end of M3)

```text
apps/preview-api/
├── Dockerfile, README.md
├── package.json                # esbuild build; 6 runtime + 1 dev dependency
├── src/
│   ├── server.ts, app.ts, env.ts, errors.ts
│   ├── auth.ts, cors.ts, log.ts, ratelimit.ts, cache.ts, pipeline.ts
│   ├── ssrf/                   # ip-policy, resolve, safe-fetch
│   ├── parse/                  # html-metadata, sanitize
│   └── oembed/                 # index, youtube, x, instagram
└── test/                       # one suite per module + helpers + fixtures
.github/workflows/ci.yml                  # + preview-api-image job
.github/workflows/deploy-preview-api.yml  # new
scripts/setup-gcp.sh                      # wizard
docs/IMPLEMENTATION_PLAN.md               # deviations 1–6; changelog
```

The full file list is in [contracts/preview-api.md](contracts/preview-api.md#files).

**Structure Decision**:

- All service code stays in `apps/preview-api`. `packages/domain` is consumed, not changed: every
  shape and rule M3 needs already exists from M2.
- Repo-level additions are the CI job, the deploy workflow and the wizard.

### Task shape

| PR (story)       | Tasks (one commit each)                                                                                                                                                                                                                                 | Depends on |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| US1 Secure fetch | **T1** env keys + error mapper + CORS + 4 KB body + `log.ts` + ES256 JWKS auth (+ tests). **T2** `ip-policy.ts` + its suite green; five `safe-fetch` suites as `it.fails` against a stub. **T3** `resolve.ts` + `safe-fetch.ts`; suites flipped to `it` | M1, M2     |
| US2 Metadata     | **T4** `sanitize.ts` + `html-metadata.ts` + fixtures (charset, relative URLs, private image hosts). **T5** oEmbed adapters (YouTube embed id, X/Instagram blockquote text, fallback, optional token)                                                    | US1        |
| US3 Endpoint     | **T6** cache + pipeline + `POST /v1/preview` + `app.test.ts` (status map, cache hit, direct image, empty page, logs). **T7** IP/user/force limiters + `Retry-After` + tests                                                                             | US1, US2   |
| US4 Ship         | **T8** esbuild build + Dockerfile + `.dockerignore` + `preview-api-image` CI job (build + `/healthz` run). **T9** `setup-gcp.sh` wizard + `deploy-preview-api.yml` (WIF, SHA tag, cleanup policy, smoke) + README                                       | US3        |

Close-out (milestone branch, before merging to `main`):

- update the `CLAUDE.md` current-state paragraph;
- run the quickstart V6 deploy check.

`/speckit-tasks` produces the authoritative list. Tests come before code in each task (spec
FR-028, FR-029).

## Complexity Tracking

No constitution violations. Nothing to justify.
