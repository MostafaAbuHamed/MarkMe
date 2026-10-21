# Contract: `public.search_items`

The one search and list operation (FR-021–FR-028). Called by the extension (M6) through
`supabase.rpc('search_items', …)`. Decisions: A3, A4, A13, A14, A20; shape in research R7.

## Signature

```text
public.search_items(
  p_query     text    default null,
  p_folder_id uuid    default null,
  p_no_folder boolean default false,
  p_tag_ids   uuid[]  default null,
  p_limit     int     default 20,
  p_offset    int     default 0
) returns table (
  id, url, normalized_url, title, description, image_url, favicon_url, site_name,
  media_type, embed_provider, embed_id, folder_id, note, preview_status,
  preview_fetched_at, created_at, updated_at,      -- item columns, same types as items
  tags jsonb,                                      -- [{ "id": uuid, "name": text }, …]
  rank real                                        -- 0 when there is no query
)
language plpgsql stable security invoker set search_path = ''
```

`search_vector` and `user_id` are not returned. Execute is granted to `authenticated` only.

## Inputs

| Parameter     | Meaning                              | Normalization                                       |
| ------------- | ------------------------------------ | --------------------------------------------------- |
| `p_query`     | free text                            | lexemes via `to_tsvector('simple', …)`; none → null |
| `p_folder_id` | only items in this folder            | –                                                   |
| `p_no_folder` | only items with no folder            | `null` → `false`                                    |
| `p_tag_ids`   | only items having **all** these tags | `null` or `{}` → no filter; duplicates ignored      |
| `p_limit`     | page size                            | `coalesce(…, 20)` clamped to 1–50                   |
| `p_offset`    | rows to skip                         | `coalesce(…, 0)`, minimum 0                         |

## Behavior

1. **Text match (A14)**: each lexeme becomes a quoted prefix term `'lexeme':*`; terms are joined
   with `&`. An item matches when every term prefixes some word in its vector. Input characters
   never act as tsquery operators: `a & !b` searches for `a` and `b`; `:*` and `(` alone have no
   lexemes, so they act as no query.
2. **No query (A20)**: `p_query` null, empty, whitespace or punctuation only → no text filter,
   `rank = 0`.
3. **Folder filters (A13)**: `p_folder_id` → `folder_id = p_folder_id`. `p_no_folder = true` →
   `folder_id is null`. Both given → `raise exception` with SQLSTATE `22023`
   (`invalid_parameter_value`) and message `p_folder_id and p_no_folder cannot be combined`.
4. **Tag filter (A3)**: items linked to every distinct id in `p_tag_ids`. An id the user does not
   own (or that no longer exists) matches nothing, so the result is empty, without error.
5. **Ownership**: `security invoker`; RLS on `items`, `item_tags` and `tags` limits every row and
   every embedded tag to the caller. `anon` cannot execute.
6. **Rank**: `ts_rank_cd(search_vector, query)`; weights A title > B tags, note > C description >
   D URL words.
7. **Order**: with a query `rank desc, created_at desc, id desc`; without `created_at desc, id
desc`. The order is total, so consecutive offset pages neither repeat nor skip rows.
8. **Tags**: per row, the item's tags as `[{id, name}]` ordered by `lower(name)`; `[]` when none.
9. **Past the end**: an offset beyond the last row returns an empty set.

## Errors

| Case                                   | SQLSTATE | PostgREST status |
| -------------------------------------- | -------- | ---------------- |
| `p_folder_id` and `p_no_folder = true` | `22023`  | 400              |
| called without a session (`anon`)      | `42501`  | 401              |

## Test cases (`070-search.test.sql`)

Each spec User Story 3 scenario maps to at least one assertion: title above description ranking;
tag-name, note and URL-token matches; `reac` → "React hooks"; `reac hoo` ANDed; operator input
(`a & !b`, `:*`, `(`) without error; empty and punctuation-only → normal list; no-query order;
folder filter; no-folder filter; both → `22023`; ALL-tags filter; tag rename (new name found, old
not); pagination over two pages with no repeat; clamp of `p_limit` 0 and 500; user A never sees
B's items or tags.
