---
description: "Task list for the move to Supabase publishable and secret API keys"
---

# Tasks: Move to Supabase publishable and secret API keys

**Input**: design documents in `specs/005-supabase-api-keys/`. Read these before starting a task:

- [spec.md](spec.md): US1–US4, FR-001–FR-011, SC-001–SC-005
- [plan.md](plan.md): delivery order, risks
- [research.md](research.md): R1–R11 (the reason behind each rule below) and the local stack probe
- [data-model.md](data-model.md): key kinds, env variables, bundle-check findings, hosted key states
- [contracts/](contracts/): `extension-env.md`, `client-factory.md`, `dev-env-generator.md`,
  `bundle-secret-check.md`
- [quickstart.md](quickstart.md): local checks L1–L5, hosted checks H1–H5, docs sweep

**Prerequisites**: M3 merged on `main` (PR #62). Pinned Supabase CLI 2.121.0 prints
`PUBLISHABLE_KEY` (research, local probe).

Constitution III requires tests, so every code task includes its tests.

## How every code task runs

Each code task is one red → green → commit loop:

1. **Test first.** Change or write the test file(s) under _Test first_ and run the focused command.
   They must fail (a renamed key, a missing module or a missing rule), not pass by accident.
2. **Implement.** Change the files under _Implement_ until those tests pass.
3. **Done check.** Run every command under _Done when_. All must pass.
4. **Commit.** Use the message given. Every commit is green.

Rules for all tasks:

- Paths are relative to the repo root.
- Non-interactive shells start with `source ~/.nvm/nvm.sh && nvm use`.
- No new dependency (plan, Technical Context).
- Never put a real key in a committed file. Test fixtures are fake strings; JWT fixtures are built
  inside the test from JSON payloads (keeps gitleaks quiet). Placeholders use
  `replace-with-[a-z0-9-]+` and never-echo sentinels use `SENTINEL-…` (both already allowlisted in
  `.gitleaks.toml`).
- No error message, finding or log line ever contains a key value.
- Never weaken, skip or `.only` a test. Tests that named the anon key are renamed to the
  publishable key and keep every assertion; rejection cases are only added.
- An existing `.env` is never rewritten (`ensureEnvFile` keeps its `wx` flag).

## Workflow

- **One task = one commit**, Conventional Commits, ending with the task id.
- **One PR per user story** into `005-supabase-api-keys`. All five required CI checks green before
  merge.
- **Before opening each PR**, run the guard skills that match the diff: `clean-code-guard` on
  production code, `test-guard` on tests, `docs-guard` on docs.

  | PR  | Branch                    | Tasks     | Proves                                  |
  | --- | ------------------------- | --------- | --------------------------------------- |
  | 1   | `keys/us1-local-dev`      | T002–T004 | US1 (`pnpm dev` on the publishable key) |
  | 2   | `keys/us2-reject-wrong`   | T005–T007 | US2 (validation + bundle check)         |
  | 3   | `keys/us4-docs`           | T008–T011 | US4 (docs, A55)                         |
  | 4   | `keys/us3-hosted-cutover` | T012–T014 | US3 (hosted legacy keys disabled)       |

- PRs run **in this order**. US4 comes before US3 because US3's precondition is "every component
  and doc uses the publishable key" (plan, Delivery order). Each story branch starts from the
  updated `005-supabase-api-keys` after the previous PR merges.
- After T015 passes, the feature PR `005-supabase-api-keys` → `main` is opened. Mostafa merges it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task).
- **[Story]**: US1 = local dev, US2 = wrong keys rejected, US3 = hosted cutover, US4 = docs.

---

## Phase 1: Setup

**Purpose**: put the feature branch on GitHub so story PRs can target it.

