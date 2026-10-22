# Implementation Plan: M2 Domain Package

**Branch**: `003-m2-domain-package` | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-m2-domain-package/spec.md`. Technical design from
`docs/IMPLEMENTATION_PLAN.md` §3 M2 and §4 (A5, A17, A19, A21–A36, approved).

## Summary

M2 fills `packages/domain` with the business rules every app shares. It changes no app and adds
no table.

- **Links** (`src/url/`):
  - `normalizeUrl` returns the original link plus the canonical duplicate key, or one of four
    error codes (A21). It builds the key from WHATWG `URL` parts (R1); tracking parameters are
    removed from the raw query text (A23, A25, R3).
  - `parseUserUrl` handles the paste field (A22).
  - `detectProvider` and `extractYouTubeId` share `YOUTUBE_ID_PATTERN` with the M1 check (A26).
- **Classification**: `detectMediaType` applies the six-step precedence (A27).
- **Validation**: zod 4 schemas read from one `LIMITS` object (A30). The enums are built from
  `@markme/database` `Constants` (A34). `httpUrl` is built on the normalizer (A33), and there are
  preview request/response/error schemas (A35).
- **Client**: `createMarkMeClient` lives on a separate `@markme/domain/client` entry, so the
  preview API never loads `supabase-js`. Its security options are fixed (A31).
- **Quality gate**: table-driven Vitest suites. `@vitest/coverage-v8` enforces 100%
  lines/branches on `src/url/**` inside the existing CI `test` check (A32).

## Technical Context

**Language/Version**: TypeScript 6.0 (strict, `exactOptionalPropertyTypes`), ESM, run on Node 24
(tests, preview API) and Chromium (extension). The domain tsconfig adds the `DOM` lib for `URL`
types (R10).

**Primary Dependencies**:

- Existing: zod 4.
- New: `@markme/database` (`workspace:*`, for `Constants` and types) and
  `@supabase/supabase-js` `^2.118.0` (client subpath only).
- New dev dependency: `@vitest/coverage-v8` 5.0.5.

Each new dependency has a stated reason (contract "Dependencies"; A31, A32, A34).

**Storage**: N/A. M2 has no persistence. The client factory takes an app-supplied `AuthStorage`.

**Testing**: Vitest 5.0.5 unit tests, `it.each` over the spec tables, plus `expectTypeOf` for
enum types. Coverage uses v8, with thresholds on `src/url/**`. No network, Docker or `.env`.

**Target Platform**: A library consumed by `apps/extension` (MV3, Chromium) and
`apps/preview-api` (Node 24, Docker). Later `apps/web` and `apps/mobile` use it too.

**Project Type**: An internal workspace library (`packages/domain`) in the pnpm + Turborepo
monorepo.

**Performance Goals**: No budget of its own. The functions are synchronous, linear-time string
work on input of at most 2,048 characters. The rules entry must stay small for the popup's
< 300 ms budget (constitution VI), which is why `supabase-js` sits behind the subpath.

**Constraints**:

- No module-level Supabase client (constitution II).
- No `supabase-js` import outside `src/client/` (lint-enforced).
- The enum values are never copied by hand.
- The canonical-link rules are close to permanent once M5 stores keys (A17).

**Scale/Scope**:

- ~11 source files and ~11 test files.
- 2 entry points; 3 new dependencies.
- 4 user stories delivered as 4 PRs.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below)._

| Principle / constraint                                                               | How M2 complies                                                                                                                                       | Status |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I. Embeds only from allowlisted providers, stored as provider + validated id         | `previewResponse.embed` = `{ provider: embed_provider, id }`, with `id` checked by `YOUTUBE_ID_PATTERN`, the same rule as the M1 check. No HTML field | ✅     |
| I. Ownership never from the client                                                   | No schema has a `userId`. Unknown keys are stripped (R8)                                                                                              | ✅     |
| I. Clients never fetch arbitrary pages; SSRF in the preview API                      | M2 fetches nothing. IPv6/private hosts normalize, and blocking them stays in M3 (spec edge cases)                                                     | ✅     |
| I. Secrets: service-role key never in a client bundle                                | The factory takes only the public `anonKey`. No service-role path exists                                                                              | ✅     |
| II. `packages/domain` owns models, zod schemas, URL normalization, media types       | All of these live here. M3 adapters and M6 embeds import them (A26)                                                                                   | ✅     |
| II. Share the factory, never one client; each app passes its own storage             | `createMarkMeClient` returns a new client per call, with no module state, and takes `AuthStorage`. A test asserts two calls → two clients             | ✅     |
| II. Business rules not in apps when another app needs them                           | Normalizer, provider, media type, limits and preview schemas are shared by M3 and M5/M6                                                               | ✅     |
| III. Domain unit tests: normalization edge-case tables, schemas, media types         | `normalize`, `parse-user-url`, `provider`, `media-type` and per-schema tests over every spec table. 100% coverage gate on `src/url/**`                | ✅     |
| III. Never weaken a test                                                             | The coverage gate is part of the `test` script and cannot be skipped in CI                                                                            | ✅     |
| IV. No new dependency without a stated reason                                        | Three new ones, each with a reason (contract "Dependencies"). `@vitest/coverage-v8` is pinned to the Vitest version                                   | ✅     |
| IV. Simple first / YAGNI                                                             | No row mapping (M5), no provider-alias merging (A24), no adapters. Plain functions plus zod                                                           | ✅     |
| V. No duplicate URLs: unique `(user_id, normalized_url)` using the shared normalizer | One normalizer. Its output is idempotent (R2) and fits the M1 check (`^https?://`, ≤ 2048)                                                            | ✅     |
| V. Save never blocks on preview                                                      | `previewStatus` exported. The flow itself is M5                                                                                                       | ✅ n/a |
| VI. Quality UX                                                                       | No UI. Error codes (`has_credentials`, `too_long`, …) let M5 show a specific reason. Small rules entry for the popup budget                           | ✅ n/a |
| Tech: TypeScript strict, pnpm + Turborepo, free tiers                                | Yes. No service added                                                                                                                                 | ✅     |
| Workflow: one commit per task, one PR per user story; `pnpm dev` keeps working       | PRs US1 → US2 → US3 → US4 into `003-m2-domain-package` (A36). No app or dev-script change                                                             | ✅     |

**Gate result: PASS.** No violations, so Complexity Tracking is empty.

**Post-design re-check (after Phase 1): PASS.** The design added one lint guard, one tsconfig lib
entry and the idempotence invariant. It adds no dependency or abstraction beyond the approved
three.

**Deviations from `docs/IMPLEMENTATION_PLAN.md`** (not constitution violations; copied back into
that file in this change, per its change rule):

1. All trailing slashes are stripped, not one, so the normalizer is idempotent (R2).
2. Empty query segments (`&&`, leading or trailing `&`) are dropped; keys are matched without
   percent-decoding (R3).
3. Provider hosts include `www.instagram.com`, `www.x.com` and `www.twitter.com` (R5).
4. The fixed error order is parse → scheme → credentials → length (R4). `httpUrl` reports the code
   in `issue.params.code`, read through `urlErrorCode` (R8).
5. Preview link fields (`url`, `imageUrl`, `faviconUrl`) are checked with `normalizeUrl(...).ok`
   and kept as given (R8).
6. The domain tsconfig adds the `DOM` lib (R10). An ESLint guard keeps `supabase-js` inside
   `src/client/` (R11).

## Project Structure

### Documentation (this feature)

```text
specs/003-m2-domain-package/
├── plan.md                     # this file
├── research.md                 # Phase 0: R1–R12
├── data-model.md               # Phase 1: values, rules, tables
├── quickstart.md               # Phase 1: validation runbook V1–V7
├── contracts/
│   └── domain-package.md       # entry points, signatures, dependencies, files
├── checklists/requirements.md
└── tasks.md                    # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root, end of M2)

```text
packages/domain/
├── package.json                # exports "." and "./client"; 3 new deps; test runs coverage
├── tsconfig.json               # + DOM lib
├── eslint.config.mjs           # import guard for supabase-js (or a glob in @markme/config)
├── vitest.config.ts            # coverage gate
└── src/
    ├── index.ts                # rules entry
    ├── url/                    # normalize, parse-user-url, provider (+ tests) — 100% gate
    ├── media-type.ts           # (+ test)
    ├── schemas/                # limits, enums, http-url, text, item, preview (+ tests)
    └── client/                 # factory (+ test), reached only via @markme/domain/client
docs/IMPLEMENTATION_PLAN.md     # M2 deviations 1–6 copied back; changelog entry
```

The full file list is in [contracts/domain-package.md](contracts/domain-package.md#files).

**Structure Decision**: All code stays in `packages/domain`. `packages/database` is consumed, not
changed. No app imports the new exports in M2; M3 and M4 are their first users.

### Task shape

| PR (story)              | Tasks (one commit each)                                                                                                                     | Depends on                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| US1 Link normalization  | Coverage dependency + gate config + DOM lib; `normalizeUrl` with rule, tracking, edge and idempotence tables; `parseUserUrl` with its table | M0/M1                                                   |
| US2 Link classification | `detectProvider` + `extractYouTubeId` + `YOUTUBE_ID_PATTERN`; `@markme/database` dependency + `detectMediaType`                             | M0/M1 (lands after US1: shares `src/url/` and the gate) |
| US3 Validation rules    | `LIMITS` + enums; `httpUrl` + text schemas; item schemas; preview schemas                                                                   | US1, US2                                                |
| US4 Client factory      | `supabase-js` dependency + `./client` export + lint guard; `createMarkMeClient` + `AuthStorage` + tests; entry-isolation test               | M0/M1                                                   |

`/speckit-tasks` produces the authoritative list. Tests come before code in each task (spec
FR-019).

## Complexity Tracking

No constitution violations. Nothing to justify.
