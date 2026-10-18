# Implementation Plan: M0 Monorepo Foundation

**Branch**: `001-m0-monorepo-foundation` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-m0-monorepo-foundation/spec.md`. Technical
design from `docs/IMPLEMENTATION_PLAN.md` §1 and §3 M0 (approved).

## Summary

M0 sets up a pnpm + Turborepo monorepo:

- `apps/extension` (WXT + React popup placeholder) and `apps/preview-api` (Express with only
  `GET /healthz`).
- `packages/{config,domain,database}`.
- One root command, `pnpm dev`. It checks prerequisites, reuses or starts local Supabase (the CLI
  is a pinned dev dependency), creates any missing `.env` from the example plus the stack's public
  values, prints every address, and runs both apps through Turbo.
- Each app validates its config with a zod 4 schema through one shared `parseEnv` helper. On
  failure it lists every bad key, never prints values, and stops before work: before `listen`, or
  at extension build-config time.
- GitHub Actions runs five separately required checks on every PR: `lint`, `typecheck`, `test`,
  `db` (real local Supabase + pgTAP + type-drift check) and `secrets` (pinned gitleaks CLI over
  every PR commit). There are no stored secrets, and Turbo results are cached with
  `actions/cache`. A repository ruleset blocks merges on `main` and the milestone branches.

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict; not 7, see research R3) on Node.js 24 LTS (R1).

**Primary Dependencies** (every one was already approved in IMPLEMENTATION_PLAN §1.1 unless marked
new; reasons in [research.md](research.md)):

- pnpm 12.14.0 (R2) and Turborepo 2.11.
- ESLint 9.39 + typescript-eslint 8.71 + react-hooks 7 + jsx-a11y 6.10 + eslint-config-prettier
  (R4). Prettier 3.9.
- zod 4.6 (R5). Vitest 5.0 (R14).
- Express 5.3 + tsx 4 (R15).
- WXT 0.21 + @wxt-dev/module-react + React 19 (R16).
- **new**: `supabase` CLI 2.121 as a dev dependency (R8), and `supertest` 7 (from M3's list,
  earlier; R14).
- gitleaks 8.30.1 binary, CI only (R12).

**Storage**: local Supabase Postgres via the CLI and Docker. No tables in M0 (FR-024). There is
one smoke pgTAP test.

**Testing**:

- Vitest in `domain`, `preview-api` and `extension`: the env helper, env schemas, `/healthz`, and
  a placeholder.
- pgTAP through `supabase test db`.
- CI deliberate-fault PRs (SC-003).

**Target Platform**:

- Contributor machines: Linux (verified), with Docker Engine.
- CI: GitHub-hosted `ubuntu-latest`.
- Extension: Chromium MV3, loaded unpacked.
- Preview API: Node 24 (Cloud Run comes in M3).

**Project Type**: a monorepo with a browser extension, a small web service and shared libraries.

**Performance Goals**:

- First `pnpm dev` < 15 min; later runs < 2 min (SC-001).
- A clean PR passes all checks in < 10 min (SC-004).

**Constraints**:

- Free tiers only. No stored CI secrets (FR-016). No remote cache (R6).
- The extension config holds only public values (FR-022).
- `.env` files are never committed or overwritten (FR-007a, FR-021).

**Scale/Scope**:

- 2 apps, 3 packages, 1 workflow with 5 jobs, about 40 files.
- No product features.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below)._

| Principle / constraint                                                                                           | How M0 complies                                                                                                                                                                                                                           | Status |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I. RLS on every user-data table                                                                                  | No tables in M0; the pgTAP harness is ready for M1 (FR-014, SC-007)                                                                                                                                                                       | ✅ n/a |
| I. Ownership from `auth.uid()`                                                                                   | No data access in M0                                                                                                                                                                                                                      | ✅ n/a |
| I. Preview fetching only in `apps/preview-api`; SSRF tests first                                                 | No fetcher in M0. The API has only `/healthz` (FR-008)                                                                                                                                                                                    | ✅ n/a |
| I. Secrets only in env and secret store; service-role key never in a client; none in git                         | `.env*` git-ignored except `.env.example`. `dev.mjs` copies only `API_URL` and `ANON_KEY` (allowlist). The extension schema is locked to three public keys by a test. gitleaks runs on every PR commit. Error messages never print values | ✅     |
| II. Package ownership (`database` = migrations/types, `domain` = zod/rules, `config` = tsconfig/ESLint/Prettier) | As listed. `parseEnv` is a zod helper, so it lives in `domain`; `config` stays tooling-only (R11)                                                                                                                                         | ✅     |
| II. No shared Supabase client instance; factory only                                                             | No client is created in M0. The factory arrives in M2                                                                                                                                                                                     | ✅ n/a |
| III. Required tests; never weaken tests                                                                          | The placeholder unit test, env tests for every key (SC-005), the `/healthz` test and the pgTAP smoke test. CI fails on any failure                                                                                                        | ✅     |
| IV. Simple first; every new dependency has a reason                                                              | The two additions (`supabase` dev dep, `supertest`) are justified in R8 and R14. No `dotenv` (Node built-in), no `concurrently` (Turbo), no env library (R11). Tool majors follow peer constraints, not novelty (R3, R4)                  | ✅     |
| IV. YAGNI, non-goals out                                                                                         | No web or mobile apps (FR-001). No permissions in the manifest. `SUPABASE_URL` in the API is the only forward key, kept because M3 needs it and US-3 needs a required URL                                                                 | ✅     |
| V. Data integrity                                                                                                | No data in M0                                                                                                                                                                                                                             | ✅ n/a |
| VI. Quality UX                                                                                                   | The popup is a non-product placeholder. `frontend-design`/`impeccable` apply from M4. Contributor UX is one-line errors with fixes                                                                                                        | ✅     |
| Tech: pnpm + Turborepo, strict TS, layout `apps/*`, `packages/*`                                                 | Yes                                                                                                                                                                                                                                       | ✅     |
| Tech: WXT + React MV3, minimal permissions                                                                       | WXT 0.21 + React 19, zero permissions in M0                                                                                                                                                                                               | ✅     |
| Tech: Express, Supabase CLI + Docker locally                                                                     | Yes                                                                                                                                                                                                                                       | ✅     |
| Workflow: one branch per milestone, one commit and one PR per task, CI on every PR, `pnpm dev` keeps working     | The ruleset covers `main` + `[0-9][0-9][0-9]-*`. The CI triggers on all PR bases                                                                                                                                                          | ✅     |
| Free tiers                                                                                                       | Public repo; GitHub Actions free; no remote cache or paid service                                                                                                                                                                         | ✅     |

**Gate result: PASS.** There are no violations, so Complexity Tracking is empty.

**Deviations from `docs/IMPLEMENTATION_PLAN.md`** (not constitution violations; copied back into
that file in this change, per its change rule):

1. Node 24 instead of 22 (R1).
2. TS 6.0 named explicitly, and Vitest 5 instead of 3 (R3, R14).
3. Five CI jobs instead of one `quality` job (R7).
4. Supabase CLI as a pinned dev dependency instead of `supabase/setup-cli` (R8).
5. gitleaks CLI instead of `gitleaks-action` (R12).
6. Open items settled: zod 4, no remote cache.

## Project Structure

### Documentation (this feature)

```text
specs/001-m0-monorepo-foundation/
├── plan.md              # this file
├── research.md          # Phase 0: R1–R18
├── data-model.md        # Phase 1: config, EnvError, checks, local stack
├── quickstart.md        # Phase 1: validation runbook V1–V5
├── contracts/
│   ├── app-config.md            # per-app keys, formats, fill rules
│   ├── env-helper.md            # parseEnv / EnvError API + message format
│   ├── preview-api.openapi.yaml # GET /healthz
│   ├── ci-checks.md             # the five jobs, ruleset, fault proofs
│   └── root-commands.md         # root scripts + pnpm dev output/failures
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root, end of M0)

```text
.
├── .github/workflows/ci.yml          # lint, typecheck, test, db, secrets
├── .nvmrc                            # 24
├── .gitignore                        # existing; T1 re-anchors the supabase/.temp + .branches entries
├── .gitleaks.toml                    # default rules + local-demo-key/placeholder allowlist
├── .prettierrc.mjs  .prettierignore  # re-export @markme/config/prettier
├── eslint.config.mjs                 # re-exports @markme/config/eslint
├── package.json                      # packageManager, engines, root scripts, supabase/turbo/prettier devDeps
├── pnpm-workspace.yaml               # apps/*, packages/*, engineStrict, build allowlist
├── pnpm-lock.yaml
├── turbo.json                        # build, dev, lint, typecheck, test
├── README.md                         # prerequisites + setup steps (FR-010)
├── scripts/
│   ├── dev.mjs                       # pnpm dev orchestration (R17)
│   ├── dev-env.mjs                   # pure .env fill logic (allowlist, never overwrite), imported by dev.mjs
│   └── dev-env.test.mjs              # Vitest, run by root `pnpm test` after turbo (FR-007a is security-relevant)
├── apps/
│   ├── extension/                    # @markme/extension
│   │   ├── package.json  wxt.config.ts  tsconfig.json  vitest.config.ts  .env.example
│   │   ├── entrypoints/popup/{index.html,main.tsx,App.tsx}
│   │   └── src/lib/{env.ts,env.test.ts}
│   └── preview-api/                  # @markme/preview-api
│       ├── package.json  tsconfig.json  tsconfig.build.json  vitest.config.ts  .env.example
│       ├── src/{app.ts,server.ts,env.ts}
│       └── test/{healthz.test.ts,env.test.ts}
└── packages/
    ├── config/                       # @markme/config
    │   ├── package.json
    │   ├── tsconfig/{base.json,node.json,react.json}
    │   ├── eslint/index.js
    │   └── prettier/index.js
    ├── database/                     # @markme/database
    │   ├── package.json  tsconfig.json
    │   ├── supabase/{config.toml,seed.sql,migrations/.gitkeep,tests/000-smoke.test.sql}
    │   └── src/{index.ts,types.gen.ts}
    └── domain/                       # @markme/domain
        ├── package.json  tsconfig.json  vitest.config.ts
        └── src/{index.ts,index.test.ts,env/{parse-env.ts,parse-env.test.ts}}
```

**Structure Decision**:

- The constitution layout, limited to what v1 M0 needs. `apps/web` and `apps/mobile` are not
  created (FR-001).
- Supabase lives in `packages/database` (§1.3).
- **T1 must fix `.gitignore`.** The existing `supabase/.temp/` and `supabase/.branches/` contain a
  middle slash, so git anchors them to the repo root. They do **not** match
  `packages/database/supabase/.temp/`. Change them to `**/supabase/.temp/` and
  `**/supabase/.branches/`. Verify with `git check-ignore -v packages/database/supabase/.temp/x`.

## Task outline (shape for `/speckit-tasks`)

These follow IMPLEMENTATION_PLAN M0-T1…T9. The design changes only:

- T2 includes the Prettier check.
- T3 adds the `parseEnv` helper to domain.
- T6 adds the `supabase` dev dependency.
- T8 has five jobs.
- T9 adds the ruleset step.

| Task | Content                                                                                      | Proof                                                                                   |
| ---- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| T1   | Root workspace files, `.nvmrc`, pnpm settings, `turbo.json`                                  | `pnpm install` ok; wrong Node fails                                                     |
| T2   | `packages/config` + root ESLint/Prettier wiring                                              | `pnpm lint && pnpm format:check` pass                                                   |
| T3   | `packages/domain` (placeholder + `parseEnv` + tests), `packages/database` skeleton           | `pnpm test` runs; env-helper guarantees tested                                          |
| T4   | `apps/preview-api` with `/healthz`, env schema, `EADDRINUSE` message                         | Tests: every key missing/invalid; `/healthz` → `{ok:true}`                              |
| T5   | `apps/extension` WXT popup, env schema, build-time validation                                | `pnpm --filter @markme/extension build` → `.output/chrome-mv3`; bad env fails the build |
| T6   | `supabase init` in `packages/database`, smoke pgTAP, `db:*` scripts, `types.gen.ts`          | `pnpm db:start && pnpm db:test` pass                                                    |
| T7   | `scripts/dev.mjs` + root `dev`                                                               | quickstart V1, V2                                                                       |
| T8   | `ci.yml` with five jobs                                                                      | PR shows five green checks; fault PRs (SC-003)                                          |
| T9   | `.env.example` files, `.gitleaks.toml`, README, ruleset applied, update `CLAUDE.md` commands | quickstart V3–V5; README verbatim on a fresh clone                                      |

## Post-design Constitution Check

The check was re-run after Phase 1. The contracts add no table, no client and no fetcher.

- The env-helper contract guarantees no value is printed. Principle I (secrets) is now enforced by
  a test, not only by convention.
- The app-config contract locks the extension's key set by test (FR-022).
- The CI contract uses no secrets and pins actions by SHA.

**Still PASS.** There are no new dependencies beyond those justified in research.

## Complexity Tracking

None. There are no constitution violations to justify.
