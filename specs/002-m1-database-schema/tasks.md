---
description: "Task list for M1 Database Schema + Access Rules"
---

# Tasks: M1 Database Schema + Access Rules

**Input**: design documents in `specs/002-m1-database-schema/`. Read these first:

- [spec.md](spec.md) (US1–US4, FR-001–FR-032)
- [plan.md](plan.md)
- [research.md](research.md) (R1–R11)
- [data-model.md](data-model.md)
- `contracts/`:
  - [access-matrix](contracts/access-matrix.md)
  - [search-items](contracts/search-items.md)
  - [database-package](contracts/database-package.md)
- [quickstart.md](quickstart.md) (V1–V6)

**Prerequisites**: constitution v1.1.2. M1 trials one PR per user story as a recorded exception
(T004); the rule is decided after M1 (T022). The spec requires automated
tests (FR-009, SC-001–SC-005), so tests are included.

**Tests come first inside each task.** Write or extend the pgTAP file, run `pnpm db:test` and see
the new assertions fail, then write the migration and see them pass. Each task's commit holds both,
so every commit is green.

## Workflow (M1 trial, decided 2026-10-21)

- **One task = one commit.** Conventional Commits, e.g. `feat(db): add folders and tags with RLS
(T008)`.
- **One PR per user story.** A PR groups that story's tasks and targets the milestone branch
  `002-m1-database-schema`. The five required CI checks must be green before merge.

  | PR  | Branch                      | Tasks                                        | Proves    |
  | --- | --------------------------- | -------------------------------------------- | --------- |
  | 1   | `m1/us1-private-collection` | Setup + Foundational + US1 (T001–T010)       | US1       |
  | 2   | `m1/us2-product-rules`      | US2 (T011–T014)                              | US2       |
  | 3   | `m1/us3-search`             | US3 (T015–T016)                              | US3       |
  | 4   | `m1/us4-shared-schema`      | US4 + Polish (T017–T022; T020 has no commit) | US4, exit |

- PRs run **in order**. Each story branch starts from `002-m1-database-schema` after the previous
  PR has merged, because each story builds on the previous story's tables, and every migration
  commit regenerates `packages/database/src/types.gen.ts`, so parallel branches would conflict.
- After T020 and T022, `002-m1-database-schema` → `main` is the milestone PR.
- **Every migration task** follows the same steps:
  1. Create the file with `pnpm db:new <name>` so it gets a real timestamp.
  2. Run `pnpm db:reset && pnpm db:test`.
  3. Run `pnpm db:types`.
  4. Commit `packages/database/src/types.gen.ts` in the same commit. CI's drift check fails
     otherwise.
- Never edit a migration after its PR has merged. Fix forward with a new migration.
- All paths below are under `packages/database/supabase/` unless they start with `/`.

## Test file conventions (all `tests/*.test.sql`)

```sql
begin;
\ir helpers/identity.psql
select plan(<n>);
-- assertions, each with a description naming the rule, e.g. 'B cannot read A''s items'
select * from finish();
rollback;
```

- Update `plan(<n>)` whenever a task appends assertions.
- SQLSTATEs: `42501` permission denied or RLS violation, `23505` unique, `23514` check, `23503` FK,
  `22023` bad search parameters.
- Cross-user update and delete are asserted as **0 rows affected**. Use a CTE with `returning`,
  wrapped in `is((select count(*) …), 0::bigint, …)`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 = private collection, US2 = product rules, US3 = search, US4 = shared schema

---

## Phase 1: Setup (PR 1)

**Purpose**: get the design documents committed, settled and consistent with this task list
before any SQL is written.

- [ ] T001 Commit the M1 Spec Kit artifacts as they stand on `002-m1-database-schema`:
  - `specs/002-m1-database-schema/` (spec, plan, research, data-model, quickstart, contracts,
    checklists, this tasks.md).
  - The pending `/docs/IMPLEMENTATION_PLAN.md` changes.
  - Message: `docs(m1): add spec, plan and tasks for M1`.
  - Then create branch `m1/us1-private-collection` from it for T002–T010.
- [x] T002 Record Mostafa's approval of research R3 (approved 2026-10-21). R3 makes `profiles` grant
      only `update (display_name)`, adds a 100-character `display_name` cap and makes sign-up truncate
      the name.
  - Record the approval in `specs/002-m1-database-schema/research.md` (R3 heading),
    `specs/002-m1-database-schema/plan.md` (deviation 2) and `/docs/IMPLEMENTATION_PLAN.md` (the
    "(proposed, M1 plan R3; pending approval)" text and the changelog line).
