# Research: M0 Monorepo Foundation

**Date**: 2026-10-18 · **Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Inputs: `docs/IMPLEMENTATION_PLAN.md` §1 and §3 M0 (approved design), spec clarifications, and the
npm registry, the Node.js release index and GitHub releases, checked on 2026-10-18. Each item below
either settles an open item from the implementation plan or records where this plan differs from it.
Those differences are copied back into `docs/IMPLEMENTATION_PLAN.md` in the same change (its change
rule).

---

## R1. Node.js version

- **Decision**: Node **24 LTS** ("Krypton", 24.22.0 on 2026-10-14). `.nvmrc` = `24`.
  `engines.node` = `">=24 <25"`. pnpm `engineStrict: true` makes installs fail early on the wrong
  version.
- **Rationale**:
  - The implementation plan said "22 LTS". Node 22 is in maintenance and reaches end of life on
    2027-04-30, which falls inside v1–v2 work.
  - Node 24 is the newest LTS line today and is supported until 2028-04.
  - Every chosen tool supports 24: Vitest 5 needs `^22.12 || ^24 || >=26`, WXT `>=22`, ESLint 9
    `^18.18 || ^20.9 || >=21.1`.
  - The Cloud Run image in M3 becomes `node:24-slim`.
- **Alternatives considered**:
  - Node 22: approved earlier, but its end of life is too close.
  - Node 26: the owner's machine has 26.11, but 26 has not become LTS yet.
  - The owner's machine needs Node 24 through a version manager (`fnm`/`nvm` reads `.nvmrc`). This
    goes in the README prerequisites.

## R2. Package manager

- **Decision**: pnpm **12.14.0**, set in `packageManager` (Corepack / pnpm self-management) and
  pinned in CI through `pnpm/action-setup` reading `packageManager`. A committed `pnpm-lock.yaml`
  is used. CI runs `pnpm install --frozen-lockfile`.
- **Rationale**:
  - FR-003 requires a pinned version and reproducible installs.
  - Settings such as `engineStrict` and the build-script allowlist go in `pnpm-workspace.yaml`
    (current pnpm puts workspace settings there).
- **Alternatives considered**: an older pnpm major. Rejected: no reason to start a new repo on an
  old major.
- **Note**: pnpm blocks dependency install scripts unless they are allowlisted. Allowlist only what
  a build needs (expected: `esbuild`, if its optional binary does not resolve). Record each entry
  with its reason in the T1 PR.

## R3. TypeScript version (deviation: 6.0, not 7)

- **Decision**: TypeScript **6.0.x** (latest 6.0.3), pinned exactly at the root.
- **Rationale**:
  - `typescript@latest` is 7.0.2 (the native port).
  - `typescript-eslint` 8.71.2, the latest, declares peer `typescript >=4.8.4 <6.1.0`.
  - Type-aware linting, required by §1.1, would be unsupported on 7.
  - Bump to 7 when `typescript-eslint` supports it (its own task, not M0).
