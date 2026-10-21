# Implementation Plan: M1 Database Schema + Access Rules

**Branch**: `002-m1-database-schema` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-m1-database-schema/spec.md`. Technical design from
`docs/IMPLEMENTATION_PLAN.md` §3 M1 and §4 (A1, A3, A4, A11–A20, approved).

## Summary

M1 adds the MarkMe data layer to `packages/database`. It is delivered as nine migrations and eight
pgTAP test files.

- **Tables**: `profiles`, `folders`, `tags`, `items` and `item_tags`, with the PRD §6 fields
  amended by A1, A12 and A19.
- **Product rules as constraints**: per-user unique normalized URL; case-insensitive unique
  folder and tag names; length caps (A18); embed checks (A19). A composite FK stops an item from
  being put in another user's folder.
- **Three-layer access control**:
  1. Explicit privileges. `anon` gets nothing. `authenticated` gets column allowlists for insert
     and update (A15, A16) and no TRUNCATE (R2).
  2. `to authenticated` RLS policies on every table. `item_tags` checks ownership of both sides.
  3. Constraints that hold for every role.
- **Search**: a trigger-maintained `simple` tsvector (A4) covers title, tag names, note,
  description and URL words. One `security invoker` RPC, `search_items`, does word-prefix
  matching (A14), the no-folder filter (A13), the ALL-tags filter (A3), ranking and offset pages.
- **Internal functions**: kept in a non-exposed `private` schema (R4). The vector refresh runs
  with owner rights, so locked columns stay locked (R5).
- **Delivery**: generated types plus small re-exports. A new `pnpm db:push`. One free Supabase
  Cloud project in Frankfurt, pushed manually (A11).

## Technical Context

**Language/Version**: SQL on PostgreSQL 17 (local 17.11; R1) and PL/pgSQL for functions.
TypeScript 6.0 for the generated types and package index.

**Primary Dependencies**: The Supabase CLI 2.121 is already a pinned dev dependency, and pgTAP 1.3.3
ships with the Supabase image. **No new dependencies.** pgTAP is enabled by `supabase test db`, not
by a migration (R8).

**Storage**: Local Supabase Postgres in Docker. Production is one Supabase Cloud free project,
`markme`, in `eu-central-1` (R10).

**Testing**: pgTAP through `pnpm db:test` (`supabase test db`). Shared two-user helpers are
`\ir`-included from `tests/helpers/identity.psql` (R9). Coverage:

- `010`: schema, RLS flags and privileges.
- `020`–`060`: per-table behavior.
- `070`: search.

The existing CI `db` job runs them all, plus the type-drift check.

**Target Platform**: Supabase Postgres, both local (CLI + Docker, Linux) and Supabase Cloud.

**Project Type**: The database package of the monorepo: migrations, tests and generated types.

**Performance Goals**: No user-facing budget is measured in M1. The design must not block search
under 500 ms on 10,000 items (SC-008, measured in M6). It gets there with a GIN index on
`search_vector`, a list index on `(user_id, created_at desc, id desc)`, and `(select auth.uid())`
in policies.

**Constraints**:

- Free tier only.
- No DB password or project ref in git or CI (A11).
- Every table ships with its grants and RLS in the same migration and PR (constitution I).
- Client-facing text never reaches `to_tsquery` raw (A14).

**Scale/Scope**:

- 5 tables, 3 enums, 1 RPC and 6 internal functions.
- 9 migrations, 8 test files, 1 new root script and 1 README section.
- Personal-collection scale: up to about 10,000 items per user.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below)._

| Principle / constraint                                                         | How M1 complies                                                                                                                                                                                                                        | Status                                 |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| I. RLS on every user-data table; no table merges without policies              | RLS enabled on all five tables. Each table's migration and PR include its policies and grants (T007–T009). `010` asserts `relrowsecurity` for all five                                                                                 | ✅                                     |
| I. Ownership from `auth.uid()`; never trust a submitted user id                | `user_id default auth.uid()`. `user_id` is never granted, so naming it fails with `42501` (A16). Policies check `user_id = (select auth.uid())`                                                                                        | ✅                                     |
| I. Policies tested with two users: read, write, cross-user denial              | `020`–`060` run each operation as A and as B ([access matrix](contracts/access-matrix.md) "Expected outcomes")                                                                                                                         | ✅                                     |
| I. Secrets only in env/secret store; none in git                               | The cloud DB password goes only into Mostafa's password manager, and the project ref only into git-ignored `.temp/`. No CI secret (R10)                                                                                                | ✅                                     |
| I. Embeds stored as provider + validated id, never HTML                        | `embed_provider` enum + `embed_id` format check; no markup column (A19)                                                                                                                                                                | ✅                                     |
| II. `packages/database` owns migrations and generated types                    | Yes. The package exports types only; the client factory stays in `domain` (M2)                                                                                                                                                         | ✅                                     |
| II. Schema changes only through migrations; regenerate types                   | Nine migrations made with `pnpm db:new`. `db:types` is committed and the drift check is in CI                                                                                                                                          | ✅                                     |
| III. pgTAP for RLS, uniqueness, FTS ranking                                    | `030`–`060` cover uniqueness; `070` covers ranking and filters                                                                                                                                                                         | ✅                                     |
| III. Never weaken a test                                                       | No test is skipped. Each privilege widening fails `010`                                                                                                                                                                                | ✅                                     |
| IV. Simple first; no new dependency without reason                             | No new dependency. The `private` schema (R4) is the one new structure, and it replaces per-function revokes as the main guard. Offset pagination; trigger FTS over a search-time join (approved design)                                | ✅                                     |
| IV. YAGNI / non-goals                                                          | No Realtime, no nested folders, no sharing. `save_item` waits for M5 (A2)                                                                                                                                                              | ✅                                     |
| V. Database is the source of truth; no duplicate URLs                          | `unique (user_id, normalized_url)` with the shared normalizer's output (A17)                                                                                                                                                           | ✅                                     |
| V. Save never blocks on preview                                                | `preview_status` defaults to `pending`; the client updates it later (M5)                                                                                                                                                               | ✅                                     |
| V. Folder delete → no folder; tag delete → removed; no implicit item delete    | `on delete set null (folder_id)`; `item_tags` cascades; items are deleted only explicitly or with the account                                                                                                                          | ✅                                     |
| VI. Quality UX                                                                 | No UI in M1. Search behavior (prefix match, punctuation-safe, no-folder) serves M6's UX                                                                                                                                                | ✅ n/a                                 |
| Tech: Supabase Postgres; Postgres FTS over title, description, note, URL, tags | Yes, config `simple` (A4)                                                                                                                                                                                                              | ✅                                     |
| Free tiers                                                                     | One free project (the free plan allows two). Pausing after 7 idle days is accepted                                                                                                                                                     | ✅                                     |
| Workflow: one PR per task into the milestone branch; `pnpm dev` keeps working  | M1 trials one commit per task and one PR per user story (PR table in tasks.md), approved by Mostafa on 2026-10-21 for M1 only; `pnpm dev` still must keep working after every merge. Migrations apply on `pnpm dev`'s `supabase start` | ⚠️ justified (see Complexity Tracking) |

**Gate result: PASS**, with one justified, time-boxed exception (Workflow row; see Complexity Tracking).

**Post-design re-check (after Phase 1): PASS.** The design added stronger guards (R2–R5) and no new
dependency or service.

**Deviations from `docs/IMPLEMENTATION_PLAN.md`** (not constitution violations; copied back into
that file in this change, per its change rule):

1. `anon` loses all grants. `authenticated` loses TRUNCATE, REFERENCES and TRIGGER. EXECUTE is
   revoked from client roles except on `search_items`. `010` asserts the privileges (R2).
2. **Approved 2026-10-21:** `profiles` gets an `update (display_name)` allowlist and a
   100-character cap. The sign-up function truncates the name (R3).
3. Internal functions move to a non-exposed `private` schema (R4).
4. The vector-refresh trigger functions are `security definer`, so they work under A15 (R5).
5. `updated_at` moves on item column edits only, not on search-data refreshes (R6).
6. `search_items` is plpgsql with `returns table`. Its quoting, clamping and stable tie-break are
   pinned down (R7).
7. No `create extension pgtap` in migrations (R8). Helpers live in `tests/helpers/identity.psql`
   (R9).
8. A new root script, `db:push` (R10).

## Project Structure

### Documentation (this feature)

```text
specs/002-m1-database-schema/
├── plan.md              # this file
├── research.md          # Phase 0: R1–R11
├── data-model.md        # Phase 1: schemas, enums, tables, triggers, delete effects
├── quickstart.md        # Phase 1: validation runbook V1–V6
├── contracts/
│   ├── access-matrix.md     # privileges, RLS, constraints, expected outcomes
│   ├── search-items.md      # search RPC signature, behavior, errors, test cases
│   └── database-package.md  # exports, files, root commands, README section
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root, end of M1)

```text
.
├── package.json                          # + "db:push"
├── README.md                             # + "Database" section
└── packages/database/
    ├── src/
    │   ├── index.ts                      # re-exports generated helpers + SearchItemRow
    │   └── types.gen.ts                  # regenerated, committed
    └── supabase/
        ├── migrations/                   # 9 files (see contracts/database-package.md)
        └── tests/
            ├── helpers/identity.psql
            └── 000…070 *.test.sql
```

**Structure Decision**: All work stays in `packages/database`, plus one root script and the README.
No app code changes in M1.

### Task shape

The authoritative task list, migration names and PR grouping live in [tasks.md](tasks.md)
(Workflow PR table and T001–T022). Each table's migration task carries its own grants, RLS and
pgTAP proof; US2 adds `name_rules`, `item_rules` and `items_updated_at`; US3 adds
`search_vector` and `search_items`.

## Complexity Tracking

| Violation                                                                            | Why needed                                                                             | Simpler alternative rejected because                                                                                                   |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| One PR per user story instead of one PR per task (constitution Development Workflow) | Trial on one milestone: fewer, story-sized PRs that each prove a user story end to end | One PR per task stays the rule and the fallback; the trial is decided after M1 (T022): amend the constitution and CLAUDE.md, or revert |