- [x] T003 Align the design docs with the story-grouped migration layout. Same content, new
      placement:
  - `specs/002-m1-database-schema/contracts/database-package.md`, "Files" tree: list the nine
    migrations in this order:
    1. `extensions_and_types`
    2. `profiles`
    3. `folders_tags`
    4. `items`
    5. `name_rules`
    6. `item_rules`
    7. `items_updated_at`
    8. `search_vector`
    9. `search_items`

    Keep the sentence that each table's migration carries its own grants and RLS.

  - `specs/002-m1-database-schema/data-model.md`:
    - `set_updated_at` lives in `items_updated_at`.
    - The `gin (search_vector)` index lives in `search_vector`.
    - Name checks and unique name indexes live in `name_rules`.
    - Item checks and `unique (user_id, normalized_url)` live in `item_rules`.
  - `specs/002-m1-database-schema/plan.md`:
    - "Task shape" table: point to tasks.md and the PR table above.
    - Summary/Scale: 9 migrations.
    - Constitution Check "Workflow" row: one PR per user story.
  - `/docs/IMPLEMENTATION_PLAN.md` §3 M1 task list: the same, per its change rule.
- [x] T004 Record the PR-per-story trial (approved by Mostafa on 2026-10-21 for M1 only):
  - The constitution ("one commit and one PR per task") stays unchanged for now.
  - `specs/002-m1-database-schema/plan.md`:
    - Constitution Check "Workflow" row: one commit per task, one PR per user story, as an M1 trial
      exception (status ⚠️ justified).
    - Complexity Tracking: add the row. Reason: test the PR-per-story flow on one milestone before
      changing the rule. Simpler alternative rejected for now: one PR per task (the current rule),
      kept as the fallback.
  - The final decision (amend constitution + `/CLAUDE.md`, or revert) happens in T022.

---

## Phase 2: Foundational (PR 1, blocks every story)

**Purpose**: the two-user test harness and the schema objects every table needs.

**⚠️ No user-story work begins until this phase is complete.**

- [x] T005 [P] Create `tests/helpers/identity.psql` (R9):
  - Run as `postgres` at the start of each test transaction. Define everything in `pg_temp`, so
    nothing persists. Always call helpers as `pg_temp.<name>(…)`.
  - Insert two users into `auth.users` with fixed values:
    - User A: id `00000000-0000-0000-0000-00000000000a`, email `a@test.local`,
      `raw_user_meta_data = '{"full_name":"Alice A"}'`.
    - User B: id `00000000-0000-0000-0000-00000000000b`, email `b@test.local`,
      `raw_user_meta_data = '{}'`.
    - Fill every `not null` column the local `auth.users` needs: `instance_id`, `aud`
      `'authenticated'`, `role` `'authenticated'`, `created_at`, `updated_at`.
  - Expose the ids as `pg_temp.user_a()` and `pg_temp.user_b()`, both returning `uuid`.
  - `pg_temp.authenticate_as(p_user uuid)`:
    - `set local role authenticated`.
    - `set_config('request.jwt.claims', json_build_object('sub', p_user, 'role',
'authenticated')::text, true)`.
  - `pg_temp.authenticate_anon()`: `set local role anon`, and claims `{"role":"anon"}`.
  - `pg_temp.reset_identity()`: `reset role` and clear the claims.
  - Proof:
    - `pnpm db:test` still passes, and the helpers file is not run as a test.
    - A scratch test that `\ir`s it, then `authenticate_as(user_a())`, then
      `select auth.uid()`, returns A's id. Delete the scratch file before committing.
- [x] T006 [P] Migration `extensions_and_types` (`pnpm db:new extensions_and_types`):
  - `create schema private;`
  - `revoke all on schema private from public, anon, authenticated;` (R4).
  - `create type public.media_type as enum ('article', 'video', 'image', 'post', 'link');`
  - `create type public.preview_status as enum ('pending', 'ok', 'failed');`
  - `create type public.embed_provider as enum ('youtube');` (A19; add values later with
    `alter type … add value`).
  - No `create extension pgtap` (R8). `set_updated_at` moves to T013.
  - Proof: `pnpm db:reset` succeeds. `types.gen.ts` gains the three enums under `Enums` and
    nothing from `private`.

**Checkpoint**: harness and types ready; tables can be added.

---

## Phase 3: User Story 1 — A user's collection is private to them (P1) 🎯 MVP (PR 1)

