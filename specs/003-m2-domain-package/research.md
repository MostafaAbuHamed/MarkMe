# Research: M2 Domain Package

**Date**: 2026-10-22 · **Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Inputs: `docs/IMPLEMENTATION_PLAN.md` §3 M2 and §4 (A5, A17, A19, A21–A36, all approved), the
spec, and checks run on 2026-10-22: Node 24.22.0 WHATWG `URL` probes, `tsc` probes in
`packages/domain`, and the npm registry. The approved design leaves no open product decisions, so
the Technical Context had no NEEDS CLARIFICATION. Each item below confirms a platform fact the
design relies on, or settles a detail the design left open. R2, R3 and R5 are small differences
from the implementation plan and are copied back into it in this change (its change rule).

---

## R1. WHATWG `URL` already does rules 1, 3, 4 and most of 7

- **Finding** (Node 24.22.0, same parser as Chrome):
  - `HTTPS://Ex.COM:443/A` → `protocol` `https:`, `host` `ex.com`, `pathname` `/A`. Scheme and
    host are lowercased, the default port is dropped, path case is kept.
  - `https://bücher.de` → `host` `xn--bcher-kva.de`.
  - `http://[::1]` → `host` `[::1]`.
  - `https://a.com?` and `https://a.com/x?#f` → `search` is `""`. An empty query is invisible
    in `search`.
  - `https://a:b.c` → `URL.parse` returns `null` (bad port).
  - `https://u@a.com` → `username` `u`. `https://:@a.com` → empty `username` and `password`; the
    parser drops the empty userinfo.
  - `https://a.com?q=a+b&r=%20&s=a b` → `search` `?q=a+b&r=%20&s=a%20b`. The parser
    percent-encodes a raw space but keeps `+` and existing escapes.
  - `javascript:alert(1)` parses, with `protocol` `javascript:`.
- **Decision**:
  - Parse with `URL.parse(trimmed)`; `null` → `invalid`.
  - Build `normalizedUrl` from parts, never by editing `href`:
    `protocol + "//" + host + path + (query ? "?" + query : "")`. `host` already holds a
    non-default port. Building from parts drops the fragment and an empty `?` for free.
  - "Byte for byte" (A25) means byte for byte **after** the WHATWG parse. That parse is the only
    encoding change and it is the same in every browser and in Node.
  - Credentials = `username !== "" || password !== ""`. A username alone counts (`u@a.com` →
    `has_credentials`).
- **Rationale**: The standard parser is the spec's stated assumption, and it behaves the same in
  the extension and the preview API. Building from parts is simpler than stripping pieces off
  `href`, and it cannot leave a stray `?` or `#`.
- **Alternatives considered**: A hand-written parser (more code, more edge cases); editing `href`
  with string replacements (fragile around `?#`).

## R2. Trailing slashes: strip all of them, so the normalizer is idempotent (difference)

- **Finding**: Rule 9 says "remove trailing slash". With "strip one",
  `https://a.com//` → `https://a.com/`, and normalizing that again gives `https://a.com`. The
  normalizer would not be idempotent, so the same page could get two duplicate keys depending on
  whether a stored value is normalized again.
- **Decision**: Strip every trailing `/` from the path. Inner repeated slashes stay
  (`/a//b` kept; `/a//` → `/a`). A test asserts
  `normalizeUrl(x.normalizedUrl).normalizedUrl === x.normalizedUrl` for every successful row of
  the rule and edge tables.
- **Rationale**: The duplicate key must be a fixed point. The change affects only paths that end
  in two or more slashes, which no real page relies on.
- **Alternatives considered**: Strip one slash (not idempotent); collapse all repeated slashes
  (changes meaningful paths; the spec keeps them).

## R3. Query editing: split on `&`, drop tracking keys and empty segments (difference)

- **Decision** (A25):
  1. Take `url.search` without the leading `?`. Split on `&`.
  2. A segment's key is the text before the first `=` (the whole segment if there is none).
  3. Drop a segment if its key, lowercased, starts with `utm_` or equals one of `fbclid`, `gclid`,
     `dclid`, `gbraid`, `wbraid`, `msclkid`, `igsh`, `igshid`, `mc_cid`, `mc_eid`. Also drop `si`
     when the host is `youtube.com`, ends with `.youtube.com`, or is `youtu.be`.
  4. Drop empty segments (from `&&`, a leading `&` or a trailing `&`). This is the one
     difference: a pair with no key and no value carries no data, and keeping it would leave
     `?&` after `?&utm_source=x`, against rule 7.
  5. Join the rest with `&`, unchanged. An empty result → no query.
- Keys are matched as written, not percent-decoded (`utm%5Fsource` is kept). Decoding would be a
  second encoding rule for a case no tracker uses.
- `?a=` and `?a` are kept (they are not empty segments). `?a=1&a=2` is kept.
- **Rationale**: Matches A23/A25 and the edge-case table. `URLSearchParams` is used only to read
  YouTube's `v` (R6), never to write.

