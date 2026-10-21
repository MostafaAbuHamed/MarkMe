# Research: M1 Database Schema + Access Rules

**Date**: 2026-10-20 · **Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Inputs: `docs/IMPLEMENTATION_PLAN.md` §3 M1 and §4 (A1, A3, A4, A11–A20, all approved), the spec,
and checks run against the local stack on 2026-10-20 (Supabase CLI 2.121.0, PostgreSQL 17.11,
pgTAP 1.3.3 available). The approved design leaves no open items, so the Technical Context had no
NEEDS CLARIFICATION. Each item below either confirms a platform fact the design relies on or records
where this plan differs from the implementation plan. Those differences are copied back into
`docs/IMPLEMENTATION_PLAN.md` in the same change (its change rule).

---

## R1. PostgreSQL version and composite foreign key

- **Decision**: Rely on PostgreSQL 17 (local `major_version = 17`; new Supabase Cloud projects run
  17). Use `foreign key (folder_id, user_id) references folders (id, user_id) on delete set null
(folder_id)`.
- **Rationale**: The column list on `on delete set null` exists since PostgreSQL 15. Without it a
  folder delete would also null `user_id`, which is `not null`, and the delete would fail. Checked:
  `select version()` on the local stack returns 17.11.
- **Alternatives considered**: A trigger that nulls `folder_id` before folder delete (more code, same
  result); a plain FK on `folder_id` plus an RLS check on the folder owner (a policy can be
  bypassed by admin paths; the FK cannot).

## R2. Supabase default privileges (difference from the implementation plan)

- **Finding** (checked in `pg_default_acl` for schema `public`): every new table grants
  `arwdDxtm` (all, **including TRUNCATE**) to `anon`, `authenticated` and `service_role`; every new
  function grants EXECUTE to the same roles, and PostgreSQL also grants EXECUTE to `PUBLIC`.
- **Decision**: In each table's migration:
  - `revoke all on <table> from anon;` The app has no anonymous data access. RLS policies are
    `to authenticated` only, so `anon` already sees no rows; the revoke removes the grant itself,
    including TRUNCATE, which RLS does not cover.
  - `revoke insert, update, truncate, references, trigger on <table> from authenticated;` then the
    column-level allowlists of A15/A16 (and `select`, `delete` stay table-wide, filtered by RLS).
  - Every function: `revoke execute on function … from public, anon, authenticated;` then grant
    EXECUTE only where a client must call it (`public.search_items` → `authenticated`).
  - `010-schema` asserts the final privileges with pgTAP `table_privs_are`, `column_privs_are` and
    `function_privs_are`, so a later migration that widens a grant fails CI.
- **Rationale**: The implementation plan revoked only `insert`/`update` from `authenticated`. That
  leaves `anon` with full grants and `authenticated` with TRUNCATE, which ignores RLS. PostgREST
  does not expose TRUNCATE today, but constitution I asks for security by default, not by the
  absence of an endpoint. Explicit grants also keep the design correct if Supabase changes its
  default grants later.
- **Alternatives considered**: Changing the default privileges for the schema (`alter default
privileges … revoke`): it affects objects created later by anyone and is easy to miss in review;
  per-table statements next to each table are clearer.

## R3. Profiles get a column allowlist and a name cap (difference; needs Mostafa's approval)

- **Decision**:
  - `profiles`: revoke `insert`, `delete`, `update`, `truncate`, `references`, `trigger` from
    `authenticated`; grant `update (display_name)` only.
  - `display_name text check (char_length(display_name) <= 100)`. The sign-up function stores
    `left(…, 100)` so a long Google name can never block sign-up.
- **Rationale**: The implementation plan gave `profiles` select/update policies but no column
  allowlist, so a user could rewrite their own `created_at`, and `display_name` had no cap. Same
  reasoning as A15/A16 (new columns locked by default) and A18 (bounded storage). The truncation
  matters: a check failure inside the sign-up trigger would make account creation fail.