- [ ] T001 Commit the design documents and this task list, and publish the feature branch.
  - **Files**: `specs/005-supabase-api-keys/**` (spec, checklist, plan, research, data-model,
    contracts, quickstart, tasks).
  - **Steps**:
    1. On `005-supabase-api-keys`, commit with `docs(keys): add spec, plan and task list (T001)`.
    2. Run `git ls-remote --heads origin 005-supabase-api-keys`. If it prints nothing, **ask
       Mostafa**, then run `git push -u origin 005-supabase-api-keys`. The `ci-gate` ruleset
       covers `NNN-*` branches.
    3. Run `git switch -c keys/us1-local-dev`.
  - **Done when**: `origin/005-supabase-api-keys` has the docs commit and the current branch is
    `keys/us1-local-dev`.

---

## Phase 2: Foundational

None. No migration, package or shared module is needed before the stories (plan, Structure
Decision). US1 starts right after T001.

---

## Phase 3: User Story 1 - Local development runs on the publishable key (P1) 🎯 MVP

**Goal**: `pnpm dev` on a clean checkout writes the local publishable key under
`WXT_SUPABASE_PUBLISHABLE_KEY`, never any other Supabase key; the factory takes `publishableKey`
(FR-001, FR-003, FR-004, FR-005).

**Independent test**: quickstart L1–L3. Fresh `.env` holds one `sb_publishable_` line and no
`eyJ|sb_secret_|ANON|SERVICE`; sign-in and an owned query succeed with the publishable key;
`pnpm db:test` passes.

- [ ] T002 [P] [US1] Rename the client factory option `anonKey` to `publishableKey` (R5,
      contracts/client-factory.md) in `packages/domain/src/client/factory.ts`.
  - **Files**: `packages/domain/src/client/factory.ts`,
    `packages/domain/src/client/factory.test.ts`.
  - **Test first** (`factory.test.ts`):
    - Rename the `ANON_KEY` constant to `PUBLISHABLE_KEY` with the value
      `"sb_publishable_test_00000000000000000000"`.
    - Replace every `anonKey: ANON_KEY` with `publishableKey: PUBLISHABLE_KEY`. Keep every
      assertion, including `createClient` called with `(PROJECT_URL, PUBLISHABLE_KEY, { auth: {
storage, flowType: "pkce", autoRefreshToken: true, persistSession: true,
detectSessionInUrl } })`.
    - Run `pnpm --filter @markme/domain exec vitest run src/client/factory.test.ts` and
      `pnpm --filter @markme/domain typecheck`: typecheck fails on the unknown option.
  - **Implement** (`factory.ts`): in `CreateMarkMeClientOptions` and the destructuring, rename
    `anonKey` to `publishableKey`; pass it as `createClient`'s second argument. No `anonKey`
    alias, no key-shape validation, auth options unchanged.
  - **Done when**: `pnpm --filter @markme/domain test` (100% coverage gate still green),
    `pnpm typecheck`, `pnpm lint` pass; `git grep -n anonKey -- packages/` prints nothing.
  - **Commit**: `refactor(domain): rename factory option anonKey to publishableKey (T002)`.

- [ ] T003 [P] [US1] Switch the extension env to `WXT_SUPABASE_PUBLISHABLE_KEY` end to end:
      schema, `.env.example` and the `pnpm dev` generator, in one commit so `pnpm dev` works at
      every commit (R1, R3, R4, contracts/extension-env.md, contracts/dev-env-generator.md).
  - **Files**: `apps/extension/src/lib/env-schema.ts`,
    `apps/extension/src/lib/env-schema.test.ts`, `apps/extension/.env.example`,
    `scripts/dev-env.mjs`, `scripts/dev-env.test.mjs`.
  - **Test first**:
    - `env-schema.test.ts`: rename the key `WXT_SUPABASE_ANON_KEY` → `WXT_SUPABASE_PUBLISHABLE_KEY`
      everywhere (fixtures, `it.each` tables, sorted-issues test, message test, sentinel test,
      lock test). The valid fixture becomes `PUBLISHABLE_KEY =
"sb_publishable_test_00000000000000000000"`. The expected text constant becomes
      `PUBLISHABLE_KEY_EXPECTED = "a publishable key (sb_publishable_…) printed by \`pnpm exec
      supabase status\`"`, and the full-message assertion uses the line
