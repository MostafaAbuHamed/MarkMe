# Implementation Plan: Move to Supabase publishable and secret API keys

**Branch**: `005-supabase-api-keys` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-supabase-api-keys/spec.md`

## Summary

Replace the legacy Supabase `anon` key with the publishable key everywhere a client is configured,
before M4 builds the first real client. The extension env variable becomes
`WXT_SUPABASE_PUBLISHABLE_KEY` and only accepts `sb_publishable_…` values; `pnpm dev` copies
`PUBLISHABLE_KEY` from `supabase status` with no anon fallback; the client factory option becomes
`publishableKey`. A new `scripts/check-bundle-secrets.mjs` (planned for M8, built now) fails on
secret keys, `anon`/`service_role` JWTs and the `SERVICE_ROLE` name in a built bundle. Docs name the
publishable key for clients and `SUPABASE_SECRET_KEY` for test-only use. Last, the owner disables
legacy keys on the hosted project and reruns the M3 V6 check. The preview API needs no change: it
verifies user tokens via JWKS and never used a project key.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node 24 ESM scripts (`.mjs` with JSDoc types)

**Primary Dependencies**: `@supabase/supabase-js` ^2.118.0 (unchanged; accepts publishable keys),
zod 4 (env schema), WXT/Vite (`loadEnv`), Supabase CLI 2.121.0 (prints `PUBLISHABLE_KEY`). No new
dependency.

**Storage**: N/A. No migration; RLS and grants unchanged.

**Testing**: Vitest 5 (`apps/extension` env schema, `packages/domain` factory, root
`vitest run --dir scripts` for `dev-env` and the new bundle check). Manual quickstart for the local
and hosted end-to-end checks.

**Target Platform**: Chrome MV3 extension build, local Supabase stack, hosted Supabase project
`markme` (free, `eu-central-1`).

**Project Type**: pnpm + Turborepo monorepo (config, tooling and docs change; no new app or
package).

**Performance Goals**: N/A.

**Constraints**: Never echo key values in errors or findings; never overwrite an existing `.env`;
only the publishable key may reach a client bundle; stay on free tiers; hosted dashboard steps are
manual, never CI.

**Scale/Scope**: ~10 files changed, 1 new script plus its test, 1 decision-log entry, 1 manual
hosted cutover.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle / rule                                                           | Status | Notes                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. RLS on every user-data table, ownership from `auth.uid()`               | Pass   | No schema change. The publishable key maps to the same `anon`/`authenticated` roles (probed locally, research).                                                                                  |
| I. Secrets only in env / host store; service-role key never in a bundle    | Pass   | Strengthened: validation refuses secret and legacy keys; the bundle check fails on `sb_secret_…` keys, `anon`/`service_role` JWTs and `SERVICE_ROLE`. No hosted secret key is created or stored. |
| I. SSRF rules, preview API auth                                            | Pass   | Preview API untouched (FR-008); still JWKS/ES256.                                                                                                                                                |
| II. Shared factory, no shared client instance                              | Pass   | Only the factory's option name changes; behavior and the separate-client rule stay.                                                                                                              |
| III. Required tests; bug fixes start with a failing test; never weaken     | Pass   | Env-schema, dev-env and factory tests are updated to the new key, not loosened: the schema test adds rejections (JWT, secret key). New tests for the bundle check, written before the script.    |
| IV. Simple First: no new dependency, service or abstraction without reason | Pass   | No dependency. The bundle-check script was already planned (M8); built now because FR-006 needs it (research R6). No special-case code for the old variable name (R3). No new CI job (R6).       |
| V. Data integrity                                                          | N/A    | No data path changes.                                                                                                                                                                            |
| VI. Quality UX                                                             | N/A    | No UI.                                                                                                                                                                                           |
| Free tiers only                                                            | Pass   | Publishable/secret keys are on every plan.                                                                                                                                                       |
| Workflow: own branch, one commit per task, one PR per user story           | Pass   | Feature branch `005-supabase-api-keys`; PRs per story (US1, US2, US4 code/docs; US3 is a recorded manual step plus a docs commit).                                                               |
| `pnpm dev` keeps working after every merge                                 | Pass   | US1 changes the generator and schema in one PR so a fresh checkout works at every merge. Existing `.env` files fail loudly with the fix (R3, quickstart).                                        |

**Post-design re-check**: Pass. The design adds one script (already planned for M8) and no
abstractions; no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/005-supabase-api-keys/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R11
├── data-model.md        # Phase 1: key kinds, env variables, finding kinds
├── quickstart.md        # Phase 1: local + hosted validation
├── contracts/
│   ├── extension-env.md        # WXT_SUPABASE_PUBLISHABLE_KEY rule and messages
│   ├── client-factory.md       # createMarkMeClient options
│   ├── dev-env-generator.md    # status → .env mapping
│   └── bundle-secret-check.md  # scanner rules, CLI, exit codes
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/extension/
├── .env.example                     # WXT_SUPABASE_PUBLISHABLE_KEY (US1)
└── src/lib/
    ├── env-schema.ts                # rename + sb_publishable_ rule (US1, US2)
    └── env-schema.test.ts           # new fixtures, wrong-kind rejections (US1, US2)

apps/preview-api/README.md           # token steps use the publishable key, no Bearer key (US4)

packages/domain/src/client/
├── factory.ts                       # anonKey → publishableKey (US1)
└── factory.test.ts

scripts/
├── dev-env.mjs                      # PUBLISHABLE_KEY allowlist, no anon fallback (US1)
├── dev-env.test.mjs
├── check-bundle-secrets.mjs         # NEW: scanner + CLI (US2)
└── check-bundle-secrets.test.mjs    # NEW (US2)

docs/IMPLEMENTATION_PLAN.md          # §1.4 env table, M4 factory calls, perf script, M8 prod config
                                     # and bundle check, A31 update, new A55 (US4)
CLAUDE.md                            # one line on keys (US4)
```

**Structure Decision**: No new package or app. Changes stay in the files that own each concern:
the extension owns its env schema, `packages/domain` owns the factory, root `scripts/` owns dev and
release tooling (where `dev-env.mjs` and its root Vitest run already live).

## Delivery order

1. **US1 (P1)**: schema rename + `.env.example` + `dev-env.mjs` + factory option, with tests, in
   one PR so `pnpm dev` works on every merge.
2. **US2 (P1)**: strict `sb_publishable_` rule and wrong-kind tests; bundle-check script, tests
   first. Can share US1's PR only if small; otherwise its own PR.
3. **US4 (P3)**: docs and decision log (A55, A31). Before US3 because US3's precondition is "every
   component and doc uses the publishable key".
4. **US3 (P2)**: owner's hosted cutover per quickstart H1–H5; record the result in tasks.md.

## Risks

- **Library contains `sb_secret_`**: `supabase-js` ships the bare prefix; the scanner requires a
  full key (research R6) and a test pins it.
- **Hosted key shape differs from local**: the validation regex allows any length ≥ 20 after the
  prefix and base64url characters; quickstart H1 checks the hosted key against the schema before
  any cutover.
- **Something still sends a project key as Bearer**: only the README did; fixed in US4. After
  legacy keys are off, any leftover fails loudly (401), and the rollback is re-enabling legacy keys
  in the dashboard.

## Complexity Tracking

No violations.
