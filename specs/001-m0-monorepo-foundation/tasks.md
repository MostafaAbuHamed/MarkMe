---
description: "Task list for M0 Monorepo Foundation"
---

# Tasks: M0 Monorepo Foundation

**Input**: design documents in `specs/001-m0-monorepo-foundation/`. Read these first:

- [plan.md](plan.md)
- [research.md](research.md) (R1–R18)
- [data-model.md](data-model.md)
- `contracts/`:
  - [app-config](contracts/app-config.md)
  - [env-helper](contracts/env-helper.md)
  - [root-commands](contracts/root-commands.md)
  - [ci-checks](contracts/ci-checks.md)
  - [preview-api.openapi.yaml](contracts/preview-api.openapi.yaml)
- [quickstart.md](quickstart.md)

**Prerequisites**: constitution v1.1.1. The spec requires real tests (FR-013, FR-014, FR-023,
SC-005), so test tasks are included. For logic (the env helper, schemas, `/healthz`, env-file
fill), tests are written first and must fail before the implementation task.

**Workflow** (CLAUDE.md):

- One task = one commit = one PR into `001-m0-monorepo-foundation`. Use Conventional Commits.
- Exact versions (all checked 2026-10-18):

  | Package                   | Version |
  | ------------------------- | ------- |
  | pnpm                      | 12.14.0 |
  | turbo                     | 2.11.9  |
  | typescript                | 6.0.3   |
  | prettier                  | 3.9.10  |
  | supabase                  | 2.121.0 |
  | eslint                    | 9.39.5  |
  | typescript-eslint         | 8.71.2  |
  | eslint-plugin-react-hooks | 7.1.1   |
  | eslint-plugin-jsx-a11y    | 6.10.2  |
  | eslint-config-prettier    | 10.1.8  |
  | globals                   | 17.13.0 |
  | zod                       | 4.6.7   |
  | vitest                    | 5.0.5   |
  | express                   | 5.3.0   |
  | @types/express            | 5.0.6   |
  | tsx                       | 4.23.15 |
  | supertest                 | 7.3.1   |
  | @types/node               | 24.19.2 |
  | wxt                       | 0.21.4  |
  | @wxt-dev/module-react     | 1.2.2   |
  | react / react-dom         | 19.3.1  |
  | gitleaks                  | 8.30.1  |