`" - WXT_SUPABASE_PUBLISHABLE_KEY: invalid, expected a publishable key (sb_publishable_…) printed by \`pnpm exec supabase status\`"`.
Keep the existing invalid rows (`"replace-with-local-publishable-key"`, `"short"`). In the
lock test, the sorted keys are `["WXT_PREVIEW_API_URL", "WXT_SUPABASE_PUBLISHABLE_KEY",
      "WXT_SUPABASE_URL"]`and the name regex becomes`/SERVICE|SECRET|JWT|ANON/`.
    - `dev-env.test.mjs`:
      - Status fixture keeps all its lines (`ANON_KEY`, `SERVICE_ROLE_KEY`, `SECRET_KEY`,
        `JWT_SECRET`, …). Add `ANON_KEY` to `privilegedValues` so every leak assertion also covers
        it.
      - `parseStatusEnv` returns exactly `{ API_URL, PUBLISHABLE_KEY }` (quoted and unquoted
        cases).
      - Missing `PUBLISHABLE_KEY` (with `ANON_KEY` still present) throws a message containing
        `PUBLISHABLE_KEY` and none of the status values.
      - `appEnvValues("extension", …)` returns `{ WXT_SUPABASE_URL, WXT_SUPABASE_PUBLISHABLE_KEY,
WXT_PREVIEW_API_URL: "http://127.0.0.1:8787" }`; the preview-api row is unchanged.
      - The extension example fixture and the generated-file test use
        `WXT_SUPABASE_PUBLISHABLE_KEY=replace-with-local-publishable-key`, and the generated
        content contains no `ANON_KEY`, `SERVICE_ROLE_KEY` or `SECRET_KEY` value.
    - Run `pnpm --filter @markme/extension exec vitest run src/lib/env-schema.test.ts` and
      `pnpm exec vitest run --dir scripts`: both fail.
  - **Implement**:
    - `env-schema.ts`: rename the key to `WXT_SUPABASE_PUBLISHABLE_KEY`; keep the current rule
      (`min(20)`, rejects `replace-with-`) and change only `.describe(...)` to
      `"a publishable key (sb_publishable_…) printed by \`pnpm exec supabase status\`"`. The strict
      prefix rule is T005.
    - `apps/extension/.env.example`: replace the two anon-key lines with exactly:

      ```text
      # Publishable key (sb_publishable_…) from `pnpm exec supabase status`. pnpm dev fills this in.
      # Never a secret key, service-role key or legacy anon JWT. (Replaces WXT_SUPABASE_ANON_KEY.)
      WXT_SUPABASE_PUBLISHABLE_KEY=replace-with-local-publishable-key
      ```

    - `scripts/dev-env.mjs`: `STATUS_KEYS = ["API_URL", "PUBLISHABLE_KEY"]`; the allowlist check,
      JSDoc types and return object use `PUBLISHABLE_KEY`; `appEnvValues("extension")` maps
      `WXT_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY`. No fallback to `ANON_KEY`.
      `fillExample` and `ensureEnvFile` unchanged.
  - **Done when**: `pnpm --filter @markme/extension test`, `pnpm exec vitest run --dir scripts`,
    `pnpm typecheck`, `pnpm lint` pass; `git grep -nI ANON_KEY -- apps scripts` prints only the
    `.env.example` "Replaces WXT_SUPABASE_ANON_KEY" comment and the `ANON_KEY` lines of the
    dev-env status fixture and tests, plus `apps/preview-api/README.md` (fixed in T008).
  - **Commit**: `feat(extension): configure the publishable key instead of the anon key (T003)`.