**Goal**: all five tables exist, each with its grants and RLS in the same migration, and two-user
tests prove that nobody but the owner can read, change, delete or link anything.

**Independent test**: `pnpm db:reset && pnpm db:test`. `010`–`060` pass, with every
[access matrix](contracts/access-matrix.md) "Expected outcomes" row asserted at least once.

**Scope boundary**: tables get the columns, types, defaults, keys, FKs, cascades, grants and RLS
from [data-model.md](data-model.md). Name checks, length and format checks, unique names and
URLs, and the `updated_at` trigger are **not** added here. They come in US2.

- [x] T007 [US1] Profiles: test `tests/020-profiles.test.sql`, then migration `profiles`.
  - **Tests**:
    - Sign-up creates a profile:
      - A gets `display_name = 'Alice A'`.
      - B, with no full name, gets `'b'`.
      - A user with neither full name nor email gets `null`.
      - A user with a 150-character full name gets a 100-character name, and sign-up does not
        fail.
      - A full name of only spaces falls back to the email's local part.
    - Reads:
      - A selects profiles and sees exactly 1 row (their own).
      - B sees 0 of A's.
      - `anon` select → `42501`.
    - Writes:
      - A updates their own `display_name` and it persists.
      - B updating A's profile affects 0 rows.
      - A updating `created_at` → `42501`.
      - A updating `display_name` to 101 characters → `23514`.
      - A inserting a profile → `42501`.
      - A deleting a profile → `42501`.
    - Deleting A from `auth.users` (as `postgres`) removes A's profile.
  - **Migration**:
    - Create the table:
      - `id uuid primary key references auth.users (id) on delete cascade`.
      - `display_name text check (char_length(display_name) <= 100)`.
      - `created_at timestamptz not null default now()`.
    - Privileges:
      - `revoke all on public.profiles from anon;`
      - `revoke insert, update, delete, truncate, references, trigger on public.profiles from
authenticated;`
      - `grant update (display_name) on public.profiles to authenticated;`
    - Enable RLS. Add select and update policies `to authenticated`, both using
      `id = (select auth.uid())`; the update policy uses it for `using` and `with check`.
    - `private.handle_new_user()`:
      - `returns trigger`, `language plpgsql`, `security definer`, `set search_path = ''`.
      - Inserts `(new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
nullif(split_part(new.email, '@', 1), '')), 100))`.
      - `revoke execute on function private.handle_new_user() from public, anon,
authenticated;`
    - `create trigger on_auth_user_created after insert on auth.users for each row execute
function private.handle_new_user();`
- [x] T008 [US1] Folders and tags: tests `tests/030-folders.test.sql` and
      `tests/040-tags.test.sql`, then migration `folders_tags`.
  - **Tests**, the same set in each file for its table, A against B:
    - A inserts with only `name`. `user_id` equals A's id and `id`/`created_at` are filled.
    - A inserting with `user_id` set (A's own or B's) → `42501`. Inserting with `id` or
      `created_at` → `42501`.
    - A renames their own row. A updating `user_id`, `id` or `created_at` → `42501`.
    - B selects 0 of A's rows. B's update and delete of A's row affect 0 rows.
    - `anon` select and insert → `42501`.
    - `truncate` as `authenticated` → `42501`.
  - **Migration**: for `public.folders` and then `public.tags`:
    - Columns:
      - `id uuid primary key default gen_random_uuid()`.
      - `user_id uuid not null default auth.uid() references auth.users (id) on delete
cascade`.
      - `name text not null`.
      - `created_at timestamptz not null default now()`.
    - `unique (id, user_id)`. This is the composite FK target, and it also indexes `user_id`
      lookups.
    - Privileges:
      - `revoke all on <t> from anon;`
      - `revoke insert, update, truncate, references, trigger on <t> from authenticated;`
      - `grant insert (name), update (name) on <t> to authenticated;`
      - `select` and `delete` stay table-wide, filtered by RLS.
    - Enable RLS. Add four policies `to authenticated` (select, insert `with check`, update
      `using` + `with check`, delete), each with `user_id = (select auth.uid())`.