- **Flags**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck`. Set every one
  explicitly; do not rely on TS 6 changed defaults.
- **Alternatives considered**:
  - TS 7 without type-aware lint: weakens FR-002.
  - TS 7 with `tsgo` for typechecking only, plus TS 6 for lint: two compilers. Rejected (IV).

## R4. ESLint version (stay on 9)

- **Decision**: ESLint **9.39.x** flat config, `typescript-eslint` 8.71
  (`recommendedTypeChecked` + `projectService`), `eslint-plugin-react-hooks` 7,
  `eslint-plugin-jsx-a11y` 6.10, `eslint-config-prettier` 10, `globals`.
- **Rationale**:
  - ESLint 10 is out (10.13).
  - `eslint-plugin-jsx-a11y` 6.10.2, the latest, declares peer `eslint ^3 … ^9` only.
  - §1.1 requires the a11y plugin (constitution VI).
- **Alternatives considered**: ESLint 10 with peer warnings ignored. Rejected: an unsupported
  combination in the gate every PR depends on.

## R5. Validation library: zod 3 vs 4 (settles open item)

- **Decision**: **zod 4** (`zod@^4.6`, stable since 4.0; latest 4.6.7, 2026-10-12). Import from
  `"zod"`.
- **Rationale**:
  - Stable and current.
  - It has `z.url()`, `z.coerce.number().int()` and `z.stringbool()`, which env parsing needs.
  - Faster and smaller, which matters for the extension bundle (popup < 300 ms, VI).
  - Every later milestone (M2 schemas, M3 request bodies) starts on the same major.
- **Alternatives considered**: zod 3. Rejected: legacy line, and moving later would touch every
  schema.

## R6. Remote build cache (settles open item)

- **Decision**: **No** Turborepo remote cache. CI saves and restores `.turbo/cache` with
  `actions/cache`, with one key per job (`turbo-<job>-<os>-<sha>` and a prefix restore key).
- **Rationale**:
  - FR-016 asks for reuse of unchanged results without stored secrets.
  - A remote cache (Vercel) needs a token secret and an external service.
  - The free tier rule allows neither.
- **Alternatives considered**: Vercel Remote Cache. Rejected: needs a secret (FR-016) and is an
  extra service (IV).

## R7. Five checks as five CI jobs (deviation from §1.6)

- **Decision**: `ci.yml` has five jobs, each a required status check: `lint`, `typecheck`, `test`,
  `db`, `secrets`. It runs on `pull_request` (all base branches) and on `push` to `main`. A
  `concurrency` group per ref cancels outdated runs. `permissions: contents: read`.
- **Rationale**:
  - FR-011 and SC-002/SC-003 need each of the five checks to show its own pass or fail.
  - §1.6 had a single `quality` job for lint, typecheck and test, which shows one status.
  - Public repos get free unlimited minutes, and the jobs run in parallel, so wall time stays under
    SC-004 (10 min).
  - The pnpm store cache (`actions/setup-node` `cache: pnpm`) and the Turbo cache keep the repeated
    install cheap.
- **Alternatives considered**: one job with steps. Rejected: only one status shows on the PR.

## R8. Supabase CLI as a pinned dev dependency (deviation from §1.1)

- **Decision**: add `supabase` (2.121.0) as an exact-pinned root `devDependency`. Root `db:*`
  scripts call `supabase …` from `node_modules/.bin`. CI uses the same binary after
  `pnpm install`, so `supabase/setup-cli` is not used.
- **Rationale**:
  - One version for local and CI, pinned by the lock file (FR-003).
  - It removes one manual prerequisite (SC-001).
  - The package ships platform binaries as `optionalDependencies` (`@supabase/cli-linux-x64`, …)
    and has no install script, so no pnpm build allowlist entry is needed.
  - The reason for the new dependency (IV): it replaces a global install and a separate CI action.
- **Alternatives considered**:
  - Global CLI plus `supabase/setup-cli` with a pinned version: two places to keep in sync.
  - Docker-only: not supported by the CLI.
- **Spec impact**: the spec's assumption lists "the database command-line tool" as a prerequisite.
  This choice removes that need, which satisfies the assumption more than it contradicts it.
  Docker stays a prerequisite.

## R9. Local Supabase services

- **Decision**:
  - `db:start` = `supabase start --workdir packages/database -x imgproxy,edge-runtime,logflare,vector,supavisor`.
    Studio and Mailpit stay on locally, because Mailpit is needed for M4 email confirmation.
  - CI also excludes `studio`. It calls `supabase start` directly with the extended `-x` list,
    since it never needs Studio.
  - `config.toml` from `supabase init` sets `project_id = "markme"`. Default ports: API 54321,
    DB 54322, Studio 54323, Mailpit 54324.
- **Rationale**:
  - Fewer images means a faster first run (SC-001: 15 min) and a faster CI `db` job (SC-004).
  - v1 uses none of the excluded services: no edge functions, no image transforms, no log
    analytics, no pooler.
- **Reuse (FR-006, US-1 #6)**:
  - `scripts/dev.mjs` runs `supabase status -o env --workdir packages/database`.
  - Exit 0 means it is running; reuse it.
  - Otherwise it runs `db:start`. `supabase start` is also a no-op that reports "already running"
    if called twice.
- **Alternatives considered**: start everything (the default). Rejected: slower, and those services
  are unused.

## R10. Creating local config files (FR-007a)

- **Decision**: `scripts/dev.mjs`, after the database is up:
  1. Parses `supabase status -o env` output, reading **only** `API_URL` and `ANON_KEY` (an
     allowlist; the privileged key lines are never read into variables that reach a writer).
  2. For each app, if `apps/<app>/.env` does **not** exist, copies `apps/<app>/.env.example` and
     fills the keys listed in the [config contract](contracts/app-config.md) (Supabase URL, anon
     key, preview API URL).
  3. Writes with flag `wx` (fail if it exists), so a race can never overwrite.
  4. Prints `created` / `found (unchanged)` for each file.
- **Rationale**:
  - The clarification Q1 answer.
  - Using `.env` in both apps keeps one rule for contributors and the README.
  - WXT/Vite loads `.env` natively. The preview API loads it with Node's built-in
    `process.loadEnvFile` (no `dotenv` dependency, IV), only when the file exists.
- **Key naming**: the env var stays `WXT_SUPABASE_ANON_KEY` (§1.4). Its value is the CLI's
  `ANON_KEY`. Whether to switch to the newer `sb_publishable_…` key is decided in M1/M4 with the
  cloud project, and only changes which status line is copied.
- **Alternatives considered**:
  - `.env.local` / `.env.development`: more files, and Vite mode-specific loading confuses the
    build-time check.
  - Generating the files in `postinstall`: the database is not running then.

## R11. Env validation design (US-3)

- **Decision**:
  - One small helper `parseEnv(schema, source, { app, exampleFile, secretKeys })` in
    `packages/domain/src/env/`.
  - Each app declares its own zod schema in its `env.ts`.
  - On failure the helper throws a single `EnvError`. Its message lists **every** issue (zod's
    `error.issues`, not only the first) as `NAME — missing | invalid: expected <description>`, then
    `Copy apps/<app>/.env.example to apps/<app>/.env`.
  - The message is built only from the key name and the schema's own `description`. It never uses
    the input value or zod's default issue text, so no secret can leak (FR-019).
  - `secretKeys` exists so tests can assert that no secret value appears.
- **Where it runs**:
  - **Preview API**: the first statement in `src/server.ts` (after `loadEnvFile`). On `EnvError` it
    prints the message to stderr and calls `process.exit(1)` before `listen` (FR-017).
  - **Extension**: `wxt.config.ts` validates `loadEnv(mode, cwd, 'WXT_')` at config time, so
    `wxt` / `wxt build` fail before bundling (US-3 #6). `src/lib/env.ts` parses `import.meta.env`
    with the same schema for typed runtime access.
- **Rationale for a shared helper** (IV, new abstraction):
  - FR-018 and FR-019 require the same message format and redaction rule in two apps.
  - One implementation means one set of tests for the redaction rule.
  - `packages/domain` already owns zod schemas (constitution II). `packages/config` stays
    tooling-only.
- **Alternatives considered**:
  - `@t3-oss/env-core`: a new dependency for ~40 lines.
  - A copy in each app: two places to keep redaction correct.

## R12. Secret scanning (FR-015)

- **Decision**:
  - Run the **gitleaks CLI v8.30.1** directly in the `secrets` job.
  - Download the pinned release tarball and verify its SHA-256 against the release's checksums file.
  - Scan with `gitleaks git --log-opts="<base_sha>..<head_sha>" --redact --exit-code 1 --report-format sarif`.
  - Checkout uses `fetch-depth: 0`.
  - Findings print as `file:line` in the job log (`--verbose`). The SARIF report is uploaded as a
    job artifact.
- **Rationale**:
  - The commit range scans every PR commit, not only the final diff (the edge case "secret in
    history but not in the final diff").
  - No stored secret is needed (FR-016).
  - `gitleaks-action` needs a `GITLEAKS_LICENSE` secret for organization-owned repos. Running the
    CLI avoids that if the repo ever moves, and avoids a third-party action with token access.
- **Config**: `.gitleaks.toml` uses `[extend] useDefault = true` plus an allowlist that matches
  only the placeholder values in `.env.example` files (`replace-with-…`, by regex, not by path).
  - No local Supabase key is committed anywhere, not even the public local demo keys.
    `.env.example` holds placeholders, and `pnpm dev` fills real local values into the git-ignored
    `.env`. The allowlist can therefore stay this narrow.
  - Allowlisting by value means a real key pasted into `.env.example` still fails (US-2 #5 and #4
    both hold).
- **Alternatives considered**:
  - `gitleaks/gitleaks-action@v2`: works for a personal repo, but adds a license dependency and
    less control.
  - TruffleHog: a heavier scanner and a second rules system. Not needed.
  - GitHub push protection: free for public repos and complementary. The owner may turn it on, but
    it is not the PR check the spec asks for.

## R13. Merge blocking (FR-012)

- **Decision**:
  - A GitHub **repository ruleset** (free for public repos) targets `main` and the milestone branch
    pattern `[0-9][0-9][0-9]-*`.
  - Rules: require a pull request, and require the status checks `lint`, `typecheck`, `test`, `db`,
    `secrets` to pass. Block force pushes and deletion.
  - The owner applies it with `gh api` (the command is in [quickstart.md](quickstart.md)). M0's
    last task confirms it with `gh api repos/{owner}/{repo}/rulesets`.
- **Rationale**: one ruleset covers both branch kinds. Classic branch protection needs a rule per
  pattern.
- **Alternatives considered**: classic branch protection rules. They work, but need two rules.

## R14. Unit test runner and placeholder tests

- **Decision**:
  - **Vitest 5.0.x** in `packages/domain`, `apps/preview-api` and `apps/extension`, each with a
    `vitest.config.ts`.
  - `turbo run test` runs `vitest run`.
  - M0 tests:
    - The domain placeholder.
    - The `parseEnv` helper (missing, invalid, several issues, no secret value in the message).
    - Preview API: an env schema test for every required key (SC-005), and a `GET /healthz` test
      with `supertest`.
    - Extension: an env schema test for every key.
- **Rationale**:
  - §1.1 chose Vitest (it said 3.x; 5 is current and supports Vite 8, which WXT 0.21 accepts).
  - `supertest` is the §1.7 choice for M3. It enters in M0 because the health check is the first
    endpoint.
- **Alternatives considered**: `node:test`. Rejected: it would mean two runners once WXT component
  tests arrive in M4.

## R15. Preview API stack

- **Decision**:
  - Express **5.x** (5.3) with `@types/express` 5.
  - `tsx` 4 for `dev` (`tsx watch src/server.ts`).
  - `build` = `tsc -p tsconfig.build.json` to `dist/`. M3 uses it for the Docker image; M0 only
    proves it compiles.
  - `src/app.ts` builds the app (testable without a port). `src/server.ts` loads env, validates it,
    and listens.
  - `EADDRINUSE` on listen prints `preview-api: port <PORT> is already in use` and exits 1 (the
    edge case).
  - No CORS, auth or other routes in M0 (FR-008, FR-024).
- **Rationale**: Express 5 is current and stable, with native async error handling. `tsx` was
  already approved.

## R16. Extension stack

- **Decision**:
  - WXT **0.21.x**, `@wxt-dev/module-react` 1.2, React 19 (`react`/`react-dom` 19.x), Vite 8
    (WXT's peer range).
  - Entrypoint: `entrypoints/popup/{index.html,main.tsx,App.tsx}` only, showing "MarkMe" plus the
    text "Foundation build — no features yet".
  - Manifest: name and version only. **No permissions** in M0. The permission list in the
    constitution is added by the milestones that need each permission. Pinning the key/ID is M4-T1.
  - `typecheck` = `wxt prepare && tsc --noEmit`. `postinstall` runs `wxt prepare`, so `.wxt/`
    types exist.
  - The dev server keeps WXT's default port (3000). `wxt` opens its own browser by default. Set
    `webExt.disabled = true` so the contributor loads `.output/chrome-mv3-dev` as unpacked (US-1 #5;
    branded Chrome ignores `--load-extension`, S0 tooling note).
- **Rationale**: the approved stack. Adding no permissions follows the minimal-permissions rule.

## R17. Start command orchestration (FR-005–FR-007, edge cases)

- **Decision**: `pnpm dev` = `node scripts/dev.mjs`, plain Node ESM with no dependencies. Steps, in
  order:
  1. **Preflight**:
     - Node major is 24, or exit with the required version.
     - `docker info` succeeds, or exit with "Docker is not running — start it with
       `sudo systemctl start docker` (or Docker Desktop)".
     - Each check prints one line, with no stack trace.
  2. **Database**: run `supabase status -o env`. If it fails, run `pnpm db:start` with inherited
     stdio, so image-pull progress shows (edge case: first run). If start fails, exit with its
     output; the CLI names the busy port.
  3. **Config files**: create or report each app's `.env` (R10).
  4. **Summary**: print the Supabase API, Studio and Mailpit URLs, the preview API URL
     (`http://127.0.0.1:8787/healthz`), the extension output folder, and `pnpm db:stop` to stop the
     database.
  5. **Apps**: spawn `turbo run dev --filter=@markme/preview-api --filter=@markme/extension
--ui=stream`. Turbo prefixes each line with the package name (edge case: crash visibility).
     Forward SIGINT/SIGTERM. The database keeps running (spec assumption).