- [ ] T004 [US1] Run quickstart L1–L3 on the local stack (depends on T002, T003). No code change.
  - **Steps**: `pnpm db:start`; move both app `.env` files aside (L1), run `pnpm dev`, run the two
    `grep` checks; run L2's signup → password grant → `GET /rest/v1/folders` with only
    `apikey: $PUBLISHABLE_KEY` plus the user token; run `pnpm db:test`; run
    `pnpm exec vitest run --dir scripts` (L3). Restore the `.env.bak` files only if Mostafa wants
    them back (they hold the old key name and will now fail validation by design).
  - **Done when**: L1 prints `1` then `0` per file; L2 prints `200`, `[]`, `200`; `pnpm db:test`
    and the scripts suite pass. Record the date and results under this task.
  - **Commit**: none (record lands with the PR's last commit, or in T015).

**Checkpoint**: open PR 1 (`keys/us1-local-dev` → `005-supabase-api-keys`). A fresh checkout runs
on the publishable key.

---

## Phase 4: User Story 2 - Wrong keys are rejected before they ship (P1)

**Goal**: extension validation accepts only `sb_publishable_…` values; a release bundle with a
secret key, a legacy `anon`/`service_role` JWT or the `SERVICE_ROLE` name fails its check (FR-002,
FR-006).

**Independent test**: `pnpm --filter @markme/extension test` refuses every wrong kind;
quickstart L4 and L5 (real build passes, planted secret and anon keys fail, no key text printed).

- [ ] T005 [US2] Enforce the publishable-key shape in
      `apps/extension/src/lib/env-schema.ts` (R2, contracts/extension-env.md; depends on T003).
  - **Files**: `apps/extension/src/lib/env-schema.ts`,
    `apps/extension/src/lib/env-schema.test.ts`.
  - **Test first** (`env-schema.test.ts`), add rows to the invalid `it.each` table, each expecting
    `{ key: "WXT_SUPABASE_PUBLISHABLE_KEY", kind: "invalid", expected: PUBLISHABLE_KEY_EXPECTED }`:
    - a legacy JWT shape `"eyJhbGciOiJIUzI1NiJ9.fake.fake-signature"` (keep the payload part short and
      non-JSON: gitleaks flags JWT-shaped strings whose parts look real);
    - `"sb_secret_test_00000000000000000000"`;
    - `"sb_publishable_short"` (fewer than 20 characters after the prefix);
    - `"sb_publishable_has spaces_000000000000"` (character outside `[A-Za-z0-9_-]`).
    - Keep `"replace-with-local-publishable-key"` and `"short"`.
    - Add a `missing` case for an old-style source that has `WXT_SUPABASE_ANON_KEY` set and no
      `WXT_SUPABASE_PUBLISHABLE_KEY`: issues equal `[{ key: "WXT_SUPABASE_PUBLISHABLE_KEY", kind:
"missing", expected: PUBLISHABLE_KEY_EXPECTED }]`, the message ends with
      `Copy apps/extension/.env.example to apps/extension/.env and fill in the values.`, and the
      result does not contain the old key's value.
    - Add a sentinel case: `WXT_SUPABASE_PUBLISHABLE_KEY = "sb_secret_SENTINEL-key-d4-000000000000"`
      is refused and the value appears in neither `error.message`, `String(error)` nor
      `JSON.stringify(error)`.
    - Run `pnpm --filter @markme/extension exec vitest run src/lib/env-schema.test.ts`: the JWT
      and `sb_secret_` rows fail (the current rule accepts them).
  - **Implement** (`env-schema.ts`): replace the key's rule with
    `z.string().regex(/^sb_publishable_[A-Za-z0-9_-]{20,}$/)` and keep the `.describe(...)` text
    from T003. No per-kind refinements, no special case for the old variable name (R3).
  - **Done when**: `pnpm --filter @markme/extension test`, `pnpm typecheck`, `pnpm lint` pass, and
    `pnpm --filter @markme/extension build` still succeeds with the `.env` from T004.
  - **Commit**: `feat(extension): accept only sb_publishable_ keys (T005)`.

- [ ] T006 [P] [US2] Add the release-bundle secret check `scripts/check-bundle-secrets.mjs`, tests
      first (R6, contracts/bundle-secret-check.md, data-model "Bundle-check finding"). Independent
      of T005; can start alongside US1.
  - **Files**: `scripts/check-bundle-secrets.mjs` (new),
    `scripts/check-bundle-secrets.test.mjs` (new).
  - **Test first** (`check-bundle-secrets.test.mjs`, Vitest, picked up by
    `vitest run --dir scripts`):
    - A `jwt(payload)` helper builds `eyJ…` header + base64url `JSON.stringify(payload)` + a fake
      signature at runtime. No literal JWT in the file.
    - `scanText` positives, one finding each:
      - `"const k='sb_secret_" + "a".repeat(24) + "'"` → `[{ kind: "secret-key" }]`;
      - `"process.env.SUPABASE_SERVICE_ROLE_KEY"` → `[{ kind: "service-role-name" }]`;
      - `jwt({ role: "anon" })` → `[{ kind: "legacy-jwt-anon" }]`;
      - `jwt({ role: "service_role" })` → `[{ kind: "legacy-jwt-service_role" }]`.
    - `scanText` negatives, each `[]`:
      - `'key.startsWith("sb_secret_")'` (shipped by `supabase-js`; R6 pins this);
      - `"sb_secret_" + "a".repeat(10)` (fewer than 20 key characters);
      - `"sb_publishable_" + "a".repeat(30)`;
      - `jwt({ role: "authenticated" })`;
      - an `eyJ…` triple whose payload is not valid JSON.
    - Findings carry only `kind` (and `file` for `scanDirectory`); assert
      `JSON.stringify(findings)` never contains the planted key text.
    - `scanDirectory`: in a `mkdtemp` dir, write `a.js` (clean) and `nested/b.js` (planted secret
      key); expect `[{ file: "nested/b.js", kind: "secret-key" }]`. Clean up in `afterEach`.
    - CLI (spawn `node scripts/check-bundle-secrets.mjs <dir>` with `node:child_process`):
      clean dir → exit 0 and stdout `bundle-secrets: no findings in <dir>`; dir with a planted
      key → exit 1, one line `bundle-secrets: secret-key in nested/b.js`, and no key text in
      stdout or stderr; missing dir → exit 2 with a message telling the user to build first.
    - Run `pnpm exec vitest run --dir scripts`: fails (module missing).
  - **Implement** (`check-bundle-secrets.mjs`, ESM with JSDoc types like `dev-env.mjs`):
    - `export function scanText(text)` → `Array<{ kind }>` using exactly these rules:
      - `secret-key`: `/sb_secret_[A-Za-z0-9_-]{20,}/`;
      - `service-role-name`: `/SERVICE_ROLE/`;
      - JWT match `/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g`: base64url-decode the
        middle part, `JSON.parse` in `try`; `role === "anon"` → `legacy-jwt-anon`,
        `role === "service_role"` → `legacy-jwt-service_role`; anything else or a parse error →
        no finding.
    - `export async function scanDirectory(dir)` walks recursively, reads each file as UTF-8,
      returns `{ file: <path relative to dir, "/" separators>, kind }` sorted by file then kind.
    - CLI runs only when the file is executed directly (`import.meta.url` vs `process.argv[1]`):
      default dir `apps/extension/.output/chrome-mv3`; exit codes and lines as in the contract.
      Never print matched text.
    - No CI job and no `package.json` script (R6: the `bundle-secrets` CI job stays in M8).
  - **Done when**: `pnpm exec vitest run --dir scripts`, `pnpm lint`, `pnpm format:check` pass.
  - **Commit**: `feat(scripts): add release-bundle secret check (T006)`.

- [ ] T007 [US2] Run quickstart L4 and L5 against a real extension build (depends on T005, T006).
      No code change unless a check fails (then fix with a failing test first).
  - **Steps**: `pnpm --filter @markme/extension test`; the L4 old-style `.env` spot check (build
    exits 1 with `WXT_SUPABASE_PUBLISHABLE_KEY: missing` and the `.env.example` hint; file not
    rewritten); `pnpm --filter @markme/extension build`; `node scripts/check-bundle-secrets.mjs`
    (expect exit 0, which also confirms `supabase-js`'s bare `"sb_secret_"` and no `SERVICE_ROLE`
    in the bundle); the L5 planted-copy run in a `mktemp -d` dir (expect `secret-key in
planted-secret.js`, `legacy-jwt-anon in planted-anon.js`, exit 1, no key text).
  - **Done when**: all expected outputs match. Record the date and results under this task.
  - **Commit**: none (record lands with the PR's last commit, or in T015).

**Checkpoint**: open PR 2 (`keys/us2-reject-wrong` → `005-supabase-api-keys`).

---

## Phase 5: User Story 4 - Docs and project guidance describe the new keys (P3)

Runs before US3 (see Workflow).

**Goal**: every doc names the publishable key for clients and `SUPABASE_SECRET_KEY` for test-only
elevated access; the decision is logged as A55 (FR-007, FR-009, R7, R11).

**Independent test**: the quickstart docs sweep prints no live anon/service-role-key reference.

- [ ] T008 [P] [US4] Rewrite the token steps in `apps/preview-api/README.md` ("Get a local access
      token") to use the publishable key (R8).
  - **Files**: `apps/preview-api/README.md`.
  - **Change**: the intro names `PUBLISHABLE_KEY` from
    `pnpm exec supabase status --workdir packages/database`; the shell variable becomes
    `PUBLISHABLE_KEY='<PUBLISHABLE_KEY from supabase status>'`; both `curl` calls send only
    `-H "apikey: $PUBLISHABLE_KEY"` (drop `Authorization: Bearer $ANON`). Add one sentence: only
    the user's access token goes in `Authorization: Bearer`, never a project key.
  - **Done when**: the steps work as written against the local stack (signup 200, password grant
    returns an `access_token`, the three preview calls give `unauthorized` / 200 /
    `blocked_target`); `pnpm format:check` passes.
  - **Commit**: `docs(preview-api): get local tokens with the publishable key (T008)`.

- [ ] T009 [P] [US4] Update `docs/IMPLEMENTATION_PLAN.md` to the new keys and log A55 (R7, R10,
      R11).
  - **Files**: `docs/IMPLEMENTATION_PLAN.md`.
  - **Change** (line numbers as of `9efaea4`):
    - §1.4 env table (~L112): `WXT_SUPABASE_ANON_KEY` → `WXT_SUPABASE_PUBLISHABLE_KEY`,
      "Publishable key (`sb_publishable_…`). Never a secret, service-role or legacy anon key".
    - §1.4 env table (~L119): `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY`, "Secret key
      (`sb_secret_…`), only in E2E global setup / seed scripts; never in any app bundle".
    - M2 factory signature (~L798) and M4 entrypoints (~L1039): `anonKey` → `publishableKey`.
    - M7 perf script (~L1335): "anon key" → "publishable key".
    - M8 production config (~L1488): "anon key" → "publishable key (GitHub variable
      `WXT_SUPABASE_PUBLISHABLE_KEY`)".
    - M8 bundle secret check (~L1494–1497): the script exists since this feature; list its rules
      (`sb_secret_` + ≥ 20 key chars, `SERVICE_ROLE`, JWTs with role `anon` or `service_role`);
      keep "runs in CI (`bundle-secrets` job) and in `release.yml`" as M8 work.
    - §4 A31: options become `url`, `publishableKey`, `storage`, `detectSessionInUrl`.
    - §4 new row **A55** after A54, matching the table's columns: "Clients use the publishable
      key (`WXT_SUPABASE_PUBLISHABLE_KEY`, factory option `publishableKey`); test/seed code uses
      `SUPABASE_SECRET_KEY`; legacy `anon`/`service_role` keys are disabled on the hosted
      project." Reason: "Supabase removes legacy keys in late 2026, and a free-plan project
      restored after a pause comes back without them." Alternative: "keep the anon key until
      removal".
  - **Done when**: `git grep -nIiE 'anon[_ ]?key|anonKey|service[_ ]?role[_ ]?key'
docs/IMPLEMENTATION_PLAN.md` prints only lines that say "legacy"; `pnpm format:check` passes.
  - **Commit**: `docs(plan): switch to publishable and secret keys, add A55 (T009)`.

- [ ] T010 [P] [US4] Add the key rule to `CLAUDE.md` (Config paragraph).
  - **Files**: `CLAUDE.md`.
  - **Change**: one sentence after "the extension schema is locked to three public keys by a
    test": clients use only the publishable key (`WXT_SUPABASE_PUBLISHABLE_KEY`, factory option
    `publishableKey`); test/seed code that needs elevated access uses `SUPABASE_SECRET_KEY`; never
    the legacy `anon`/`service_role` keys (A55); `node scripts/check-bundle-secrets.mjs` checks a
    built bundle.
  - **Done when**: `pnpm format:check` passes; `docs-guard` finds every named file, key and command
    real.
  - **Commit**: `docs: note the Supabase key rule in CLAUDE.md (T010)`.

- [ ] T011 [US4] Run the quickstart docs sweep (SC-003; depends on T008–T010).
  - **Command**: `git grep -nIiE 'anon[_ ]?key|anonKey|service[_ ]?role[_ ]?key' --
':!specs/00[1-4]*' ':!pnpm-lock.yaml' ':!specs/005-supabase-api-keys'`.
  - **Done when**: every hit is a "legacy" / "do not use" note, the `.env.example` "Replaces
    WXT_SUPABASE_ANON_KEY" comment, or a test fixture that proves the key is ignored. Fix any other
    hit in the file that owns it (amend into T008–T010's scope with its own commit
    `docs: … (T011)` if needed). Record the result under this task.
  - **Commit**: only if a fix was needed.

**Checkpoint**: open PR 3 (`keys/us4-docs` → `005-supabase-api-keys`). After it merges, every
component and doc uses the publishable key.

---

## Phase 6: User Story 3 - The hosted project drops legacy keys (P2)

**Goal**: production config uses the hosted publishable key, and the hosted project's legacy keys
are disabled with a recorded passing check (FR-010, FR-011, SC-004, SC-005).

**Independent test**: quickstart H2 and H4 both give sign-in 200 and preview API 401 / 200 / 422 /
200; the old anon key is refused after H3.

All three tasks are **owner steps** (dashboard, GitHub variables). The agent prepares commands and
records results but never performs a dashboard action, sets a GitHub variable or handles a
password; **ask Mostafa** before each step. Never create or store a hosted secret key (R10).

- [ ] T012 [US3] Get, check and publish the hosted publishable key (quickstart H1; depends on
      PR 3 merged).
  - **Steps (Mostafa)**: Dashboard → `markme` → Settings → API Keys → "Publishable and secret API
    keys"; create the publishable key if none exists. Check it with the H1 `node -e` regex
    (`/^sb_publishable_[A-Za-z0-9_-]{20,}$/`), then
    `gh variable set WXT_SUPABASE_PUBLISHABLE_KEY --body "$HOSTED_PK"`.
  - **Done when**: the regex check prints `ok` and `gh variable list` shows
    `WXT_SUPABASE_PUBLISHABLE_KEY`.

- [ ] T013 [US3] Hosted baseline check before disabling legacy keys (quickstart H2; depends on
      T012).
  - **Steps (Mostafa runs; agent may prepare the commands)**: L2's sign-in commands with
    `API_URL=https://<ref>.supabase.co`, `apikey: $HOSTED_PK` and a confirmed test user; then M3
    quickstart V6 step 3 against the deployed preview API with that token.
  - **Done when**: sign-in 200; preview API 401 / 200 / 422 / 200. If anything fails, stop: do not
    run T014.

- [ ] T014 [US3] Disable hosted legacy keys, recheck and record (quickstart H3–H5; depends on
      T013 passing).
  - **Files**: `specs/005-supabase-api-keys/tasks.md` (this file).
  - **Steps**: Mostafa clicks "Disable JWT-based API keys" (H3); rerun T013's check (H4) and send
    one request with the old hosted anon key as `apikey` (expect 401). Rollback on any failure:
    re-enable legacy keys in the same dashboard section, fix, retry H4.
  - **Done when**: H4 matches H2 and the old anon key is refused. Write the date, the H2 and H4
    results and "legacy keys disabled" under this task.
  - **Commit**: `docs(keys): record hosted legacy-key cutover (T014)`.

**Checkpoint**: open PR 4 (`keys/us3-hosted-cutover` → `005-supabase-api-keys`). A pause/restore
or Supabase's final removal now needs zero changes (SC-005).

---

## Phase 7: Polish & exit verification

- [ ] T015 Verify the feature end to end and open the feature PR (depends on T001–T014).
  - **Steps**: on the updated `005-supabase-api-keys`, run `pnpm lint`, `pnpm format:check`,
    `pnpm typecheck`, `pnpm test`, `pnpm db:test`; rerun quickstart L1 on a clean checkout
    (SC-001) and the docs sweep (SC-003). Mark T001–T015 done with any recorded results in this
    file, commit `docs(keys): mark tasks done after exit verification (T015)`, then open
    `005-supabase-api-keys` → `main` (PR body via the `pr` skill). Mostafa merges it.
  - **Done when**: all commands pass, all five CI checks are green on the feature PR.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: none; blocks everything.
- **Foundational**: empty.
- **US1 (T002–T004)**: after T001.
- **US2 (T005–T007)**: T005 after T003 (same file, renamed key). T006 has no dependency and may
  start right after T001. T007 after T005 and T006.
- **US4 (T008–T011)**: after PR 1 and PR 2 merge (docs describe the shipped names and the script).
- **US3 (T012–T014)**: after PR 3 merges (FR-011 precondition). Strictly sequential.
- **Polish (T015)**: after everything.

### User story dependencies

- **US1 (P1)**: independent; the MVP.
- **US2 (P1)**: validation half builds on US1's renamed key; the bundle check is independent.
- **US4 (P3)**: needs US1 and US2 merged so docs match code.
- **US3 (P2)**: needs US1, US2 and US4 merged; delivered last despite its P2 priority.

### Parallel opportunities

- T002 (domain factory) and T003 (extension env + dev-env) touch different files.
- T006 (bundle check) can be written while US1 is in review; it lands in PR 2.
- T008, T009, T010 touch different docs files.

---

## Parallel Example: User Story 1

```text
Task: "T002 Rename the factory option anonKey → publishableKey in packages/domain/src/client/factory.ts"
Task: "T003 Switch apps/extension env schema, .env.example and scripts/dev-env.mjs to WXT_SUPABASE_PUBLISHABLE_KEY"
```

## Parallel Example: User Story 4

```text
Task: "T008 Publishable-key token steps in apps/preview-api/README.md"
Task: "T009 Env table, factory calls, M8 bundle check, A31 and A55 in docs/IMPLEMENTATION_PLAN.md"
Task: "T010 Key rule sentence in CLAUDE.md"
```

---

## Implementation Strategy

### MVP first (US1)

1. T001 → T002 + T003 → T004.
2. **Stop and validate**: a fresh `pnpm dev` runs on the publishable key, and M4 could start on it.

### Incremental delivery

1. PR 1 (US1): local dev on the publishable key.
2. PR 2 (US2): wrong keys refused, bundle check available.
3. PR 3 (US4): docs and A55 match the code.
4. PR 4 (US3): hosted legacy keys disabled; recorded.
5. T015: feature PR to `main`.

## Notes

- 15 tasks; 3 have no commit of their own (T004, T007, T013), and T012–T014 are owner steps.
- Rollback for US3 is re-enabling legacy keys in the dashboard until Supabase's final removal.
- The `bundle-secrets` CI job and the release workflow stay in M8 (R6).
