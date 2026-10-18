# Data Model: M0 Monorepo Foundation

M0 adds **no database tables** (FR-024). The "entities" here are the spec's Key Entities: the
configuration and tooling objects that later milestones build on.

## 1. App configuration

One per app. It is declared once as a zod schema in that app's `env.ts` (FR-017). Per-app keys are
in [contracts/app-config.md](contracts/app-config.md).

| Field         | Type       | Rule                                                                                                     |
| ------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `name`        | string     | The env var name. The extension's names must start with `WXT_` (exposed to the bundle by Vite)           |
| `format`      | zod schema | e.g. `z.url()`, `z.coerce.number().int().min(1).max(65535)`                                              |
| `description` | string     | The expected format in words. It is the only text shown for an invalid value (FR-018)                    |
| `required`    | boolean    | Required unless it has a default or is `.optional()`                                                     |
| `default`     | value?     | Applied before validation (e.g. `PORT` = 8787)                                                           |
| `secret`      | boolean    | Listed in `secretKeys`. Its value never appears in any message (FR-019). The extension has none (FR-022) |

**Validation rules**

- Validation runs before any other work: before `listen` in the API, and at config time in the
  extension build.
- All issues are collected. One `EnvError` lists every issue (FR-018).
- The message line format is `  - <NAME>: missing` or `  - <NAME>: invalid, expected <description>`.
- The footer is `Copy apps/<app>/.env.example to apps/<app>/.env and fill in the values.`
- Input values are never interpolated.

**Lifecycle of a config file (`apps/<app>/.env`)**

```text
absent ──(pnpm dev: create from .env.example + stack values, flag wx)──▶ present
present ──(pnpm dev)──▶ present, unchanged (reported as "found")
present ──(contributor deletes it)──▶ absent  (the README way to refresh stale values)
```

## 2. `EnvError` (packages/domain)

| Field         | Type                                                                | Notes                               |
| ------------- | ------------------------------------------------------------------- | ----------------------------------- |
| `app`         | string                                                              | `preview-api` \| `extension`        |
| `issues`      | `{ key: string; kind: 'missing' \| 'invalid'; expected: string }[]` | One per bad key, sorted by key      |
| `exampleFile` | string                                                              | Repo-relative path                  |
| `message`     | string                                                              | Rendered from the fields above only |

Its signature is in [contracts/env-helper.md](contracts/env-helper.md).

## 3. Pull-request check

| Field     | Value                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------- |
| `name`    | `lint` \| `typecheck` \| `test` \| `db` \| `secrets` (the GitHub job id is the status-check name) |
| `trigger` | `pull_request` to any branch; `push` to `main`                                                    |
| `result`  | pass \| fail, shown on the PR; all five are required by the ruleset                               |
| `cache`   | `lint`/`typecheck`/`test`: pnpm store + `.turbo/cache`; `db`: pnpm store; `secrets`: none         |

Details are in [contracts/ci-checks.md](contracts/ci-checks.md).

## 4. Local stack

| Service                                          | Started by                                      | Address                                                                                                                       | Stopped by           |
| ------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Supabase (Postgres, Auth, REST, Studio, Mailpit) | `pnpm db:start` (via `pnpm dev` if not running) | API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio `:54323`, Mailpit `:54324` | `pnpm db:stop`       |
| Preview API                                      | `turbo run dev`                                 | `http://127.0.0.1:8787`                                                                                                       | Ctrl-C on `pnpm dev` |
| Extension dev build                              | `turbo run dev` (WXT)                           | output `apps/extension/.output/chrome-mv3-dev`, dev server `:3000`                                                            | Ctrl-C on `pnpm dev` |

The Postgres URL above is the fixed, public local-development default. It is not a secret.