- [x] T009 [US1] Items and links: tests `tests/050-items.test.sql` and
      `tests/060-item-tags.test.sql`, then migration `items`.
  - **Tests in `050`**:
    - A inserts an item with `url` and `normalized_url` only. Owner, id, timestamps and
      `search_vector` are filled.
    - Naming `user_id`, `id`, `created_at`, `updated_at` or `search_vector` on insert →
      `42501`.
    - Updating `url`, `normalized_url`, `user_id`, `created_at`, `updated_at` or
      `search_vector` → `42501`.
    - A updating each column of the update allowlist succeeds.
    - A setting their own item's `folder_id` to their own folder succeeds. Setting it to B's
      folder, by insert or by update → `23503`.
    - B selects 0 of A's items. B's update and delete affect 0 rows.
    - `anon` select and insert → `42501`. `truncate` as `authenticated` → `42501`.
  - **Tests in `060`**:
    - A links their own item and their own tag. A sees the link, and B sees 0 links.
    - A linking their own item with B's tag → `42501`. A linking B's item with their own tag →
      `42501`.
    - B deleting A's link affects 0 rows.
    - Updating a link → `42501`.
    - `anon` select → `42501`.
  - **Migration**: create `public.items` with exactly the columns, types, nullability and
    defaults in [data-model.md](data-model.md) "items", including:
    - `media_type public.media_type not null default 'link'`.
    - `preview_status public.preview_status not null default 'pending'`.
    - `embed_provider public.embed_provider`.
    - `updated_at timestamptz not null default now()`.
    - `search_vector tsvector not null default ''::tsvector`.
    - The FK `foreign key (folder_id, user_id) references public.folders (id, user_id) on delete
set null (folder_id)` (R1).
    - Indexes on `(user_id, created_at desc, id desc)` and `(user_id, folder_id)`.
  - Then create `public.item_tags`:
    - Columns: `item_id uuid not null references public.items (id) on delete cascade`,
      `tag_id uuid not null references public.tags (id) on delete cascade`.
    - `primary key (item_id, tag_id)`, and an index on `(tag_id)`.
  - **Privileges**:
    - Both tables: `revoke all … from anon;`
    - `items`:
      - `revoke insert, update, truncate, references, trigger on public.items from
authenticated;`
      - `grant insert (url, normalized_url, title, description, image_url, favicon_url,
site_name, media_type, embed_provider, embed_id, folder_id, note, preview_status,
preview_fetched_at)` (A15/A16, access matrix note 1).
      - `grant update (title, description, image_url, favicon_url, site_name, media_type,
embed_provider, embed_id, folder_id, note, preview_status, preview_fetched_at)`.
    - `item_tags`: `revoke update, truncate, references, trigger … from authenticated;`
      (select, insert and delete stay).
  - **RLS** on both tables:
    - `items`: four `user_id = (select auth.uid())` policies.
    - `item_tags`: select, insert (`with check`) and delete policies, each requiring
      `exists (select 1 from public.items i where i.id = item_id and i.user_id = (select
auth.uid()))` **and** the same for `public.tags`. No update policy.
- [ ] T010 [US1] Schema guard test `tests/010-schema.test.sql` (no migration):
  - `has_table` for the five tables, and `columns_are` for each, matching data-model.md.
  - Every table has RLS on: assert `relrowsecurity` from `pg_class`.
  - `table_privs_are` for `anon` (none) and for `authenticated`, per table, as in access matrix
    layer 1.
  - `column_privs_are` for the `authenticated` insert and update allowlists on `profiles`,
    `folders`, `tags` and `items`.
  - `private` gives client roles no USAGE: `schema_privs_are('private', 'authenticated',
'{}')`, and the same for `anon`.
  - `function_privs_are` on `private.handle_new_user()` for `authenticated` and `anon` (none).
  - `has_index` for the two `items` list indexes and for `item_tags (tag_id)`.
  - Description of each assertion names the rule (e.g. `anon has no privileges on items`).
  - US2 and US3 append to this file. The comment header says: "widen a grant → this file must
    change on purpose".

**Checkpoint (PR 1)**:

- `pnpm db:reset && pnpm db:test && pnpm db:types && git diff --exit-code
packages/database/src/types.gen.ts` passes locally.
- Push `m1/us1-private-collection` and open PR 1 into `002-m1-database-schema`. Wait for green CI
  and a review, then merge.

---

## Phase 4: User Story 2 — Items, folders and tags follow the product rules (P2) (PR 2)

**Goal**: the database refuses every rule-breaking write in FR-010–FR-020, and the delete rules
keep items.

**Independent test**: `pnpm db:test` passes. Every US2 acceptance scenario (1–13) maps to at
least one assertion in `030`–`060`.

**Branch**: `m1/us2-product-rules` from `002-m1-database-schema` after PR 1 merged.

