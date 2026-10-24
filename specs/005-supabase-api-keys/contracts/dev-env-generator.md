# Contract: `pnpm dev` env generator (`scripts/dev-env.mjs`)

Covers FR-003; US1 scenarios 1 and 3.

## `parseStatusEnv(text)`

- Reads only `API_URL` and `PUBLISHABLE_KEY` lines; strips one pair of surrounding quotes.
- Returns `{ API_URL, PUBLISHABLE_KEY }`.
- If either is absent: throws `Error("Missing PUBLISHABLE_KEY")` (or `API_URL`, or both,
  comma-joined). The message contains no status values. No fallback to `ANON_KEY`.

## `appEnvValues(app, status)`

| app           | values                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `preview-api` | `{ SUPABASE_URL: API_URL }` (unchanged)                                                                                      |
| `extension`   | `{ WXT_SUPABASE_URL: API_URL, WXT_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY, WXT_PREVIEW_API_URL: "http://127.0.0.1:8787" }` |

## Unchanged

`fillExample` (only replaces keys already in the example) and `ensureEnvFile` (`wx` flag: an
existing `.env` is never overwritten).

## Tests (`scripts/dev-env.test.mjs`)

- Status fixture includes `ANON_KEY`, `SERVICE_ROLE_KEY`, `SECRET_KEY`, `JWT_SECRET`; the parsed
  result and the generated extension `.env` contain none of their values.
- Missing `PUBLISHABLE_KEY` names it and leaks no value, even when `ANON_KEY` is present.
