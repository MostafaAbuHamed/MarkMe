# Contract: `@markme/domain` after M2

What M3 (preview API), M4 (extension shell), M5 (save flow) and M6 (library) get from
`packages/domain`. Behavior and value rules are in [data-model.md](../data-model.md); this file
fixes names, signatures, entry points and files.

## Entry points (`packages/domain/package.json` `exports`)

| Subpath                 | File                  | Loads `@supabase/supabase-js` |
| ----------------------- | --------------------- | ----------------------------- |
| `@markme/domain`        | `src/index.ts`        | never (A31, FR-018)           |
| `@markme/domain/client` | `src/client/index.ts` | yes                           |

## `@markme/domain` exports

Existing (M0, unchanged): `DOMAIN_PACKAGE`, `parseEnv`, `EnvError`, `EnvIssue`.

### Links (`src/url/`)

```ts
type NormalizeError = "invalid" | "unsupported_scheme" | "has_credentials" | "too_long";
type NormalizeResult =
  { ok: true; url: string; normalizedUrl: string } | { ok: false; error: NormalizeError };

function normalizeUrl(input: string): NormalizeResult; // tab URLs, schemas (FR-001–FR-003)
function parseUserUrl(input: string): NormalizeResult; // paste field only (FR-004, A22)

type Provider = "youtube" | "x" | "instagram";
const YOUTUBE_ID_PATTERN: RegExp; // /^[A-Za-z0-9_-]{11}$/
function detectProvider(url: string): Provider | null;
function extractYouTubeId(url: string): string | null;
```

`parseUserUrl` steps on the trimmed input, first match wins:

1. Scheme present: `/^[a-z][a-z0-9+.-]*:\/\//i`, or
   `/^(https?|mailto|javascript|data|tel|sms|about|blob|vbscript):/i` → `normalizeUrl(input)`.
2. No whitespace, and the text before the first `/`, `?` or `#` contains `.` →
   `normalizeUrl('https://' + input)`.
3. Otherwise → `{ ok: false, error: 'invalid' }`, without parsing.

### Media type (`src/media-type.ts`)

```ts
type MediaType = Enums<"media_type">; // from @markme/database
function detectMediaType(input: {
  url: string;
  contentType?: string;
  ogType?: string;
  oembedType?: string;
  provider?: Provider | null;
}): MediaType;
```

### Schemas (`src/schemas/`)

All are zod 4 schemas. `z.input` and `z.output` types are exported next to each one as
`<Name>Input` / `<Name>`.

| Export                  | Output                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `LIMITS`                | frozen `{ title, description, siteName, note, url, name, tagsPerItem }`                                 |
| `mediaType`             | `z.enum(Constants.public.Enums.media_type)`                                                             |
| `previewStatus`         | `z.enum(Constants.public.Enums.preview_status)`                                                         |
| `embedProvider`         | `z.enum(Constants.public.Enums.embed_provider)`                                                         |
| `httpUrl`               | `{ url: string; normalizedUrl: string }`                                                                |
| `note`, `title`         | `string \| null`                                                                                        |
| `folderName`, `tagName` | `string`                                                                                                |
| `tagNames`              | `string[]` (deduped, ≤ 20)                                                                              |
| `tagIds`                | `string[]` (uuids, deduped, ≤ 20)                                                                       |
| `itemCreate`            | `{ url: { url; normalizedUrl }; folderId?; tagNames?; note? }`                                          |
| `itemUpdate`            | `{ title?; note?; folderId?: string \| null; tagIds? }`                                                 |
| `previewRequest`        | `{ url: { url; normalizedUrl }; force?: boolean }`                                                      |
| `previewResponse`       | see data model                                                                                          |
| `previewError`          | `{ error: PreviewErrorCode }`                                                                           |
| `PREVIEW_ERROR_CODES`   | `readonly ['invalid_url', 'unauthorized', 'blocked_target', 'rate_limited', 'fetch_failed', 'timeout']` |

`httpUrl` failure: one zod issue with `code: 'custom'`, `message` = the `NormalizeError`, and
`params: { code: NormalizeError }`. Helper for callers:

```ts
function urlErrorCode(error: z.ZodError): NormalizeError | null; // first httpUrl issue's code
```

## `@markme/domain/client` exports

```ts
interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
interface CreateMarkMeClientOptions {
  url: string;
  anonKey: string;
  storage: AuthStorage;
  detectSessionInUrl?: boolean; // default false
}
function createMarkMeClient(opts: CreateMarkMeClientOptions): SupabaseClient<Database>;
type MarkMeClient = SupabaseClient<Database>;
```

Fixed `auth` options: `flowType: 'pkce'`, `autoRefreshToken: true`, `persistSession: true`. No
other option is accepted (no `lock`, `storageKey`, `global`, …). New client per call; no
module-level client.

## Dependencies (`packages/domain/package.json`)

| Package                 | Kind       | Version       | Reason                                                    |
| ----------------------- | ---------- | ------------- | --------------------------------------------------------- |
| `@markme/database`      | dependency | `workspace:*` | `Constants` and `Database` types (A34)                    |
| `@supabase/supabase-js` | dependency | `^2.118.0`    | client factory, client subpath only (A31; ≥ 2.107, S0 Q5) |
| `@vitest/coverage-v8`   | dev        | `5.0.5`       | coverage gate (A32); must equal the `vitest` version      |
| `zod`                   | dependency | unchanged     |                                                           |

## Files

```text
packages/domain/
├── package.json          # exports "./client"; deps above; "test": "vitest run --coverage"
├── tsconfig.json         # + "lib": ["ES2023", "DOM"] (R10)
├── eslint.config.mjs     # base config + no-restricted-imports for supabase-js outside src/client (R11)
├── vitest.config.ts      # coverage v8, 100% lines/branches on src/url/** (R12)
└── src/
    ├── index.ts                    # re-exports below; never imports ./client
    ├── index.test.ts               # + entry point loads without supabase-js (SC-005)
    ├── url/
    │   ├── normalize.ts            # normalizeUrl, NormalizeError, tracking list
    │   ├── normalize.test.ts       # rule table, tracking table, edge table, idempotence
    │   ├── parse-user-url.ts
    │   ├── parse-user-url.test.ts
    │   ├── provider.ts             # detectProvider, extractYouTubeId, YOUTUBE_ID_PATTERN, Provider
    │   └── provider.test.ts
    ├── media-type.ts
    ├── media-type.test.ts
    ├── schemas/
    │   ├── limits.ts               # LIMITS
    │   ├── enums.ts                # mediaType, previewStatus, embedProvider
    │   ├── http-url.ts             # httpUrl, urlErrorCode
    │   ├── ids.ts                  # rowId = z.uuid({ version: "v4" }) (R8), used by tagIds and folderId
    │   ├── text.ts                 # note, title, folderName, tagName, tagNames, tagIds
    │   ├── item.ts                 # itemCreate, itemUpdate
    │   ├── preview.ts              # previewRequest, previewResponse, previewError, PREVIEW_ERROR_CODES
    │   └── *.test.ts               # one per file above
    └── client/
        ├── index.ts                # re-exports factory
        ├── factory.ts              # createMarkMeClient, AuthStorage
        └── factory.test.ts
```

Whether `packages/domain` gets its own `eslint.config.mjs` or the override goes into the shared
`@markme/config/eslint` with a file glob is decided at implementation; either way the rule is
lint-checked in CI.