- Pin dev tools exactly (no `^`). `zod`, `express` and `react` use `^` within the major.
- **Never** use TypeScript 7 or ESLint 10 (R3, R4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 = one-command stack, US2 = PR checks, US3 = config validation

---

## Phase 1: Setup (shared infrastructure)

**Purpose**: the workspace root and shared tooling config. Nothing runs yet.

- [x] T001 Create the root workspace files:
  - `package.json`: `"name": "markme"`, `"private": true`, `"type": "module"`,
    `"packageManager": "pnpm@12.14.0"`, `"engines": { "node": ">=24 <25" }`.
  - Root scripts exactly as in contracts/root-commands.md, **except** `dev` (added in T016):
    `build`, `lint`, `typecheck`, `test`, `format`, `format:check`, `db:start`, `db:stop`,
    `db:reset`, `db:test`, `db:types`, `db:new`.
  - Exact devDependencies: `turbo`, `typescript`, `prettier`, `supabase`, `vitest`.
  - `pnpm-workspace.yaml`: packages `apps/*`, `packages/*`, and `engineStrict: true`. Add a
    build-script allowlist only if `pnpm install` reports a blocked script a build needs, with a
    YAML comment giving the reason (R2).
  - `.nvmrc` containing `24`.
  - Run `pnpm install` to produce `pnpm-lock.yaml`.
  - Proof: `pnpm install` succeeds on Node 24, and fails with an engine error on Node 26.
- [x] T002 [P] Fix the anchoring in `/.gitignore`:
  - Replace `supabase/.temp/` and `supabase/.branches/` with `**/supabase/.temp/` and
    `**/supabase/.branches/` (plan, Structure Decision).
  - Proof: `git check-ignore -v --no-index packages/database/supabase/.temp/x` prints the rule.
  - Also confirm that `git check-ignore --no-index apps/extension/.env` matches and
    `apps/extension/.env.example` does not.
- [x] T003 Create `/turbo.json` (Turborepo 2 schema):
  - `build`: `dependsOn: ["^build"]`, outputs `["dist/**", ".output/**"]`.
  - `dev`: `cache: false`, `persistent: true`.
  - `lint`: outputs `[]`.
  - `typecheck`: outputs `[]`.
  - `test`: outputs `["coverage/**"]`.
  - Internal packages ship TS source, so `lint`/`typecheck` need no `^build`.
- [x] T004 Create `packages/config` (`@markme/config`, private):
  - `package.json` with `exports` for `./tsconfig/base.json`, `./tsconfig/node.json`,
    `./tsconfig/react.json`, `./eslint`, `./prettier`.
  - `packages/config/tsconfig/base.json`:
    - `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
      `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck`, `noEmit`.
    - `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `lib: ["ES2023"]`.
    - Set every flag explicitly (R3).
  - `node.json`: extends base; `module`/`moduleResolution` `"NodeNext"`, `types: ["node"]`.
  - `react.json`: extends base; `jsx: "react-jsx"`, `lib: ["ES2023", "DOM", "DOM.Iterable"]`.
- [x] T005 Add the shared ESLint flat config to `packages/config/eslint/index.js`:
  - Exports an array:
    - Ignores `**/dist`, `**/.output`, `**/.wxt`, `**/coverage`, `**/types.gen.ts`.
    - `typescript-eslint` `recommendedTypeChecked` with
      `parserOptions.projectService: true`.
    - `@typescript-eslint/no-floating-promises: "error"`.
    - `eslint-plugin-react-hooks` recommended and `eslint-plugin-jsx-a11y` recommended, both
      scoped to `**/*.tsx`.
    - `eslint-config-prettier` last.
    - `globals` node for `*.mjs`/`*.js`.
  - Add the deps to `packages/config/package.json` at the versions above.
  - Add `/eslint.config.mjs` re-exporting `@markme/config/eslint`, and a root `lint` for root files
    via the turbo root task `//#lint` (`eslint scripts eslint.config.mjs`) in `/turbo.json`.
  - Add `@markme/config` as a root devDependency (`workspace:*`).
- [x] T006 Add the shared Prettier config:
  - `packages/config/prettier/index.js`: `printWidth: 100`, `singleQuote: false`,
    `trailingComma: "all"`.
  - `/.prettierrc.mjs` re-exports it.
  - `/.prettierignore` lists `pnpm-lock.yaml`, `**/.output`, `**/.wxt`, `**/dist`, `**/coverage`,
    `.specify`, `.claude`, `.cursor`, `.opencode`, `spike`.
  - Run `pnpm format`.
  - Proof: `pnpm format:check && pnpm lint` pass on the repo.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the shared env helper (used by both apps in US1 and US3), the unit-test runner, and
the local database harness (used by US1 and the US2 `db` check).

**⚠️ No user-story work begins until this phase is complete.**

- [x] T007 Create `packages/domain` (`@markme/domain`, private):
  - `package.json`: `"exports": { ".": "./src/index.ts" }`, dependency `zod`, devDependency
    `vitest`, and scripts `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), `test`
    (`vitest run`).
  - `packages/domain/tsconfig.json` extends `@markme/config/tsconfig/base.json`.
  - `packages/domain/vitest.config.ts`.
  - `packages/domain/src/index.ts` exports `export const DOMAIN_PACKAGE = "@markme/domain";`.
  - `packages/domain/src/index.test.ts` asserts that value (FR-013).
  - Proof: `pnpm test` runs 1 passing test.
- [x] T008 Write the failing tests for the env helper in
      `packages/domain/src/env/parse-env.test.ts`, per contracts/env-helper.md:
  - Valid input returns typed values (with default `PORT` applied and coerced to a number).
  - A missing required key gives `kind: "missing"`; `""` and `"   "` also count as missing.
  - A wrong format gives `kind: "invalid"` with the schema `.describe()` text as `expected`.
  - Three bad keys produce one `EnvError` with three issues, sorted by key.
  - The exact message format, including the footer
    `Copy apps/<app>/.env.example to apps/<app>/.env and fill in the values.`
  - Sentinel values (e.g. `"SENTINEL-9f2c-secret"`) passed as invalid input appear in neither
    `error.message` nor `JSON.stringify(error)` (FR-019).
  - Keys not in the schema are ignored.
  - Run them and confirm they fail.
- [x] T009 Implement `parseEnv` and `EnvError` in `packages/domain/src/env/parse-env.ts`, matching
      the signature in contracts/env-helper.md:
  - Use `schema.safeParse` and map `error.issues` per key.
  - Build the message **only** from the key, the kind and the field description. Never use the
    input or zod's issue text.
  - Normalise blank strings to `undefined` before parsing.
  - Re-export both from `packages/domain/src/index.ts`.
  - Proof: the T008 tests pass.
- [x] T010 [P] Create `packages/database` (`@markme/database`, private; can run alongside
      T008–T009):
  - Run `pnpm exec supabase init --workdir packages/database`, then set `project_id = "markme"`
    in `packages/database/supabase/config.toml`.
  - Add `packages/database/supabase/migrations/.gitkeep` and an empty
    `packages/database/supabase/seed.sql`.
  - Add `packages/database/supabase/tests/000-smoke.test.sql` with
    `begin; select plan(1); select ok(true, 'pgTAP runs'); select * from finish(); rollback;`.
  - `package.json` has `"exports": { ".": "./src/index.ts" }` and scripts `lint`/`typecheck`.
    There is no `test` script; the db tests run through `pnpm db:test`.
  - `packages/database/tsconfig.json` extends the base preset.
  - Run `pnpm db:start && pnpm db:types` to create `packages/database/src/types.gen.ts`.
    `packages/database/src/index.ts` re-exports `type Database`.
  - Proof: `pnpm db:start && pnpm db:test` passes (1 test), and a second `pnpm db:start` reports
    already running.

**Checkpoint**: lint, typecheck, unit tests and pgTAP all run locally. User stories can start.

---

## Phase 3: User Story 1 — one command runs the whole local stack (Priority: P1) 🎯 MVP

**Goal**: on a fresh clone, `pnpm install && pnpm dev` starts Supabase (or reuses it), creates
missing `.env` files, prints every address, and runs the preview API and the extension dev build.

**Independent test**: [quickstart.md](quickstart.md) V1 and V2. `curl
http://127.0.0.1:8787/healthz` returns `{"ok":true}`, the database accepts connections, and
`apps/extension/.output/chrome-mv3-dev` loads unpacked and shows the placeholder popup.

### Tests for User Story 1 (write first, confirm they fail)

- [x] T011 [P] [US1] Write `apps/preview-api/test/healthz.test.ts`:
  - Use `supertest` against `createApp()` from `apps/preview-api/src/app.ts`.
  - `GET /healthz` returns 200, `content-type` application/json, and body exactly `{ ok: true }`
    (contracts/preview-api.openapi.yaml).
  - `GET /anything-else` returns 404 (FR-008).
- [x] T012 [P] [US1] Write `scripts/dev-env.test.mjs` (Vitest) for the pure functions planned in
      `scripts/dev-env.mjs`:
  - `parseStatusEnv(text)` returns **only** `{ API_URL, ANON_KEY }`, even when the input contains
    `SERVICE_ROLE_KEY`, `SECRET_KEY`, `JWT_SECRET` and `S3_PROTOCOL_ACCESS_KEY_SECRET` lines.
  - `fillExample(exampleText, values)` replaces only the keys mapped in contracts/app-config.md
    and keeps comments and other lines verbatim.
  - `ensureEnvFile(path, content)` resolves to `"created"` for a new file. For an existing file it
    resolves to `"found"` and leaves the content byte-identical (uses a temp dir; FR-007a).
  - No returned file content contains any value from the privileged lines.

### Implementation for User Story 1

- [x] T013 [US1] Create `apps/preview-api` (`@markme/preview-api`, private):
  - `package.json`:
    - dependencies `express`, `@markme/domain` (`workspace:*`), `zod`.
    - devDependencies `tsx`, `@types/express`, `@types/node`, `vitest`, `supertest`,
      `@types/supertest`.
    - scripts: `dev` (`tsx watch src/server.ts`), `build` (`tsc -p tsconfig.build.json`),
      `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`).
  - `apps/preview-api/tsconfig.json` (extends node preset) and `apps/preview-api/tsconfig.build.json`
    (`noEmit: false`, `outDir: dist`, `include: ["src"]`).
  - `apps/preview-api/vitest.config.ts`.
  - `apps/preview-api/src/env.ts`: the zod schema from contracts/app-config.md, with each field's
    `.describe()` set to the "Description shown on error" text verbatim:
    - `PORT`: `z.coerce.number().int().min(1).max(65535)`, default `8787`, "a port number from 1
      to 65535".
    - `SUPABASE_URL`: `z.url({ protocol: /^https?$/ })`, required, "an http(s) URL, e.g.
      http://127.0.0.1:54321".
    - Export `loadEnv(source = process.env)`, which calls `parseEnv` with
      `{ app: "preview-api", exampleFile: "apps/preview-api/.env.example" }`.
  - `apps/preview-api/src/app.ts`: `createApp()` with only `GET /healthz` → `{ ok: true }`.
  - `apps/preview-api/src/server.ts`, in this order:
    1. If `.env` exists, call `process.loadEnvFile(".env")`.
    2. Call `loadEnv()`. On `EnvError`, write its message to stderr and `process.exit(1)` before
       anything else (FR-017).
    3. `listen(PORT)` and log `preview-api listening on http://127.0.0.1:<PORT>`.
    4. On `EADDRINUSE`, print `preview-api: port <PORT> is already in use` and exit 1.
  - `apps/preview-api/.env.example` contains `PORT=8787` and
    `SUPABASE_URL=http://127.0.0.1:54321`, each with a one-line comment.
  - Proof: the T011 tests pass.