- **Alternatives considered**: No cap (the only unbounded client-writable text left in the schema);
  rejecting long names at sign-up (breaks Google sign-in for that user).

## R4. Internal functions live in a `private` schema

- **Decision**: Create schema `private` (not in `[api].schemas`, so PostgREST and the type generator
  never see it) with `revoke all on schema private from public, anon, authenticated`. It holds
  every function a client must not call: `set_updated_at`, `handle_new_user`, the search-vector
  builder and the trigger functions that refresh it. `public` keeps only tables, enums and
  `search_items`.
- **Rationale**: Supabase exposes every `public` function with EXECUTE as an RPC. Putting
  security-definer functions in a non-exposed schema is Supabase's documented practice, and it
  makes R2's EXECUTE revokes a second layer instead of the only one. Trigger functions run without
  EXECUTE or USAGE checks when a trigger fires (PostgreSQL checks EXECUTE only at `create
trigger`), so locking the schema does not break the triggers.
- **Alternatives considered**: Keep them in `public` with revoked EXECUTE (one forgotten revoke
  exposes an RPC); a separate `internal` naming convention only (no enforcement).

## R5. Search-vector refresh runs as the function owner

- **Problem**: The design refreshes `items.search_vector` from `after` triggers on `item_tags`
  (insert, delete) and `tags` (`update of name`). Those triggers run as the calling user
  (`authenticated`), who has **no** UPDATE privilege on `search_vector` (A15). The refresh would
  fail with _permission denied_ on every tag link.
- **Decision**:
  - The `before insert or update of title, description, note, url` trigger on `items` sets
    `new.search_vector` directly. Column privileges apply to columns named in the statement, not to
    values a `before` trigger assigns, so the assignment itself needs no special rights. Its
    function is still `security definer`, because it calls the builder in `private`, where
    `authenticated` has no USAGE (R4). It reads only the tags of `new.id`.
  - The `item_tags` and `tags` refresh trigger functions are `security definer` with
    `set search_path = ''`, fully qualified names, in `private`. They update only the items named
    by the triggering row (`new.item_id`/`old.item_id`, or items linked to `new.id` for a tag
    rename). RLS has already checked ownership of that row before an `after` trigger fires, so the
    definer rights cannot be steered at another user's data.
  - One shared builder, `private.item_search_vector(p_item_id uuid, p_title text, p_description
text, p_note text, p_url text) returns tsvector`, so both paths use the same weights (A–D in the
    implementation plan, config `simple`, A4).
- **Alternatives considered**: Granting UPDATE on `search_vector` to `authenticated` (lets clients
  forge search data; breaks A16); computing tag names at search time instead of storing them
  (loses GIN coverage of tag names; rejected in the implementation plan).

## R6. `updated_at` moves on item edits, not on search-data refreshes

- **Decision**: `before update of <every client-updatable item column> on items` runs
  `private.set_updated_at()`. The column list equals the A15 update allowlist. Refreshing
  `search_vector` alone (tag link, unlink, rename) does not bump `updated_at`.
- **Rationale**: FR-020 is about changes to the item. A tag rename would otherwise bump
  `updated_at` on every item carrying that tag. List order uses `created_at`, so v1 shows no
  difference, and v2's last-write-wins is per field, where tags are their own rows.
- **Cost**: A future item column needs adding to both the grant and this trigger's column list. The
  `010-schema` privilege assertions make the first one visible; the M1 task that adds a column
  must touch both (noted in the data model).
- **Alternatives considered**: `for each row when (old.* is distinct from new.*)` (fires on
  search-only refreshes); bumping on everything (noisy, as above).

## R7. `search_items` shape (difference from the implementation plan)