- **Rationale**: the §3 M0 design, plus the clarifications and edge cases. No `concurrently`
  dependency is needed, because Turbo already runs persistent tasks in parallel.

## R18. Workspace consumption of internal packages

- **Decision**:
  - As designed: `packages/domain` and `packages/database` export TS source
    (`"exports": { ".": "./src/index.ts" }`) with no build step.
  - The preview API `build` uses `tsc` with project references off.
  - M3's Docker build bundles with a single tool if needed. That decision belongs to M3, not M0.
  - Package names: `@markme/config`, `@markme/domain`, `@markme/database`, `@markme/preview-api`,
    `@markme/extension`.
- **Rationale**: simplest setup that works with Vite and tsx (IV).
- **Risk noted for M3**: `node dist/server.js` cannot import `.ts` from `@markme/domain`. M3 picks
  a bundler (e.g. `tsdown`/esbuild) or `tsc` builds of domain. M0's preview API `build` only
  type-emits its own code; M0 does not run `dist/`.

## Resolved summary

| Unknown             | Resolution                                               |
| ------------------- | -------------------------------------------------------- |
| zod 3 vs 4          | zod 4 (R5)                                               |
| Remote cache        | none; `actions/cache` on `.turbo/cache` (R6)             |
| Node version        | 24 LTS (R1)                                              |
| TS / ESLint majors  | TS 6.0, ESLint 9, because of peer ranges (R3, R4)        |
| Five visible checks | five jobs (R7)                                           |
| CLI distribution    | `supabase` dev dependency (R8)                           |
| Secret scan method  | pinned gitleaks CLI over the PR commit range (R12)       |
| Merge blocking      | repository ruleset on `main` + `[0-9][0-9][0-9]-*` (R13) |

No `NEEDS CLARIFICATION` remains.