- [ ] T011 [US2] Name rules: append to `tests/030-folders.test.sql` and
      `tests/040-tags.test.sql`, then migration `name_rules`.
  - **Tests**, for both folders and tags:
    - A creates "Reading". A creating "reading" → `23505`. A renaming another row to "READING"
      → `23505`.
    - B creates "Reading" and it succeeds.
    - Names `''`, `'   '` and 101 characters → `23514`. Exactly 100 characters succeeds.
  - **Migration**, on `public.folders` and `public.tags`:
    - `alter table … add constraint <t>_name_len_chk check (char_length(btrim(name)) between 1
and 100);`
    - `create unique index folders_user_name_uq on public.folders (user_id, lower(name));`, and
      the same for `tags_user_name_uq`.
  - Append `has_index` for both unique indexes to `tests/010-schema.test.sql`.
- [ ] T012 [US2] Item rules: append to `tests/050-items.test.sql`, then migration `item_rules`.
  - **Tests**:
    - Duplicate URL:
      - A saving a second item with the same `normalized_url` → `23505`.
      - B saving the same URL succeeds.
      - Two different `url` values with the same `normalized_url` → `23505` (A17).
    - `url` and `normalized_url` checks:
      - `ftp://x`, `example.com` and a 2,049-character `https://…` → `23514`.
      - `HTTPS://x` passes (case-insensitive).
    - Each length cap: one character over → `23514`, and exactly at the cap succeeds:
      - title 500, description 2000, note 1000, site_name 200.
      - image_url 2048, favicon_url 2048.
      - Test on insert **and** on update.
    - Embed:
      - Provider without id → `23514`. Id without provider → `23514`.
      - `youtube` with `'dQw4w9WgXcQ'` succeeds.
      - `youtube` with a 10-character id, or one containing `!` → `23514`.
    - Defaults: a new item has `preview_status = 'pending'` and `media_type = 'link'`. An
      invalid enum value → `22P02`.
  - **Migration**, on `public.items`. Name every constraint so errors say which rule broke:
    - `items_user_normalized_url_uq unique (user_id, normalized_url)`
    - `items_url_chk check (url ~* '^https?://' and char_length(url) <= 2048)`
    - `items_normalized_url_chk check (normalized_url ~* '^https?://' and
char_length(normalized_url) <= 2048)`. The database never re-normalizes (A17).
    - `items_title_len_chk check (char_length(title) <= 500)`
    - `items_description_len_chk check (char_length(description) <= 2000)`
    - `items_note_len_chk check (char_length(note) <= 1000)`
    - `items_site_name_len_chk check (char_length(site_name) <= 200)`
    - `items_image_url_len_chk check (char_length(image_url) <= 2048)`
    - `items_favicon_url_len_chk check (char_length(favicon_url) <= 2048)`
    - `items_embed_pair_chk check ((embed_provider is null) = (embed_id is null))`
    - `items_embed_youtube_chk check (embed_provider is distinct from 'youtube' or embed_id ~
'^[A-Za-z0-9_-]{11}$')`
  - Append `has_index` (or `col_is_unique`) for `items_user_normalized_url_uq` to
    `tests/010-schema.test.sql`.
- [ ] T013 [US2] `updated_at`: append to `tests/050-items.test.sql`, then migration
      `items_updated_at` (R6).
  - **Tests**:
    - `now()` is fixed inside the test transaction. So first, as `postgres`, set the item's
      `updated_at = now() - interval '1 day'`. This does not fire the trigger, because
      `updated_at` is not in its column list.
    - Then, as A, update `title` and assert `updated_at = now()`.
    - Repeat for `note`, `folder_id` and `preview_status`.
  - **Migration**:
    - `private.set_updated_at()`:
      - `returns trigger`, `language plpgsql`, `set search_path = ''`.
      - `new.updated_at = now(); return new;`
      - `revoke execute … from public, anon, authenticated;`
    - `create trigger items_set_updated_at before update of title, description, image_url,
favicon_url, site_name, media_type, embed_provider, embed_id, folder_id, note,
preview_status, preview_fetched_at on public.items for each row execute function
private.set_updated_at();`
    - The column list must equal the T009 update grant. Add a SQL comment that says so.
  - Append `function_privs_are` for `private.set_updated_at()` (no client execute) to
    `tests/010-schema.test.sql`.
