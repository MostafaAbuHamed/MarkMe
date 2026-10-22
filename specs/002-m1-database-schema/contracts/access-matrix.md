# Contract: Access Matrix

What each database role may do after M1. This is the contract the pgTAP suite proves (`010` for
privileges and RLS flags, `020`–`060` for behavior). Sources: constitution I, PRD 7.4, A15, A16,
research R2–R5.

Roles: `anon` (no session), `authenticated` (signed-in user; `auth.uid()` = their id),
`service_role` (server-side admin, never in a client; unchanged Supabase defaults, bypasses RLS).

## Layer 1: privileges

`—` = no privilege. "cols" = only the listed columns.

| Table       | `anon` | `authenticated` select | insert              | update               | delete | truncate / references / trigger |
| ----------- | ------ | ---------------------- | ------------------- | -------------------- | ------ | ------------------------------- |
| `profiles`  | —      | table                  | —                   | cols: `display_name` | —      | —                               |
| `folders`   | —      | table                  | cols: `name`        | cols: `name`         | table  | —                               |
| `tags`      | —      | table                  | cols: `name`        | cols: `name`         | table  | —                               |
| `items`     | —      | table                  | cols: item insert ¹ | cols: item update ²  | table  | —                               |
| `item_tags` | —      | table                  | table               | —                    | table  | —                               |

1. `url, normalized_url, title, description, image_url, favicon_url, site_name, media_type,
embed_provider, embed_id, folder_id, note, preview_status, preview_fetched_at`.
2. List 1 without `url` and `normalized_url`.

Never client-settable on any table: `id`, `user_id`, `created_at`, `updated_at`, `search_vector`.
Naming one of them in an insert or update fails with _permission denied_ (SQLSTATE `42501`) before
RLS runs.

Functions:

| Function                | `anon` | `authenticated` | Notes                                            |
| ----------------------- | ------ | --------------- | ------------------------------------------------ |
| `public.search_items`   | —      | execute         | `security invoker`; RLS applies                  |
| everything in `private` | —      | —               | schema has no USAGE for client roles; not in API |

## Layer 2: row-level security

RLS is enabled on all five tables. Every policy is `to authenticated`; `anon` has none, so it sees
no rows even if a grant slipped in. `(select auth.uid())` is written in that form so the planner
evaluates it once per statement.

| Table       | select                       | insert (`with check`)        | update (`using` + `with check`) | delete                       |
| ----------- | ---------------------------- | ---------------------------- | ------------------------------- | ---------------------------- |
| `profiles`  | `id = uid`                   | no policy                    | `id = uid`                      | no policy                    |
| `folders`   | `user_id = uid`              | `user_id = uid`              | `user_id = uid`                 | `user_id = uid`              |
| `tags`      | `user_id = uid`              | `user_id = uid`              | `user_id = uid`                 | `user_id = uid`              |
| `items`     | `user_id = uid`              | `user_id = uid`              | `user_id = uid`                 | `user_id = uid`              |
| `item_tags` | item owned **and** tag owned | item owned **and** tag owned | no policy (rows immutable)      | item owned **and** tag owned |

"owned" = `exists (select 1 from public.items|tags x where x.id = … and x.user_id = (select
auth.uid()))`.

## Layer 3: constraints that hold for every role

Not bypassable by `service_role` either:

- An item can only reference a folder with the same `user_id` (composite FK).
- Unique `(user_id, normalized_url)`; unique `(user_id, lower(name))` for folders and for tags.
- Length, format and embed checks from the [data model](../data-model.md).

## Expected outcomes the tests prove

| Attempt (as A unless stated)                                  | Result                    |
| ------------------------------------------------------------- | ------------------------- |
| read B's rows in any table                                    | 0 rows                    |
| update / delete B's folder, tag, item, link                   | 0 rows affected           |
| insert naming `user_id` (own or B's), `id`, `created_at`      | `42501` permission denied |
| update `url`, `normalized_url`, `created_at`, `search_vector` | `42501` permission denied |
| update folder/tag anything but `name`                         | `42501` permission denied |
| insert or delete a profile                                    | `42501` permission denied |
| link own item + B's tag, or B's item + own tag                | RLS violation (`42501`)   |
| set own item's `folder_id` to B's folder                      | FK violation (`23503`)    |
| `anon`: select / insert on any table                          | `42501` permission denied |
| `truncate` any table (as `authenticated` or `anon`)           | `42501` permission denied |
| call a `private` function as `authenticated`                  | `42501` permission denied |