## R4. Error order and length cap

- **Decision**: Checks run in this order, and the first failure is returned:
  1. trim + parse → `invalid`;
  2. `protocol` not `http:`/`https:` → `unsupported_scheme`;
  3. credentials → `has_credentials`;
  4. `url.href.length > 2048` or `normalizedUrl.length > 2048` → `too_long`.
- `url` (the "open original" value) is `href` as parsed: tracking parameters and fragment kept.
- Lengths count UTF-16 code units (`string.length`). After the WHATWG parse a URL is ASCII, so
  this equals Postgres `char_length`, which the M1 check uses.
- **Rationale**: Scheme comes before credentials, so `ftp://u:p@a.com` reports the more basic
  problem. Length comes last because it needs both outputs.

## R5. Provider hosts: `www.` forms of Instagram and X are included (difference)

- **Finding**: Instagram's own share links use `www.instagram.com/p/…`, and A24 keeps `www.`.
  A detector that only matched the bare host would miss almost every real Instagram link, and
  those links would be typed `link` instead of `post`.
- **Decision** (A26):
  - YouTube: hosts `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, with
    path `/watch` or a path starting `/shorts/`, `/embed/` or `/live/`; or host `youtu.be`, any
    path.
  - X: hosts `x.com`, `twitter.com`, and their `www.` and `mobile.` forms; any path.
  - Instagram: hosts `instagram.com`, `www.instagram.com`, path starting `/p/`, `/reel/` or
    `/tv/`.
  - Anything else, including a string that does not parse, → `null`. Hosts are compared after
    the parse, so they are already lowercase.
- **Rationale**: The spec scenario says "an `instagram.com` link", which a `www.` link is. Adding
  `www.` to X keeps the two social providers alike. No other host is added.
- **Alternatives considered**: The exact host list in the implementation plan (misses real
  links); any subdomain (`*.instagram.com` would also match `help.instagram.com`).

## R6. YouTube id extraction

- **Decision**: `extractYouTubeId(url)` returns `null` unless `detectProvider(url) === 'youtube'`.
  Then the candidate is:
  - `/watch` → the `v` query value (read with `URLSearchParams`);
  - `/shorts/ID`, `/embed/ID`, `/live/ID` → the path segment after the prefix;
  - `youtu.be/ID` → the first path segment.

  The candidate is returned only if it matches `YOUTUBE_ID_PATTERN` = `/^[A-Za-z0-9_-]{11}$/`
  (A19, the same rule as the M1 `items_embed_chk`). A trailing segment (`/shorts/ID/`) is
  ignored; `youtu.be/` with no id → `null`.

- **Rationale**: One function for M3 (embed) and M6 (iframe); the exported pattern lets the
  `previewResponse` schema check `embed.id` with the same rule.

## R7. Media-type input matching

- **Decision**: `detectMediaType` lowercases and trims `contentType`, `ogType` and `oembedType`
  before comparing, and drops `contentType` parameters (`image/png; charset=…`). Step 5 reads the
  extension from the parsed URL's `pathname` (lowercased), so `?x=.png` does not count. If the
  URL does not parse, step 5 is skipped. `provider` is passed in by the caller (M3 has already
  called `detectProvider`); the function does not detect it again.
- **Rationale**: HTTP media types are case-insensitive, and pages write `og:type` as `Article`.
  Reading the path avoids matching query text.

## R8. Zod 4 patterns

- **`httpUrl`** (A33): `z.string().transform((value, ctx) => …)` calls `normalizeUrl`. On failure it
  adds a `custom` issue whose `message` is the error code and whose `params` is `{ code }`, and
  returns `z.NEVER`. The output is `{ url, normalizedUrl }`. Callers read the code from
  `issue.params.code` (typed helper in the contract), not by parsing a message.
- **Trimmed optional text** (`note`, `title`, A29): `z.string().trim().max(N)` then
  `.transform(v => v === "" ? null : v)`. The length is checked after trimming.
- **Names**: `trim`, then collapse `\s+` to one space (tag names only), then `min(1)`, `max(100)`,
  and for tag names a `refine` that rejects `,`.
- **Tag lists**: an array of `tagName`, transformed by a dedupe that keeps the first spelling by
  `toLowerCase()`, then piped into `z.array(z.string()).max(20)`, so the cap applies after
  dedupe. `tagIds` uses the same shape over `z.uuid()`.
- **Ids**: `z.uuid()` (RFC 9562 version and variant). Postgres `gen_random_uuid()` makes v4 ids,
  which pass. Test fixtures must use real v4 ids, not all-zero ones.
- **Objects**: default `z.object` (unknown keys are stripped), so a client cannot pass `userId`
  or other extra fields through a schema.
- **Preview link fields** (`url`, `imageUrl`, `faviconUrl` in `previewResponse`): a string with
  `max(LIMITS.url)` and a `refine(v => normalizeUrl(v).ok)`. The value stays as given (not the
  canonical form). This reuses the one URL rule set (A33) without turning the field into an
  object.
- **Length counting**: zod `.max` counts UTF-16 code units. Postgres `char_length` counts code
  points. For text with emoji, zod's count is the larger one, so a value that passes the schema
  always passes the M1 checks. The error is on the safe side.

## R9. Enums from `Constants` (A34)

- **Finding**: `@markme/database` exports `Constants.public.Enums` as `const` tuples:
  `media_type` `["article","video","image","post","link"]`, `preview_status`
  `["pending","ok","failed"]`, `embed_provider` `["youtube"]`.
- **Decision**: `z.enum(Constants.public.Enums.media_type)` and the same for the other two. The
  tests assert `schema.options` equals the `Constants` tuple at runtime and, with `expectTypeOf`,
  that `z.infer` equals `Enums<'media_type'>`. A changed migration regenerates `types.gen.ts`
  (CI drift check), and the schemas follow without an edit.
- `@markme/database` becomes a `workspace:*` **dependency** of `@markme/domain` (runtime import of
  `Constants`).

## R10. TypeScript globals for `URL` (difference from the current tsconfig)

- **Finding**: The base tsconfig sets `lib: ["ES2023"]` and `types: []`. A probe file using
  `URL.parse` and `URLSearchParams` type-checks in `packages/domain` today only because
  `vitest.config.ts` is in `include`, and Vitest's types pull in `@types/node` globals.
- **Decision**: `packages/domain/tsconfig.json` sets `"lib": ["ES2023", "DOM"]`. Domain code runs
  in the extension (a browser) and in Node 24, and both implement the WHATWG `URL`, including
  `URL.parse`. `supabase-js` types also expect DOM `fetch` types. No new dependency.
- **Alternatives considered**: Rely on the transitive `@types/node` (breaks silently if Vitest's
  types change); `types: ["node"]` (exposes `process` and `Buffer` to code that also runs in the
  browser).

## R11. Client factory: `@supabase/supabase-js` 2.118.0 (A31)

- **Version**: `^2.118.0` (released 2026-10-15). It is above the 2.107 floor from S0 Q5
  (lockless refresh). It is a runtime **dependency** of `@markme/domain`, used only by
  `src/client/`.
- **Options** passed to `createClient<Database>(url, anonKey, { auth })`: `storage`,
  `flowType: 'pkce'`, `autoRefreshToken: true`, `persistSession: true`,
  `detectSessionInUrl: opts.detectSessionInUrl ?? false`. Nothing else, so `lock`,
  `storageKey`, `debug` and other keys cannot be passed. The options type has no index
  signature, so `lock` is a type error, and the factory builds `auth` from named fields only, so
  a cast-in `lock` is dropped at runtime.
- **Tests** (`factory.test.ts`), with no network:
  - `vi.mock('@supabase/supabase-js', …)` wraps the real `createClient` in a `vi.fn` that calls
    through, so the test can assert the exact `auth` object and still get a real client.
  - Storage: an in-memory `AuthStorage` with spy methods. A stored, unexpired session written
    under the key the client asks for (taken from the first `getItem` call, not hard-coded) is
    returned by `auth.getSession()`, and `auth.signOut({ scope: 'local' })` calls `removeItem`.
  - Two calls → `not.toBe`.
- **Isolation** (SC-005): `src/index.ts` never imports `src/client/`. Two guards:
  - a test that `vi.mock`s `@supabase/supabase-js` with a factory that throws, then imports
    `./index` and expects it to resolve;
  - an ESLint `no-restricted-imports` override that bans `@supabase/supabase-js` outside
    `src/client/**`.

## R12. Coverage gate: `@vitest/coverage-v8` 5.0.5 (A32)

- **Version**: `5.0.5`, exact, matching the pinned `vitest` 5.0.5 (its `peerDependencies` require
  `vitest: 5.0.5`). Dev dependency of `@markme/domain` only.
- **Config** (`vitest.config.ts`): `coverage.provider: 'v8'`, `include: ['src/**/*.ts']`,
  `exclude: ['src/**/*.test.ts']`, and `thresholds: { 'src/url/**': { lines: 100, branches: 100 }
}`. Files under `include` that no test loads count as 0%, so an untested file fails the gate.
- **Script**: `"test": "vitest run --coverage"`. The root `pnpm test` → Turbo → CI `test` job runs
  it with no CI change. Turbo already caches `coverage/**`, and `coverage/` is git-ignored.
- Focused runs during development use `pnpm exec vitest run <file>` (no coverage, no gate).
- `src/url/**` holds `normalize.ts`, `parse-user-url.ts` and `provider.ts`, so the provider rules
  are held to 100% too. That is stricter than FR-020 (link normalization only) and costs nothing.