- [ ] T014 [US2] Delete effects (FR-018, FR-019; tests only, the FKs come from T009):
  - In `tests/030-folders.test.sql`: A deletes a folder holding 2 items. Both items still exist
    with `folder_id is null`.
  - In `tests/040-tags.test.sql`: A deletes a tag linked to 2 items. Its `item_tags` rows are
    gone and both items still exist.
  - In `tests/060-item-tags.test.sql`: A deletes an item with 2 tags. Its links are gone and
    both tags still exist.
  - Also in `060`: deleting user A from `auth.users` (as `postgres`) leaves 0 rows for A in
    `profiles`, `folders`, `tags`, `items` and `item_tags`. B's rows are untouched.
  - If any assertion fails, fix it with a new migration. Do not edit T008/T009.

**Checkpoint (PR 2)**:

- Same local check as PR 1.
- Open PR 2 into `002-m1-database-schema`. Merge after green CI and review.

---

## Phase 5: User Story 3 — Users can search and filter their collection (P3) (PR 3)

**Goal**: `public.search_items` returns exactly the expected items, in the expected order, for
every US3 scenario, and stays current as items and tags change.

**Independent test**: `pnpm db:test`. `070` covers every case listed in
[search-items](contracts/search-items.md) "Test cases".

**Branch**: `m1/us3-search` from `002-m1-database-schema` after PR 2 merged.

- [ ] T015 [US3] Search vector: test `tests/070-search.test.sql` (part 1: vector upkeep), then
      migration `search_vector` (A4, R5, R6).
  - **Tests**. Use `search_vector @@ to_tsquery('simple', '<word>')`, run as A:
    - A new item matches a word from its title, description, note and URL. For the URL,
      `https://example.com/react-hooks?x=1` matches `react`, `hooks` and `example`.
    - Editing the title: the new word matches and the old one does not.
    - Linking a tag **as `authenticated`** succeeds (the R5 regression) and makes the tag name
      match.
    - Unlinking removes the tag name. Renaming the tag moves the match from the old name to the
      new one. Deleting the tag removes the name.
    - Linking a tag does **not** change `updated_at` (R6).
    - An Arabic title word matches by itself, with no stemming (A4).
  - **Migration**:
    - `private.item_search_vector(p_item_id uuid, p_title text, p_description text, p_note
text, p_url text) returns tsvector`:
      - `language sql stable`, `set search_path = ''`.
      - Concatenates these weighted parts, all `to_tsvector('simple', coalesce(…, ''))`:
        - **A**: title.
        - **B**: the item's tag names (`string_agg` of `public.tags.name` joined through
          `public.item_tags` where `item_id = p_item_id`) and note.
        - **C**: description.
        - **D**: the URL after `translate(p_url, '/:.?=&_-', '        ')`.
    - `private.items_set_search_vector()`:
      - Trigger function, `security definer`, `set search_path = ''`.
      - `new.search_vector := private.item_search_vector(new.id, new.title,
new.description, new.note, new.url); return new;`
      - Trigger `items_search_vector` on `public.items`: `before insert or update of title,
description, note, url`.
    - `private.item_tags_refresh_vector()`:
      - `security definer`, `set search_path = ''`.
      - Updates `public.items set search_vector = private.item_search_vector(id, title,
description, note, url)` where `id = coalesce(new.item_id, old.item_id)`.
      - Trigger `item_tags_refresh_vector`: `after insert or delete on public.item_tags for each
row`.
    - `private.tags_refresh_vectors()`:
      - `security definer`, `set search_path = ''`.
      - Same update, for `id in (select item_id from public.item_tags where tag_id = new.id)`.
      - Trigger `tags_refresh_vectors`: `after update of name on public.tags for each row`.
    - `create index items_search_vector_idx on public.items using gin (search_vector);`
    - `revoke execute … from public, anon, authenticated` on all four functions.
  - Append to `tests/010-schema.test.sql`:
    - `function_privs_are`, no client execute, for the four functions.
    - `has_index` for `items_search_vector_idx`.
