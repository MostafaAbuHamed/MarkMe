# Data Model: M3 Preview API

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

M3 adds no tables and writes nothing to the database. Writing the preview into an item is M5
work. The entities here are in-memory values inside the service. The wire shapes
(`PreviewRequest`, `PreviewResponse`, `PreviewError`) belong to `@markme/domain` (M2) and are only
consumed here. Signatures are in [contracts/preview-api.md](contracts/preview-api.md).

## Preview request (from M2)

| Field   | Type                                     | Rule                                                                                     |
| ------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `url`   | `{ url: string; normalizedUrl: string }` | Output of `httpUrl`. The service fetches `url` and uses `normalizedUrl` as the cache key |
| `force` | `boolean \| undefined`                   | `true` skips the cache read; it is counted by the force limiter                          |

## Caller

| Field    | Source              | Rule                                                                                   |
| -------- | ------------------- | -------------------------------------------------------------------------------------- |
| `userId` | the JWT `sub` claim | Non-empty string. Set on `req` by `auth.ts`; never read from the body (constitution I) |

The token must be ES256, with `iss = ${SUPABASE_URL}/auth/v1` and `aud = authenticated`, and not
expired (A37, R7).

## Address policy

`isBlockedAddress(ip) === true` when any of these holds (R5):

- `ipaddr.process(ip).range() !== "unicast"`. This covers loopback, private, CGNAT, link-local and
  metadata, reserved, documentation, benchmarking, multicast, broadcast, unspecified, unique local,
  NAT64, 6to4 and Teredo. IPv4-mapped addresses are checked as IPv4.
- The address is in the explicit CIDR list in `docs/IMPLEMENTATION_PLAN.md` §3 M3 (defense in
  depth).
- The input is not an IP address.

## Resolved target

| Field     | Rule                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `address` | The first IPv4 address of the lookup, or the first IPv6 address when there is no IPv4 (A41). The whole lookup is refused if **any** address is blocked |
| `family`  | `4` or `6`                                                                                                                                             |

The connection uses only this address. The hostname is kept for SNI and `Host` (R3).

## Fetch hop and fetch result

Each hop goes through the same checks in order: scheme ∈ {`http:`, `https:`}, then port ∈
{``, `80`, `443`}, then resolve plus policy, then `fetch` through a pinned agent with
`redirect: "manual"`.

| State                            | Next                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| 3xx with `Location`              | resolve `Location` against the current URL; hop count + 1; if > 3 → `fetch_failed` |
| 2xx, type allowed, `image/*`     | done; body not read (A39)                                                          |
| 2xx, type allowed, other         | read the body until the end, or until 2 MB decompressed → `fetch_failed`           |
| 2xx, type missing or not allowed | `fetch_failed`                                                                     |
| any other status                 | `fetch_failed` (A45)                                                               |
| deadline passed (any point)      | `timeout`                                                                          |
| check refused (any hop)          | `blocked_target`                                                                   |

`SafeFetchResult` holds `finalUrl`, `status`, `contentType` (the media type only), `charset` and
`body`.

## Page metadata

Produced by `parseHtmlMetadata` before sanitizing.

| Field         | First source → fallbacks                                                    |
| ------------- | --------------------------------------------------------------------------- |
| `title`       | `og:title` → `twitter:title` → `<title>`                                    |
| `description` | `og:description` → `twitter:description` → `meta[name=description]`         |
| `imageUrl`    | `og:image` (or `og:image:url`) → `twitter:image`                            |
| `siteName`    | `og:site_name`                                                              |
| `faviconUrl`  | `link[rel~=icon]` (first `href`) → `/favicon.ico` on the final URL's origin |
| `ogType`      | `og:type`, passed to `detectMediaType`                                      |

URL fields are resolved against `finalUrl` and kept only when they use `http(s)`. They are dropped
when the host is `localhost` or a blocked IP literal; there is no DNS lookup for this check (A42).

The charset comes from the header, then `<meta>` in the first 1,024 bytes, then UTF-8. An unknown
label falls back to UTF-8 (A40).

## oEmbed result

| Field         | YouTube                                                        | X / Instagram                                |
| ------------- | -------------------------------------------------------------- | -------------------------------------------- |
| `title`       | `title`                                                        | from the HTML path                           |
| `description` | —                                                              | text of the `html` blockquote                |
| `imageUrl`    | `thumbnail_url`                                                | `thumbnail_url` if given, else the HTML path |
| `siteName`    | `provider_name`                                                | `provider_name`                              |
| `oembedType`  | `type`, passed to `detectMediaType`                            | `type`                                       |
| `embed`       | `{ provider: "youtube", id }` when `extractYouTubeId` succeeds | never (A6, A19)                              |

`null` means the adapter failed or is disabled, and the HTML path is used (FR-017). For X and
Instagram, the oEmbed fields fill the gaps in the HTML result, which runs as well. Provider HTML
is never kept.

## Preview (built by the pipeline)

The output is `previewResponse.parse(...)`:

- `url`: the final URL.
- `title`, `description`, `siteName`: `sanitizeText(value, LIMITS.x)`, `undefined` when empty.
- `imageUrl`, `faviconUrl`: kept only if `normalizeUrl(...).ok`. Otherwise `undefined`.
- `mediaType`: `detectMediaType({ url, provider, oembedType, ogType, contentType })`.
- `provider`: `detectProvider(url)`, or `undefined`.
- `embed`: as in the oEmbed result above.

Special cases:

- **Direct image**: `imageUrl = finalUrl`, `mediaType = "image"`, and
  `title = decodeURIComponent(last path segment)`, cleaned. If decoding fails, the raw segment is
  used (A39).
- **Nothing found**: `{ url, mediaType }` only, with status 200 (A45).

## Stored preview

| Key             | Value             | Rule                                                                                                                                      |
| --------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `normalizedUrl` | `PreviewResponse` | LRU, at most 5,000 entries, TTL 24 h, per instance, shared across users. `force` skips the read and writes. Errors are never stored (R11) |

The cache is lost on restart or scale to zero (accepted, PLAN M3).

## Rate-limit counters

| Limiter     | Key                                   | Window | Default limit | Env key                     | Position                   |
| ----------- | ------------------------------------- | ------ | ------------- | --------------------------- | -------------------------- |
| IP          | `req.ip` (IPv6 /56 subnet)            | 1 min  | 60            | `RATE_LIMIT_IP_PER_MIN`     | before auth                |
| User minute | `userId`                              | 1 min  | 20            | `RATE_LIMIT_USER_PER_MIN`   | after auth                 |
| User day    | `userId`                              | 24 h   | 300           | `RATE_LIMIT_USER_PER_DAY`   | after user minute          |
| Force       | `userId` (only when `force === true`) | 1 h    | 10            | `RATE_LIMIT_FORCE_PER_HOUR` | after user day, before zod |

All counters live in memory and are created per `createApp` (R8). A refusal returns
`429 { error: "rate_limited" }` with `Retry-After` in seconds.

## Log line

```ts
interface LogLine {
  method: string;
  status: number;
  durationMs: number;
  error?: PreviewErrorCode;
  cacheHit?: boolean;
  host?: string; // new URL(url).host only
}
```

There is no field for the path, query, full URL, user id, token or body (A43). Stacks of
unexpected errors go to a separate line that carries no request data.
