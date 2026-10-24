# Research: Move to Supabase publishable and secret API keys

**Feature**: `005-supabase-api-keys` | **Date**: 2026-10-24 | **Plan**: [plan.md](./plan.md)

The spec's Background section already covers the Supabase key model (sources listed there). This
file records the decisions the plan needs, plus what was checked on the local stack on 2026-10-24.

## Local stack probe (2026-10-24, CLI 2.121.0)

- `pnpm exec supabase status -o env --workdir packages/database` prints `PUBLISHABLE_KEY` and
  `SECRET_KEY` next to `ANON_KEY`, `SERVICE_ROLE_KEY` and `JWT_SECRET`.
- The local publishable key is 46 characters, shaped `sb_publishable_<22 chars>_<8 chars>`, all
  characters in `[A-Za-z0-9_]`.
- With only `apikey: <publishable>` (no `Authorization` header): `POST /auth/v1/signup` → 200,
  password grant → 200 with an ES256 user token, then `GET /rest/v1/folders` with
  `Authorization: Bearer <user token>` → 200 `[]`. Sign-in and an owned query work on the
  publishable key with no other change.
- `GET /rest/v1/folders` with the publishable key and no user token → 401. Expected: M1 revokes
  all table privileges from `anon`, so this is the grant, not the key.

## R1. Extension variable name

- **Decision**: `WXT_SUPABASE_PUBLISHABLE_KEY` replaces `WXT_SUPABASE_ANON_KEY`.
- **Rationale**: FR-001 wants a name that says "publishable". It matches Supabase's own naming
  (`PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`) and keeps the `WXT_` prefix that WXT/Vite needs
  to expose the value to the bundle.
- **Alternatives considered**: `WXT_SUPABASE_KEY` (does not say which kind; a secret key "fits"
  the name); keep `WXT_SUPABASE_ANON_KEY` with new contents (name lies, and the `anon` wording
  keeps coming back in docs).

## R2. Validation rule for the publishable key

- **Decision**: `z.string().regex(/^sb_publishable_[A-Za-z0-9_-]{20,}$/)` with the description
  "a publishable key (sb_publishable_…) printed by `pnpm exec supabase status`".
- **Rationale**: The prefix alone rejects every wrong kind in FR-002: legacy JWTs (`eyJ…`),
  secret keys (`sb_secret_…`), placeholders (`replace-with-…`) and short junk. The charset and
  minimum length reject truncated pastes. `-` is allowed because Supabase does not document the
  random part's alphabet; base64url is the safe superset. `parseEnv` already reports only the key
  and the expected kind, never the value (FR-002, "never echoing").
- **Alternatives considered**: separate refinements per wrong kind with their own messages
  (more code and a schema that no longer maps to one `expected` string per key, for no gain:
  one message already says what is expected); exact length 46 (Supabase does not promise a
  length, and the hosted key could differ).

## R3. Old variable name in an existing `.env`

- **Decision**: No special case. A `.env` with only `WXT_SUPABASE_ANON_KEY` fails as
  `WXT_SUPABASE_PUBLISHABLE_KEY: missing`, followed by `parseEnv`'s line pointing to
  `apps/extension/.env.example`. `.env.example` gains a one-line comment saying the old name is
  gone.
- **Rationale**: This already meets US2 scenario 3 (names the new variable, points to
  `.env.example`). WXT/Vite loads only keys the schema reads, so the stale key is ignored, never
  shipped. A dedicated "old name detected" check is code that is useful for one week (Simple
  First).
- **Alternatives considered**: detect `WXT_SUPABASE_ANON_KEY` and print a migration hint
  (rejected above); let `pnpm dev` rewrite the `.env` (breaks the "never overwrite" rule).

## R4. `pnpm dev` env generator

- **Decision**: `scripts/dev-env.mjs` reads `API_URL` and `PUBLISHABLE_KEY` only (allowlist),
  maps `PUBLISHABLE_KEY` to `WXT_SUPABASE_PUBLISHABLE_KEY`, and throws `Missing PUBLISHABLE_KEY`
  when it is absent. No fallback to `ANON_KEY`.
- **Rationale**: FR-003. The existing allowlist parser already throws a key-named error without
  values; only the constant changes. The pinned CLI prints the key (probe above), so no upgrade.
- **Alternatives considered**: fall back to `ANON_KEY` on older CLIs (explicitly forbidden by
  FR-003).

## R5. Client factory option name

- **Decision**: `createMarkMeClient({ url, publishableKey, storage, detectSessionInUrl })`.
  The value is passed to `createClient` as its second argument, as before. Auth options unchanged.
- **Rationale**: FR-004. No app calls the factory yet (M4 is the first caller), so the rename
  needs no compatibility alias. `supabase-js` `^2.118.0` takes the publishable key in the same
  argument (probe above with raw HTTP; the library sends it as `apikey` and only a user token
  as `Authorization: Bearer`).
- **Alternatives considered**: `apiKey` / `key` (generic; the factory is for clients, and a
  client must only ever get the publishable key, so the name should say so); keeping `anonKey`
  as a deprecated alias (no callers to protect).

## R6. Release-bundle secret check