- [ ] T016 [US3] Search RPC: append to `tests/070-search.test.sql` (part 2: search behavior), then
      migration `search_items`.
  - **Tests**. Seed a fixed collection for A and a look-alike one for B:
    - Ranking: title match ranks above description-only match.
    - Matching: a tag-name-only, a note-only and a URL-word-only item are each found.
    - Prefixes: `reac` finds "React hooks". `reac hoo` finds it, and an item with only "react"
      is not returned.
    - Operator-like input:
      - `a & !b` runs without error and behaves as words `a` and `b`.
      - `:*` and `(` behave as no query.
    - Empty input: `''`, `'   '`, `'?!.'` and `null` give the full list, newest first, with
      `rank = 0`.
    - Order with no query: `created_at desc, id desc`. Two items with equal `created_at`
      (set as `postgres`) come back in a stable order.
    - Folder filters:
      - `p_folder_id` returns only that folder's items.
      - `p_no_folder => true` returns only unfiled items, including an item whose folder was
        deleted.
      - Both together → `22023`, with message `p_folder_id and p_no_folder cannot be combined`.
    - Tag filter:
      - `p_tag_ids` with T1 and T2 returns only items having both.
      - `'{}'` means no filter. `{T1,T1}` acts like `{T1}`.
      - A deleted or foreign tag id returns 0 rows, without error.
    - Tag rename: the new name is found and the old name is not.
    - Paging:
      - 25 items with `p_limit 10`, pages at offsets 0, 10 and 20: no repeats, 25 distinct
        ids in total.
      - Offset 1000 returns an empty page.
      - `p_limit 0` returns 1 row; `p_limit 500` returns 50 rows; `p_limit null` returns 20.
    - Each row's `tags` is `[{id,name}]` ordered by `lower(name)`, or `[]` when there are none.
    - Ownership: B's look-alike items and B's tags never appear for A.
    - Privileges: calling as `anon` → `42501`.
  - **Migration**: implement `public.search_items` exactly as in
    [search-items](contracts/search-items.md):
    - Signature, `returns table`, `language plpgsql stable security invoker set search_path =
''`.
    - Input normalization table, behavior rules 1–9, and the R7 quoting, applied to each
      lexeme from `unnest(to_tsvector('simple', p_query))`:
      - Double single quotes and escape backslashes.
      - Wrap in `'…':*` and join with `&`.
      - Pass the result to `to_tsquery('simple', …)`.
    - Rank with `ts_rank_cd`. Fully qualify every name.
    - Privileges:
      - `revoke execute on function public.search_items(text, uuid, boolean, uuid[], int,
int) from public, anon;`
      - `grant execute on function public.search_items(text, uuid, boolean, uuid[], int, int)
to authenticated;`
  - Append to `tests/010-schema.test.sql`: `function_privs_are` for `public.search_items`,
    with `authenticated` → `{EXECUTE}` and `anon` → `{}`.
  - `types.gen.ts` now shows `search_items` under `Functions`.

**Checkpoint (PR 3)**:

- Same local check as PR 1.
- Open PR 3 into `002-m1-database-schema`. Merge after green CI and review.

---

## Phase 6: User Story 4 — Contributors build on one shared, current schema (P4) (PR 4)

**Goal**: apps import named types from `@markme/database`, the hosted project runs the same
migrations, and the README explains how.

**Independent test**: quickstart V2 (no type drift) and V5 (`migration list --linked` shows Local
= Remote), plus `pnpm typecheck`.

**Branch**: `m1/us4-shared-schema` from `002-m1-database-schema` after PR 3 merged.

- [ ] T017 [P] [US4] Package exports in `/packages/database/src/index.ts` (contract
      database-package, R11):
  - Re-export:
    - `export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from
"./types.gen";`
    - `export { Constants } from "./types.gen";`
  - Add the alias:
    `export type SearchItemRow = Database["public"]["Functions"]["search_items"]["Returns"][number];`
    It needs an `import type { Database }`.
  - Proof: `pnpm typecheck && pnpm lint` pass. Add no other runtime code.
- [ ] T018 [P] [US4] Root script in `/package.json`: `"db:push": "supabase db push --workdir
packages/database"`, next to the other `db:*` scripts. Proof: `pnpm db:push --help` resolves
      to the CLI. Never add it to CI (A11).
- [ ] T019 [US4] `/README.md` "Database" section (FR-032; contract database-package "README"):
  - Local: `pnpm db:reset`, `pnpm db:test`.
  - Adding a migration: `pnpm db:new <name>`, then `pnpm db:types`, then commit both, or CI's
    drift check fails.
  - New item column checklist: the data-model "Adding an item column later" note.
  - One-time cloud link: `pnpm exec supabase login`, then `pnpm exec supabase link
--project-ref <ref> --workdir packages/database`. The ref stays in git-ignored
    `supabase/.temp/`.
  - `pnpm db:push`. It prompts for the DB password unless `SUPABASE_DB_PASSWORD` is set in the
    shell.
  - Verify with `pnpm exec supabase migration list --linked --workdir packages/database`.
  - A paused free project must be resumed from the dashboard first.
  - Depends on T018.
