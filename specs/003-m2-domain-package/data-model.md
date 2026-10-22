# Data Model: M2 Domain Package

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

M2 adds no tables. Its "entities" are the in-memory values the shared rules produce and accept.
Field names are camelCase (FR-014); mapping to the snake_case rows of M1 is M5 work. Function
signatures and exports are in [contracts/domain-package.md](contracts/domain-package.md).

## Normalized link

Produced by `normalizeUrl` and `parseUserUrl` (Story 1).

| Field           | Type     | Rule                                                                                     |
| --------------- | -------- | ---------------------------------------------------------------------------------------- |
| `url`           | `string` | Trimmed input, as parsed (`href`): tracking parameters and fragment kept. ≤ 2048 chars   |
| `normalizedUrl` | `string` | Canonical form (rules below). ≤ 2048 chars. Duplicate key and preview cache key (FR-005) |

Failure: `{ ok: false, error }`, `error` ∈ `invalid` · `unsupported_scheme` · `has_credentials` ·
`too_long` (A21). The first failing check wins: parse → scheme → credentials → length (R4).

Canonical form = `protocol + "//" + host + path + ("?" + query, if non-empty)`:

- `protocol` is `http:` or `https:`; `host` is lowercase, ASCII (punycode), and keeps only a
  non-default port (WHATWG, R1).
- `path` has every trailing `/` removed; the root path becomes empty (A5, R2).
- `query` is the raw query with tracking segments and empty segments dropped, the rest unchanged
  (A23, A25, R3).
- No fragment, no userinfo.

Invariants, each tested:

- Idempotent: `normalizeUrl(r.normalizedUrl).normalizedUrl === r.normalizedUrl`.
- `normalizedUrl` matches the M1 check `^https?://` and fits `char_length ≤ 2048` (A17).
- `www.` and provider aliases are never merged (A24).

## Provider

| Value       | Hosts (after parse)                                                                          | Paths                                                 |
| ----------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `youtube`   | `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`                       | `/watch`, or starting `/shorts/`, `/embed/`, `/live/` |
| `youtube`   | `youtu.be`                                                                                   | any                                                   |
| `x`         | `x.com`, `twitter.com`, `www.x.com`, `www.twitter.com`, `mobile.x.com`, `mobile.twitter.com` | any                                                   |
| `instagram` | `instagram.com`, `www.instagram.com`                                                         | starting `/p/`, `/reel/`, `/tv/`                      |
| `null`      | anything else, or input that does not parse                                                  |                                                       |

`Provider` (`youtube | x | instagram`) is a domain type, wider than the database's
`embed_provider` (`youtube` only): X and Instagram are detected but never embedded (A6, A19).

**YouTube video id**: from `v` (`/watch`), the segment after `/shorts/`, `/embed/`, `/live/`, or
the first `youtu.be` segment; valid only if it matches `YOUTUBE_ID_PATTERN`
`^[A-Za-z0-9_-]{11}$` (A19, R6).

## Media type

Values from `Constants.public.Enums.media_type`: `article`, `video`, `image`, `post`, `link`
(A34). Inputs to `detectMediaType`: `url`, optional `contentType`, `ogType`, `oembedType`,
`provider`; text inputs are compared trimmed and lowercased (R7). First match wins (A27):

| Step | Condition                                                                               | Result    |
| ---- | --------------------------------------------------------------------------------------- | --------- |
| 1    | `provider = youtube`, or `oembedType = video`                                           | `video`   |
| 2    | `provider` is `x` or `instagram`                                                        | `post`    |
| 3    | `oembedType = photo`, or `contentType` starts with `image/`                             | `image`   |
| 4    | `ogType` starts with `video.` → `video`; equals `article` → `article`; else no decision | as stated |
| 5    | URL path ends `.png .jpg .jpeg .gif .webp .avif .svg` → `image`; `.mp4 .webm` → `video` | as stated |
| 6    | nothing matched (oEmbed `rich` alone decides nothing)                                   | `link`    |

## Limits

One frozen object, `LIMITS` (A30). Every schema reads from it; M3 truncates to it.

| Key           | Value | M1 ceiling (A18) |
| ------------- | ----- | ---------------- |
| `title`       | 300   | 500              |
| `description` | 1000  | 2000             |
| `siteName`    | 200   | 200              |
| `note`        | 1000  | 1000             |
| `url`         | 2048  | 2048             |
| `name`        | 100   | 100 (trimmed)    |
| `tagsPerItem` | 20    | none             |

## Text values

| Value        | Input → output                                                      | Fails when                             |
| ------------ | ------------------------------------------------------------------- | -------------------------------------- |
| `note`       | trimmed; `""` → `null` (A29)                                        | > 1000 after trim                      |
| `title`      | trimmed; `""` → `null` (A29)                                        | > 300 after trim                       |
| `folderName` | trimmed                                                             | empty or > 100 after trim              |
| `tagName`    | trimmed, inner whitespace runs → one space (A28)                    | empty or > 100 after cleaning; has `,` |
| `tagNames`   | each a `tagName`; duplicates removed by lowercase, first kept (A28) | any name fails; > 20 after dedupe      |
| `tagIds`     | each a v4 uuid; duplicates removed                                  | any id invalid; > 20 after dedupe      |

## Item input

| Shape        | Fields                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `itemCreate` | `url`: `httpUrl` → `{ url, normalizedUrl }` (A33); `folderId?`: uuid; `tagNames?`; `note?`                                     |
| `itemUpdate` | all optional: `title?` (`string → string \| null`); `note?`; `folderId?`: uuid or `null` (clear); `tagIds?` (replaces the set) |

Unknown keys (for example `userId`) are stripped (R8). An empty `itemUpdate` is valid (no change).

## Preview request / result / error

| Shape             | Fields                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `previewRequest`  | `url`: `httpUrl`; `force?`: boolean                                                                                                                                                                                            |
| `previewResponse` | `url`: web link; `title?` ≤ 300; `description?` ≤ 1000; `imageUrl?`, `faviconUrl?`: web links; `siteName?` ≤ 200; `mediaType`: enum; `embed?`: `{ provider: embed_provider, id: YOUTUBE_ID_PATTERN }`; `provider?`: `Provider` |
| `previewError`    | `error` ∈ `invalid_url`, `unauthorized`, `blocked_target`, `rate_limited`, `fetch_failed`, `timeout` (A35)                                                                                                                     |

"Web link" = string ≤ 2048 that `normalizeUrl` accepts; kept as given (R8). Absent optional
fields are omitted, not `null`.

`previewStatus` (`pending`, `ok`, `failed`, from `Constants`) is exported for M5. M2 implements no
state change; the transition `pending → ok | failed` is M5's save flow (constitution V).

## Session storage and client

| Entity        | Shape                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `AuthStorage` | `getItem(key) → Promise<string \| null>`, `setItem(key, value) → Promise<void>`, `removeItem(key) → Promise<void>`                  |
| Client        | `SupabaseClient<Database>`, new per call; fixed `pkce`, auto refresh, persisted session; `detectSessionInUrl` default `false` (A31) |