- **Decision**: Build `scripts/check-bundle-secrets.mjs` now. A pure function scans file
  contents and returns findings; a thin CLI walks a directory (default
  `apps/extension/.output/chrome-mv3`) and exits non-zero on any finding. It flags:
  `sb_secret_` followed by at least 20 key characters (`[A-Za-z0-9_-]`); the identifier
  `SERVICE_ROLE`; any JWT-shaped string
  (`eyJ…​.eyJ…​.…`) whose base64url payload decodes to JSON with `role` equal to `anon` or
  `service_role`. Findings report file path and kind only, never the matched text. Unit tests run
  with the existing `vitest run --dir scripts`.
- **Why a full key, not the bare prefix**: `supabase-js` 2.118 ships the literal `"sb_secret_"`
  in `isNewApiKey` (`key.startsWith("sb_secret_")`), so every real extension bundle contains the
  prefix. A bare-prefix rule would fail every build. A test pins this: the string
  `key.startsWith("sb_secret_")` must produce no finding. `SERVICE_ROLE` does not appear in the
  library's runtime code (checked 2026-10-24); the quickstart re-checks on a real build.
- **Rationale**: FR-006 and US2's independent test need a working check, not a plan entry. M8
  planned this exact script; building it here moves it earlier and adds the `anon` role, which
  M8's design did not check. A CI job that builds the extension and runs the check stays in M8
  with the release workflow: CI does not build the extension today, and a new required check
  changes the `ci-gate` ruleset, which is out of scope.
- **Alternatives considered**: grep in a shell step (cannot decode JWT payloads to tell a user
  token from a project key); `gitleaks` on the bundle (its default rules do not know `sb_secret_`
  and do not inspect JWT roles; extra config for the same result); add the CI job now (needs a
  CI `.env`, an extension build in CI and a ruleset change; belongs with the release work).

## R7. Secret key for test-only elevated access

- **Decision**: Name it `SUPABASE_SECRET_KEY` in the env table, "tests and seed scripts only".
  No code changes: nothing in the repo uses an elevated key today (pgTAP runs as `postgres`
  inside the database).
- **Rationale**: FR-007. Documenting the name now stops M4–M8 work from introducing
  `SUPABASE_SERVICE_ROLE_KEY`.
- **Alternatives considered**: keep `SUPABASE_SERVICE_ROLE_KEY` (legacy JWT; breaks on removal).

## R8. Preview API

- **Decision**: No change. Its env (`apps/preview-api/.env.example`, `src/env.ts`) has no project
  API key; it verifies user tokens through JWKS (ES256), as M3 built.
- **Rationale**: FR-008 is already true. The README's manual token steps are the only preview-api
  file that changes (they use `ANON_KEY` and send it as `Authorization: Bearer`; the new steps
  send the publishable key in `apikey` only, as probed).

## R9. Verifying FR-005 (behavior parity)

- **Decision**: Verify through the quickstart on the local stack (sign up, sign in, owned query,
  cross-user denial) with the publishable key. No new automated integration test.
- **Rationale**: RLS and grants are keyed on the Postgres role (`anon` / `authenticated`), which
  the publishable key maps to exactly as the anon key did; the pgTAP suite already covers
  two-user read, write and denial. A TS integration test against a live stack is new
  infrastructure (CI starts the stack only in the `db` job) for a check that does not depend on
  MarkMe code. M4's Playwright smoke will exercise the real path on the new key.
- **Alternatives considered**: a Vitest suite hitting `127.0.0.1:54321` (needs the stack in the
  `test` job or a new job; rejected for this feature).

## R10. Hosted project cutover

- **Decision**: Manual owner steps, in order: (1) copy the hosted publishable key from the
  dashboard (API Keys → "Publishable and secret API keys"), create it if absent; (2) record it as
  a public value where the M8 release config will read it (GitHub variable
  `WXT_SUPABASE_PUBLISHABLE_KEY`, set with `gh variable set`); (3) after US1, US2 and US4 merge,
  run the hosted check (sign-in with the publishable key, then M3 V6's 401/200/422/200 against the
  deployed preview API); (4) disable legacy keys in the dashboard ("Disable JWT-based API keys");
  (5) rerun step 3 and confirm the old anon key is refused; (6) record the result in the spec's
  tasks. Never create or store a hosted secret key: nothing needs one.
- **Rationale**: FR-010, FR-011, SC-004, SC-005. Dashboard actions are owner-only, like
  `pnpm db:push`. Disabling is reversible until Supabase's final removal (spec edge case).
- **Alternatives considered**: Management API automation (needs a personal access token in CI
  for a one-time step); leave legacy keys on (a pause/restore or the removal date would still
  break builds made before this feature).

## R11. Decision log entry

- **Decision**: Add **A55** to `docs/IMPLEMENTATION_PLAN.md` §4: "Clients use the publishable key
  (`WXT_SUPABASE_PUBLISHABLE_KEY`, factory option `publishableKey`); test/seed code uses
  `SUPABASE_SECRET_KEY`; legacy `anon`/`service_role` keys are disabled on the hosted project.
  Reason: Supabase removes legacy keys in late 2026, and a free-plan project restored after a pause
  comes back without them." A31 is updated to the new option name.