- [ ] T020 [US4] **Manual, with Mostafa; produces no commit**: create the hosted project and push
      (R10, quickstart V5). Do this only after PR 3 has merged, so only reviewed migrations reach
      production.
  1. Mostafa is already logged in (`pnpm exec supabase projects list` works; checked 2026-10-21).
  2. Create one free project `markme` in `eu-central-1`. Generate the DB password; it goes only
     into Mostafa's password manager, never into a file, the chat log or CI.
  3. `pnpm exec supabase link --project-ref <ref> --workdir packages/database`.
  4. `pnpm db:push`.
  5. `pnpm exec supabase migration list --linked --workdir packages/database`: all 9 versions
     match.
  6. In the dashboard Table Editor, the five tables show "RLS enabled".
  7. `git status` shows no new tracked file.

**Checkpoint**: US4 acceptance scenarios 1–4 hold.

---

## Phase 7: Polish and cross-cutting concerns (PR 4)

- [ ] T021 [P] Update `/CLAUDE.md` "Current state" for M1:
  - The five tables plus `search_items` exist, and internal functions live in `private`.
  - `pnpm db:push` is the manual production step.
  - Remove "No product features yet" only if M2 has also landed. Otherwise say "data layer only".
  - Add `db:push` to the commands list.
- [ ] T022 Full exit verification (quickstart V1–V4, V6):
  1. Fresh `pnpm db:reset && pnpm db:test`: files `000`–`070` pass.
  2. `pnpm db:types` leaves no diff.
  3. `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` pass.
  4. Spot-check V3/V4 through the REST API with two signed-up local users.
  5. `pnpm dev` still starts.
  6. Then open PR 4. After it merges, open the milestone PR `002-m1-database-schema` → `main`.
  7. Ask Mostafa for the final call on the PR-per-story trial (T004). If kept, amend
     `/.specify/memory/constitution.md` "Development Workflow" (v1.1.3, PATCH, Sync Impact Report)
     and `/CLAUDE.md` "Workflow" in the milestone PR. If not, note the revert in plan.md.

---

## Dependencies and execution order

### Phase dependencies

- **Setup (T001–T004)** comes first. T002 (R3 decision) blocks T007.
- **Foundational (T005–T006)** depends on T001 and blocks every story.
- **US1 (T007–T010)** depends on Foundational.
- **US2 (T011–T014)** depends on US1's tables (T008, T009), merged as PR 1.
- **US3 (T015–T016)** depends on US1's tables. It runs after PR 2 only to keep `types.gen.ts`
  and migration order linear.
- **US4 (T017–T020)** needs `search_items` (T016) for `SearchItemRow`, and all migrations for
  T020.
- **Polish (T021–T022)** comes last.

### Within each story

- Inside each task: test first (red), then migration (green), then `db:types`, then one commit.
- US1: T007, then T008, then T009 (items reference folders and tags), then T010 (asserts the
  final US1 state).
- US2: T011 and T012 touch different files, but both regenerate `types.gen.ts`, so run them one
  after the other. Then T013 (same test file as T012), then T014.
- US3: T015, then T016 (search depends on the vector).
- US4: T017 ∥ T018, then T019, then T020.

### Story completion order

```text
Setup ─▶ Foundational ─▶ US1 (PR 1) ─▶ US2 (PR 2) ─▶ US3 (PR 3) ─▶ US4 + Polish (PR 4) ─▶ milestone PR → main
```

## Parallel examples

```text
# Foundational (different files, no shared state):
T005 tests/helpers/identity.psql
T006 migration extensions_and_types

# US4 (different files):
T017 packages/database/src/index.ts
T018 /package.json db:push
T021 /CLAUDE.md (polish, same PR)
```

Database tasks are otherwise sequential. Each migration regenerates the one `types.gen.ts`, and
later tables reference earlier ones.

## Implementation strategy

- **MVP = PR 1 (US1)**: every table exists behind grants and RLS, proven with two users. It is
  safe to build on even before the product rules land.
- **Then** PR 2 hardens the data (rules), PR 3 adds search, and PR 4 ships types and production.
- Stop at each PR checkpoint. The story's independent test must pass in CI before the next story
  starts.

## Notes

- `[P]` = different files and no unfinished dependency. `[USn]` maps the task to spec.md.
- Never weaken or skip a pgTAP assertion to get green. Fix the migration or add a new one
  (constitution III).
- Every new function gets `set search_path = ''`, fully qualified names, and an explicit EXECUTE
  revoke (R2).
- Every new table gets, in the same migration, `revoke all … from anon`, the revoke and allowlist
  for `authenticated`, RLS enabled and policies `to authenticated` (constitution I).
- Commit and PR bodies follow the repo conventions. Every PR gets a review pass before merge.
