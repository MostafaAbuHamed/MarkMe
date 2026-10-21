# Quickstart: Validate M1

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Runbook that proves the M1 exit criteria. It references the
[data model](data-model.md) and [contracts](contracts/) instead of repeating them.

## Prerequisites

- M0 prerequisites (Node 24 via `.nvmrc`, pnpm through corepack, Docker running).
- `pnpm install` done; local Supabase running (`pnpm db:start`, or `pnpm dev`).
- For V5 only: Mostafa's Supabase account, signed in with `pnpm exec supabase login`.

## V1. Schema builds from scratch and every test passes (SC-001–SC-005)

```bash
pnpm db:reset && pnpm db:test
```

Expected: `All tests successful`, with files `000` to `070` listed and `Result: PASS`. A failing
assertion prints its description, which names the rule (for example
`B cannot read A's items`).

## V2. Generated types match the migrations (SC-006)

```bash
pnpm db:types && git diff --exit-code packages/database/src/types.gen.ts
```

Expected: exit code 0. `types.gen.ts` contains `profiles`, `items`, `folders`, `tags`,
`item_tags`, the three enums and `search_items`, and no `private` objects.

## V3. Access rules by hand (spot check of the access matrix)

In Studio's SQL editor (`http://127.0.0.1:54323`) or `psql`, with two users created through
`/auth/v1/signup` against the local stack (Mailpit at `:54324` confirms them):

1. As user A (Supabase JS client or REST with A's JWT), insert a folder, a tag, an item and a link.
2. As user B, `select` from each table: no rows.
3. As user A, insert an item with `user_id` set: HTTP 401/403 with code `42501`.
4. With the anon key and no session, `select` from `items`: `42501`.

Expected outcomes are those in [contracts/access-matrix.md](contracts/access-matrix.md). V1
already proves all of them; V3 confirms the same through the real API path the extension uses.

## V4. Search through the API (spot check of the search contract)

As user A after V3:

```text
POST /rest/v1/rpc/search_items  { "p_query": "reac" }           -> items whose words start with "reac"
POST /rest/v1/rpc/search_items  { "p_no_folder": true }         -> only unfiled items
POST /rest/v1/rpc/search_items  { "p_folder_id": "<id>", "p_no_folder": true } -> 400, code 22023
```

Expected: as in [contracts/search-items.md](contracts/search-items.md); each row has `tags` and
`rank`.

## V5. Hosted project matches local (SC-007; once, by Mostafa + agent)

```bash
pnpm exec supabase link --project-ref <ref> --workdir packages/database
pnpm db:push
pnpm exec supabase migration list --linked --workdir packages/database
```

Expected: every local migration shows the same version in the Local and Remote columns. The
dashboard's Table Editor lists the five tables, each marked RLS enabled. `git status` shows no new
tracked file (the project ref lives in git-ignored `supabase/.temp/`).

## V6. CI

Open the task PRs against `002-m1-database-schema`. Expected: the five required checks are green;
the `db` job runs every pgTAP file and the type-drift check.