- [x] T014 [P] [US1] Create `apps/extension` (`@markme/extension`, private):
  - `package.json`:
    - dependencies `react`, `react-dom`, `@markme/domain` (`workspace:*`), `zod`.
    - devDependencies `wxt`, `@wxt-dev/module-react`, `@types/react`, `@types/react-dom`,
      `vitest`.
    - scripts: `dev` (`wxt`), `build` (`wxt build`), `postinstall` (`wxt prepare`), `lint`,
      `typecheck` (`wxt prepare && tsc --noEmit`), `test` (`vitest run`).
  - `apps/extension/src/lib/env.ts`: the zod object from contracts/app-config.md, with each
    `.describe()` verbatim:
    - `WXT_SUPABASE_URL`: `z.url({ protocol: /^https?$/ })`.
    - `WXT_SUPABASE_ANON_KEY`: `z.string().min(20)` plus a refine that rejects any
      `replace-with-…` value.
    - `WXT_PREVIEW_API_URL`: `z.url({ protocol: /^https?$/ })`.
    - All are required. **No other key** (FR-022).
    - Export the schema as `extensionEnvSchema`, plus `env = parseEnv(extensionEnvSchema,
import.meta.env, { app: "extension", exampleFile: "apps/extension/.env.example" })`.
  - `apps/extension/wxt.config.ts`:
    - `modules: ["@wxt-dev/module-react"]`, `webExt: { disabled: true }`, and
      `manifest: { name: "MarkMe" }` with **no** `permissions` or `host_permissions` (R16).
    - Use the function form to read `loadEnv(mode, process.cwd(), "WXT_")` from `vite` and run
      `parseEnv(extensionEnvSchema, …)`. An `EnvError` fails `wxt`/`wxt build` before bundling
      (US-3 #6).
  - `apps/extension/tsconfig.json` extends `./.wxt/tsconfig.json` and adopts the strict flags of
    `@markme/config/tsconfig/react.json`.
  - Popup: `apps/extension/entrypoints/popup/{index.html,main.tsx,App.tsx}` shows the heading
    "MarkMe" and the text "Foundation build — no features yet". `<html lang="en">`.
  - `apps/extension/.env.example`:
    - `WXT_SUPABASE_URL=http://127.0.0.1:54321`
    - `WXT_SUPABASE_ANON_KEY=replace-with-local-anon-key`
    - `WXT_PREVIEW_API_URL=http://127.0.0.1:8787`
  - Proof: with a filled `.env`, `pnpm --filter @markme/extension build` produces
    `apps/extension/.output/chrome-mv3`.
- [x] T015 [US1] Implement `scripts/dev-env.mjs`:
  - Export `parseStatusEnv`, `fillExample`, `ensureEnvFile` (write with `{ flag: "wx" }`; treat
    `EEXIST` as `"found"`) and the per-app fill map:
    - preview-api: `SUPABASE_URL ← API_URL`.
    - extension: `WXT_SUPABASE_URL ← API_URL`, `WXT_SUPABASE_ANON_KEY ← ANON_KEY`,
      `WXT_PREVIEW_API_URL ← http://127.0.0.1:8787`.
  - Proof: the T012 tests pass via root `pnpm test`.
- [x] T016 [US1] Implement `scripts/dev.mjs` (plain Node ESM, no dependencies) and add root script
      `"dev": "node scripts/dev.mjs"` to `/package.json`. Follow the sequence and messages in
      contracts/root-commands.md (R17):
  1. Preflight: Node major 24; `docker info` succeeds. On failure print the exact one-line message
     and exit 1, with no stack trace.
  2. Run `supabase status -o env --workdir packages/database` (captured). If it fails, run
     `pnpm db:start` with `stdio: "inherit"`. If that fails, print
     `[dev] supabase failed to start, see above.` and exit 1.
  3. `ensureEnvFile` for `apps/preview-api/.env` and `apps/extension/.env`, printing
     created/found lines.
  4. Print the address summary.
  5. Spawn `pnpm turbo run dev --filter=@markme/preview-api --filter=@markme/extension
--ui=stream`. Forward SIGINT/SIGTERM and exit with the child's code. Never stop the database.
- [x] T017 [US1] Write `/README.md` (FR-010):
  - What MarkMe is, in one line.
  - Prerequisites table copied from quickstart.md, including `fnm`/`nvm` for Node 24 and
    `corepack enable`.
  - Setup steps `git clone` → `pnpm install` → `pnpm dev`, with a first-run warning (image
    downloads).
  - How to load `apps/extension/.output/chrome-mv3-dev` unpacked. Note that branded Chrome builds
    ignore `--load-extension`, so load it by hand.
  - `pnpm db:stop`.
  - How to refresh stale `.env` files (delete and rerun `pnpm dev`).
  - The root command table from contracts/root-commands.md.
  - No real or demo keys anywhere in the README.
- [x] T018 [US1] Run quickstart.md V1 and V2 on a fresh clone of the branch (`git clone` into a
      temp dir):
  - Record first-run and second-run times (SC-001: < 15 min / < 2 min).
  - Check every edge-case row in V2.
  - Fix any README step that did not work verbatim, in `/README.md`.

**Checkpoint**: US1 is fully usable. This is the MVP: contributors can run the stack.

---

## Phase 4: User Story 2 — every pull request is checked automatically (Priority: P2)

**Goal**: five required checks (`lint`, `typecheck`, `test`, `db`, `secrets`) on every PR. They
need no stored secrets, they cache Turbo results, and failures block merges on `main` and
milestone branches.

**Independent test**: quickstart.md V5. A clean PR is green in < 10 min, and each of the five
deliberate faults fails only its matching check.

**Depends on**: Phase 2 (the commands the checks run). It does not depend on US1. The CI file can
be written in parallel with Phase 3.

- [x] T019 [P] [US2] Create `/.gitleaks.toml`:
  - `title = "markme"`.
  - `[extend] useDefault = true`.
  - `[allowlist]` `description = "placeholder values in .env.example"` with
    `regexes = ['''replace-with-[a-z0-9-]+''']`. Do not allowlist by path (R12).
  - Test locally with the pinned binary: download it to the scratchpad and run
    `gitleaks git --config .gitleaks.toml --redact --verbose` on the branch history.
  - It must pass on the current history and fail on a temporary commit that adds
    `AKIA` + 16 uppercase alphanumerics in a new file. Drop that commit afterwards.
- [x] T020 [US2] Create `/.github/workflows/ci.yml` with the triggers, `permissions`,
      `concurrency` and the three Turbo jobs `lint`, `typecheck` and `test`, exactly per
      contracts/ci-checks.md:
  - Steps: `actions/checkout` → `pnpm/action-setup` (version from `packageManager`) →
    `actions/setup-node` (`node-version-file: .nvmrc`, `cache: pnpm`) →
    `pnpm install --frozen-lockfile` → `actions/cache` for `.turbo/cache` (key
    `turbo-${{ github.job }}-${{ runner.os }}-${{ github.sha }}`, restore-key prefix) → the job
    command.
  - `lint` also runs `pnpm format:check`.
  - Pin every action by full commit SHA, with the tag in a comment.
  - No `secrets.*` reference anywhere (FR-016).
- [x] T021 [US2] Add the `db` job to `/.github/workflows/ci.yml`:
  - The same setup, without the Turbo cache.
  - `pnpm exec supabase start --workdir packages/database -x
studio,imgproxy,edge-runtime,logflare,vector,supavisor`
  - `pnpm db:test`
  - `pnpm db:types`
  - `git diff --exit-code packages/database/src/types.gen.ts`
- [x] T022 [US2] Add the `secrets` job to `/.github/workflows/ci.yml`:
  - `actions/checkout` with `fetch-depth: 0`.
  - Download the `gitleaks_8.30.1_linux_x64.tar.gz` asset and the release checksums file from
    `github.com/gitleaks/gitleaks/releases/download/v8.30.1/`, then verify with
    `sha256sum --check --ignore-missing`.
  - Run `gitleaks git --config .gitleaks.toml --log-opts="$BASE..$HEAD" --redact --verbose
--exit-code 1`, with `BASE`/`HEAD` from `github.event.pull_request.base.sha`/`head.sha` on PRs,
    and `github.event.before`/`github.sha` on push.
  - On push, if `before` is all zeros, scan only `github.sha`.
- [x] T023 [US2] Push the branch and open a PR into `main` titled `chore(ci): M0 checks`:
  - Confirm the five checks appear and pass, and record the wall time (SC-002, SC-004 < 10 min).
  - Re-run the jobs and confirm `cache hit` in the Turbo output of `lint`/`typecheck`/`test`
    (US-2 #6).
  - Note the results in the PR description.
- [x] T024 [US2] The owner makes the repository public if it is not already. Then apply the
      `ci-gate` ruleset with the `gh api` command in quickstart.md V5 step 2, and verify it with
      `gh api repos/{owner}/{repo}/rulesets` (FR-012). Record the ruleset id in
      `specs/001-m0-monorepo-foundation/quickstart.md` under V5.
- [x] T025 [US2] Run the fault proofs from contracts/ci-checks.md on throwaway branches:
  - Five PRs into `001-m0-monorepo-foundation` (lint, type error, failing unit test, failing pgTAP
    test, and a fake secret committed and then removed in a later commit).
  - One PR changing only an `.env.example` placeholder.
  - Confirm each fault fails exactly its matching check, merging is blocked, and the placeholder
    PR passes `secrets` (SC-003, US-2 #2–#5).
  - Close all of them unmerged. Record the results table in
    `specs/001-m0-monorepo-foundation/quickstart.md` under V5.

**Checkpoint**: PRs are gated. From here on, every later task's PR runs through these checks.

---

## Phase 5: User Story 3 — apps refuse bad configuration and say what is wrong (Priority: P3)

**Goal**: for every setting of every app, a missing or invalid value stops the app (or the
extension build) with one message naming every bad key, with no values (SC-005, SC-006).

**Independent test**: quickstart.md V3, plus `pnpm test` covering 100% of keys.

**Depends on**: T009 (helper), T013 and T014 (schemas exist). It does not depend on US2.

- [x] T026 [P] [US3] Write `apps/preview-api/test/env.test.ts` against `loadEnv`:
  - `SUPABASE_URL` missing → issue `missing`.
  - `SUPABASE_URL=not-a-url` and `ftp://x` → `invalid`, expected
    "an http(s) URL, e.g. http://127.0.0.1:54321".
  - `PORT=abc`, `PORT=0` and `PORT=70000` → `invalid`, expected "a port number from 1 to 65535".
  - `PORT` unset → 8787.
  - Both bad at once → one error listing both.
  - The message contains `apps/preview-api/.env.example`.
  - Invalid values never appear in the message.
- [ ] T027 [P] [US3] Write `apps/extension/src/lib/env.test.ts` against `extensionEnvSchema` via
      `parseEnv`:
  - Each of `WXT_SUPABASE_URL`, `WXT_SUPABASE_ANON_KEY` and `WXT_PREVIEW_API_URL` is tested
    missing and invalid. The anon key's invalid case is `replace-with-local-anon-key`; the
    placeholder is rejected by the refine.
  - All three bad at once → one error with three issues.
  - **Key-set lock**:
    `expect(Object.keys(extensionEnvSchema.shape).sort()).toEqual(["WXT_PREVIEW_API_URL",
"WXT_SUPABASE_ANON_KEY", "WXT_SUPABASE_URL"])` (FR-022).
  - No key name matches `/SERVICE|SECRET|JWT/`.
- [ ] T028 [US3] Run quickstart.md V3 by hand:
  - The preview API with `SUPABASE_URL` removed and `PORT=abc` exits 1, listing both.
  - The extension build with `WXT_PREVIEW_API_URL=not-a-url` fails and produces no
    `apps/extension/.output/chrome-mv3`.
  - Fix any gap in `apps/preview-api/src/server.ts` or `apps/extension/wxt.config.ts`, with a
    failing test first if one can be written (constitution III).

**Checkpoint**: all three stories work on their own.

---

## Phase 6: Polish and cross-cutting concerns

- [ ] T029 [P] Update `/CLAUDE.md` "Current state" with the real commands (from
      contracts/root-commands.md), Node 24 / pnpm 12, and the note that `.env` files are created by
      `pnpm dev`. Remove the "pre-code" wording. `AGENTS.md` only includes `@CLAUDE.md`, so it needs no
      change.
- [ ] T030 Run the full exit verification (quickstart.md V4) on a fresh clone:
  - `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm db:start &&
pnpm db:test`, then `pnpm db:types` with no diff, then `pnpm build`.
  - Confirm `git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$'` prints nothing
    (SC-006, FR-021).
  - Then open the milestone PR `001-m0-monorepo-foundation` → `main`.

---

## Dependencies and execution order

### Phase dependencies

- **Setup (T001–T006)**: T001 first. T002 can run any time. Then T003 → T004 → T005 → T006
  (T004–T006 all edit `packages/config/package.json`).
- **Foundational (T007–T010)**: needs Setup. T007 → T008 → T009. T010 runs in parallel with
  T008–T009.
- **US1 (T011–T018)**: needs Foundational.
- **US2 (T019–T025)**: needs Foundational. T019–T022 can be written alongside US1, but T023–T025
  need the branch to hold everything to be checked, so run them after US1 lands.
- **US3 (T026–T028)**: needs T013 and T014.
- **Polish (T029–T030)**: after all stories.

### Within stories

- T011 → T013 (test first). T012 → T015 → T016. T013 and T014 → T016 (the dev script runs both
  apps). T017 → T018.
- T020 → T021 → T022 (same file). T023 → T024 → T025.
- T026 and T027 can run in parallel, then T028.

### Graph

```text
T001 ─┬─ T002
      └─ T003 → T004 → T005 → T006 → T007 → T008 → T009 ─┬─ US1: T011→T013 ┐
                                    └──────── T010 ───────┤       T014 ────┼→ T016 → T017 → T018
                                                          │  T012→T015 ────┘
                                                          ├─ US2: T019, T020→T021→T022 → (after US1) T023→T024→T025
                                                          └─ US3: (after T013, T014) T026 ∥ T027 → T028
                                                                                         → T029, T030
```

## Parallel examples

```text
# After T009:
T010 database harness   ∥  T011 healthz test  ∥  T012 dev-env tests  ∥  T014 extension app  ∥  T019 gitleaks config

# US3:
T026 preview-api env tests  ∥  T027 extension env tests
```

## Implementation strategy

1. **MVP**:
   - Do Phase 1, Phase 2, then US1 (T001–T018).
   - Stop and validate with quickstart V1/V2.
   - From then on, `pnpm dev` works and must stay working after every merge.
2. **Gate**: US2 next (T019–T025), so that every later PR, including US3's, runs through CI and
   the ruleset.
3. **Hardening**: US3 tests (T026–T028), then Polish.
4. The milestone branch merges to `main` only after T030 and green CI (constitution workflow).

## Notes

- `.env.example` files hold only placeholders or local URLs. Never commit a key, not even the
  public local demo keys (R12).
- Never weaken or skip a test to get green (constitution III). A failure in a fault-proof PR is
  the expected result.
- Agents implementing a task read the contract file it cites. The contracts are the source of
  truth for names, messages and formats.
