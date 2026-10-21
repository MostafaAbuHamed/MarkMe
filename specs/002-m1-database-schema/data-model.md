# Data Model: M1 Database Schema + Access Rules

**Date**: 2026-10-20 · **Spec**: [spec.md](spec.md) · **Research**: [research.md](research.md)

Source: PRD §6 as amended by A1, A12, A19, plus `docs/IMPLEMENTATION_PLAN.md` §3 M1. Privileges and
policies are in [contracts/access-matrix.md](contracts/access-matrix.md); search behavior is in
[contracts/search-items.md](contracts/search-items.md).

## Schemas

| Schema    | Holds                                               | Exposed to API |
| --------- | --------------------------------------------------- | -------------- |
| `public`  | the five tables, three enums, `search_items`        | yes            |
| `private` | trigger functions, sign-up function, vector builder | no (R4)        |

## Enums (`public`)

| Type             | Values                                       | Used by                |
| ---------------- | -------------------------------------------- | ---------------------- |
| `media_type`     | `article`, `video`, `image`, `post`, `link`  | `items.media_type`     |
| `preview_status` | `pending`, `ok`, `failed`                    | `items.preview_status` |
| `embed_provider` | `youtube` (A19; add values with `add value`) | `items.embed_provider` |

## Tables

### `profiles`

| Column         | Type        | Null | Default | Rule                                      |
| -------------- | ----------- | ---- | ------- | ----------------------------------------- |
| `id`           | uuid        | no   | –       | PK; FK `auth.users(id)` on delete cascade |
| `display_name` | text        | yes  | –       | `char_length <= 100` (R3)                 |
| `created_at`   | timestamptz | no   | `now()` |                                           |

Created only by `private.handle_new_user()` (`after insert on auth.users`, security definer,
`search_path = ''`): `display_name = left(coalesce(nullif(btrim(full_name), ''),
nullif(split_part(email, '@', 1), '')), 100)`; null when neither exists (FR-002).

### `folders`

| Column       | Type        | Null | Default             | Rule                                         |
| ------------ | ----------- | ---- | ------------------- | -------------------------------------------- |
| `id`         | uuid        | no   | `gen_random_uuid()` | PK                                           |
| `user_id`    | uuid        | no   | `auth.uid()`        | FK `auth.users(id)` on delete cascade        |
| `name`       | text        | no   | –                   | `char_length(btrim(name)) between 1 and 100` |
| `created_at` | timestamptz | no   | `now()`             |                                              |

- `unique (id, user_id)`: target of the items composite FK.
- `unique index folders_user_name_uq on (user_id, lower(name))` (FR-013). Name length check and
  both per-user unique name indexes are added in migration `name_rules` (US2).

### `tags`

Same columns and rules as `folders` (`created_at` per A12), with `unique (id, user_id)` and
`unique index tags_user_name_uq on (user_id, lower(name))` (constraints and indexes in
`name_rules`, US2).

### `items`

| Column               | Type             | Null | Default             | Rule                                                |
| -------------------- | ---------------- | ---- | ------------------- | --------------------------------------------------- |
| `id`                 | uuid             | no   | `gen_random_uuid()` | PK                                                  |
| `user_id`            | uuid             | no   | `auth.uid()`        | FK `auth.users(id)` on delete cascade               |
| `url`                | text             | no   | –                   | `~* '^https?://'`, `char_length <= 2048`; immutable |
| `normalized_url`     | text             | no   | –                   | same checks; immutable; not re-normalized (A17)     |
| `title`              | text             | yes  | –                   | `<= 500`                                            |
| `description`        | text             | yes  | –                   | `<= 2000`                                           |
| `image_url`          | text             | yes  | –                   | `<= 2048`                                           |
| `favicon_url`        | text             | yes  | –                   | `<= 2048` (A1)                                      |
| `site_name`          | text             | yes  | –                   | `<= 200`                                            |
| `media_type`         | `media_type`     | no   | `'link'`            |                                                     |
| `embed_provider`     | `embed_provider` | yes  | –                   | null iff `embed_id` null                            |
| `embed_id`           | text             | yes  | –                   | youtube → `~ '^[A-Za-z0-9_-]{11}$'`                 |
| `folder_id`          | uuid             | yes  | –                   | composite FK, see below                             |
| `note`               | text             | yes  | –                   | `<= 1000`                                           |
| `preview_status`     | `preview_status` | no   | `'pending'`         |                                                     |
| `preview_fetched_at` | timestamptz      | yes  | –                   |                                                     |
| `created_at`         | timestamptz      | no   | `now()`             |                                                     |
| `updated_at`         | timestamptz      | no   | `now()`             | bumped on item edits (R6)                           |
| `search_vector`      | tsvector         | no   | `''::tsvector`      | system-maintained (R5)                              |

