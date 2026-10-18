# Contract: App configuration (M0)

Each app's settings, as declared in its `env.ts` and listed in its committed `.env.example`
(FR-017, FR-020). Later milestones add keys (for example M3 `CORS_ORIGINS` and rate limits); each
added key also goes into `.env.example`, the `dev.mjs` fill map if the stack provides it, and a
test (SC-005).

## `apps/preview-api` (`.env`, loaded with `process.loadEnvFile` when present)

| Key            | Required            | Format (zod)                                | Description shown on error                    | Secret | `.env.example` value     | Filled by `pnpm dev` from |
| -------------- | ------------------- | ------------------------------------------- | --------------------------------------------- | ------ | ------------------------ | ------------------------- |
| `PORT`         | no (default `8787`) | `z.coerce.number().int().min(1).max(65535)` | "a port number from 1 to 65535"               | no     | `8787`                   | — (example value kept)    |
| `SUPABASE_URL` | yes                 | `z.url({ protocol: /^https?$/ })`           | "an http(s) URL, e.g. http://127.0.0.1:54321" | no     | `http://127.0.0.1:54321` | `API_URL`                 |

- `SUPABASE_URL` is declared now because M3 builds the JWKS URL and issuer from it. It also gives
  US-3 a real required URL to test.
- Cloud Run injects `PORT` in production (M3).

## `apps/extension` (`.env`, loaded by WXT/Vite; validated in `wxt.config.ts`)

| Key                     | Required | Format (zod)                      | Description shown on error                                   | Secret                | `.env.example` value          | Filled by `pnpm dev` from         |
| ----------------------- | -------- | --------------------------------- | ------------------------------------------------------------ | --------------------- | ----------------------------- | --------------------------------- |
| `WXT_SUPABASE_URL`      | yes      | `z.url({ protocol: /^https?$/ })` | "an http(s) URL, e.g. http://127.0.0.1:54321"                | no                    | `http://127.0.0.1:54321`      | `API_URL`                         |
| `WXT_SUPABASE_ANON_KEY` | yes      | `z.string().min(20)`              | "the public anon key printed by `pnpm exec supabase status`" | no (public by design) | `replace-with-local-anon-key` | `ANON_KEY`                        |
| `WXT_PREVIEW_API_URL`   | yes      | `z.url({ protocol: /^https?$/ })` | "an http(s) URL, e.g. http://127.0.0.1:8787"                 | no                    | `http://127.0.0.1:8787`       | `http://127.0.0.1:${PORT}` (8787) |

- **Forbidden (FR-022)**: no key in the extension schema may name or accept a privileged key. A unit
  test asserts the schema's key set equals exactly the three keys above. Adding a key needs a
  deliberate test change, which a reviewer sees.
- The placeholder `replace-with-local-anon-key` has fewer than 20 characters, so an unfilled example
  copied by hand fails validation with a clear message instead of reaching runtime.

## Rules for `scripts/dev.mjs` (FR-007a)

- It reads only `API_URL` and `ANON_KEY` from `supabase status -o env`. Any other line
  (`SERVICE_ROLE_KEY`, `SECRET_KEY`, `JWT_SECRET`, `S3_*`) is ignored by an allowlist parse.
- It writes `apps/<app>/.env` only if it is absent, with `fs.writeFile(path, data, { flag: 'wx' })`.
- It keeps every other line of `.env.example` unchanged, including comments.
- It reports, one line per app, `created apps/<app>/.env` or `found apps/<app>/.env (left unchanged)`.