- **Decision**: `language plpgsql stable security invoker set search_path = ''`, `returns table
(…)` with the item columns (minus `search_vector`), `tags jsonb` and `rank real`.
  - plpgsql instead of `sql`: the A13 rule ("`p_no_folder` with `p_folder_id` raises") needs
    `raise exception`, which a `sql` function cannot do cleanly.
  - `returns table` instead of a separate composite type: one object fewer, and `supabase gen types`
    emits the row shape under the function's `Returns`.
  - Query building (A14): lexemes come from `unnest(to_tsvector('simple', p_query))`. Each lexeme
    is quoted as a tsquery literal (single quotes doubled, backslashes escaped), suffixed `:*`, and
    joined with `&` before `to_tsquery('simple', …)`. No lexemes → no query (A20).
  - Normalized inputs: `p_limit` → `least(greatest(coalesce(p_limit, 20), 1), 50)`; `p_offset` →
    `greatest(coalesce(p_offset, 0), 0)`; an empty `p_tag_ids` array counts as no tag filter; the
    ALL-tags count uses the distinct ids in the array, so a repeated id does not empty the result.
  - Order: with a query, `rank desc, created_at desc, id desc`; without, `created_at desc, id
desc`. `id` is the final tie-breaker so offset pages never repeat or skip a row.
  - `tags` per row: `[{id, name}]` ordered by `lower(name)`, `[]` when none.
- **Alternatives considered**: `websearch_to_tsquery` and `pg_trgm` (rejected in A14); raw input
  into `to_tsquery` (injection and syntax errors).

## R8. pgTAP is not installed by a migration (difference from the implementation plan)

- **Finding**: The M0 smoke test passes in CI with no migrations at all; `supabase test db` enables
  pgTAP itself before running the files.
- **Decision**: Drop `create extension pgtap` from the first migration.
- **Rationale**: Migrations also run on the production project (A11), which should not carry a test
  framework.

## R9. Test helpers: `tests/helpers/*.psql` included with `\ir`

- **Finding** (probe run on 2026-10-20, then removed): a test file starting with
  `\ir helpers/x.psql` runs, and a `.psql` file in a subfolder is not picked up as a test by
  `supabase test db`.
- **Decision**: `packages/database/supabase/tests/helpers/identity.psql` defines session-scoped
  helpers (in `pg_temp`, so nothing persists): create user A and B in `auth.users` with fixed ids
  and emails, `authenticate_as(uuid)` (sets role `authenticated` and `request.jwt.claims` for the
  transaction), `authenticate_anon()` and `reset_identity()`. Each test file `\ir`s it, then runs in
  `begin … rollback`.
- **Alternatives considered**: A committed `000-helpers.test.sql` that creates persistent functions
  (leaves objects in the local DB and depends on run order); the community `supabase-test-helpers`
  package via dbdev (a new dependency for about 20 lines of SQL; constitution IV).

## R10. Hosted project and pushing migrations

- **Decision** (confirms A11 and the implementation plan): Mostafa runs `pnpm exec supabase login`;
  the agent creates one free project `markme` in `eu-central-1` with a generated DB password that
  goes only into Mostafa's password manager; `supabase link --project-ref … --workdir
packages/database`; a new root script `db:push` (`supabase db push --workdir
packages/database`) applies migrations. `supabase migration list --linked` must show local and
  remote equal. Nothing about the project is stored in CI.
- **Rationale**: See A11. The project ref is not a secret but stays out of the repo too; `supabase
link` keeps it in the git-ignored `supabase/.temp/`.
- **Note**: The free project pauses after 7 idle days. `db:push` on a paused project fails with a
  clear error; resume it from the dashboard.

## R11. Generated types

- **Decision**: Keep `pnpm db:types` (local, `public` schema). The generated file already exports
  `Tables`, `TablesInsert`, `TablesUpdate`, `Enums` and `Constants` (checked in the M0 output).
  `src/index.ts` re-exports them and adds one alias, `SearchItemRow` =
  `Database['public']['Functions']['search_items']['Returns'][number]`. The CI drift check is
  already in place from M0.
- **Rationale**: Apps import named helpers instead of indexing into `Database` by hand; no
  hand-written duplicates of generated types.