- `unique (user_id, normalized_url)` (FR-010). Item URL/normalized URL checks, length caps, embed
  checks and this uniqueness constraint are added in migration `item_rules` (US2).
- `foreign key (folder_id, user_id) references folders (id, user_id) on delete set null
(folder_id)` (FR-006, FR-018; R1).
- Indexes: `(user_id, created_at desc, id desc)` and `(user_id, folder_id)` on `items` (US1).
  `gin (search_vector)` is created in migration `search_vector` (US3).

### `item_tags`

| Column    | Type | Null | Rule                             |
| --------- | ---- | ---- | -------------------------------- |
| `item_id` | uuid | no   | FK `items(id)` on delete cascade |
| `tag_id`  | uuid | no   | FK `tags(id)` on delete cascade  |

- PK `(item_id, tag_id)`; index `(tag_id)`.
- Same-owner rule enforced by RLS on both sides (access matrix). Rows are never updated.

## Relationships

```text
auth.users 1─1 profiles
auth.users 1─* folders ─┐
auth.users 1─* tags     │ (id, user_id)
auth.users 1─* items ───┘ 0..1 folder per item (composite FK, same owner)
items *─* tags  via item_tags (same owner, RLS)
```

Delete effects (FR-018, FR-019):

| Deleted   | Effect                                                     |
| --------- | ---------------------------------------------------------- |
| folder    | its items get `folder_id = null`; items stay               |
| tag       | its `item_tags` rows go; items stay; their vectors refresh |
| item      | its `item_tags` rows go; tags stay                         |
| auth user | profile, folders, tags, items, links all go (cascade)      |

## Triggers and functions

| Object                               | Fires on                                                   | Does                                                              |
| ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `private.handle_new_user()`          | `after insert on auth.users`                               | inserts the profile (definer)                                     |
| `private.set_updated_at()`           | `before update of <A15 item update allowlist> on items`    | `new.updated_at = now()` (migration `items_updated_at`, US2)      |
| `private.items_set_search_vector()`  | `before insert or update of title, description, note, url` | `new.search_vector = private.item_search_vector(…)` (definer, R5) |
| `private.item_tags_refresh_vector()` | `after insert or delete on item_tags` (row)                | recomputes the affected item's vector (definer, R5)               |
| `private.tags_refresh_vectors()`     | `after update of name on tags` (row)                       | recomputes vectors of items linked to the tag (definer, R5)       |
| `private.item_search_vector(…)`      | called by the three above                                  | builds the weighted `simple` vector                               |
| `public.search_items(…)`             | client RPC                                                 | see [search contract](contracts/search-items.md)                  |

Vector weights (A4, config `simple`): title **A**; tag names and note **B**; description **C**; URL
split on `/:.?=&_-` **D**.

**Adding an item column later**: grant it in the insert/update allowlist on purpose (A15/A16),
add it to the `set_updated_at` trigger column list if clients may edit it (R6), and update the
`010-schema` privilege assertions.

## State: `preview_status`

```text
pending ──(preview ok)──▶ ok
   │                       │
   └──(preview failed)──▶ failed
ok / failed ──(refresh, US-10)──▶ pending or straight to ok / failed
```

The database allows any transition the client writes (the client owns the save flow, M5); it only
enforces the enum and the `pending` default.
