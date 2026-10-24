# Data Model: Supabase API keys

No database change. The "entities" here are configuration values and the findings the bundle check
reports.

## Key kinds

| Kind                | Shape                                        | Postgres role                                   | Allowed in                                                    | Never in                                     |
| ------------------- | -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| Publishable key     | `sb_publishable_` + ≥ 20 of `[A-Za-z0-9_-]`  | `anon` (no user) / `authenticated` (user token) | extension `.env`, bundle, GitHub variables, docs              | n/a                                          |
| Secret key          | `sb_secret_` + key characters                | `service_role` (bypasses RLS)                   | test/seed env only (`SUPABASE_SECRET_KEY`)                    | any app config or bundle; browser code (401) |
| Legacy anon         | JWT, payload `role: "anon"`                  | `anon`                                          | nowhere (being removed)                                       | everywhere                                   |
| Legacy service_role | JWT, payload `role: "service_role"`          | `service_role`                                  | nowhere                                                       | everywhere                                   |
| User access token   | JWT (ES256), payload `role: "authenticated"` | `authenticated`                                 | runtime only: `Authorization: Bearer`, chrome.storage session | config files, bundle                         |

One publishable key per environment: local (fixed by the CLI) and hosted (`markme`). Local keys
never work against the hosted project.

## Environment variables

| App / scope | Variable                       | Value           | Change                                                                |
| ----------- | ------------------------------ | --------------- | --------------------------------------------------------------------- |
| extension   | `WXT_SUPABASE_URL`             | API URL         | unchanged                                                             |
| extension   | `WXT_SUPABASE_PUBLISHABLE_KEY` | publishable key | replaces `WXT_SUPABASE_ANON_KEY` (removed)                            |
| extension   | `WXT_PREVIEW_API_URL`          | preview API URL | unchanged                                                             |
| preview-api | (no project key)               |                 | unchanged; JWKS only                                                  |
| tests only  | `SUPABASE_SECRET_KEY`          | secret key      | replaces planned `SUPABASE_SERVICE_ROLE_KEY` (docs only; no user yet) |

The extension schema stays locked to exactly the three keys above; the lock test also asserts no
key name matches `SERVICE|SECRET|JWT|ANON`.

## `supabase status -o env` → generator input

Allowlist read by `parseStatusEnv`: `API_URL`, `PUBLISHABLE_KEY`. Every other line (including
`ANON_KEY`, `SERVICE_ROLE_KEY`, `SECRET_KEY`, `JWT_SECRET`) is skipped and never stored.

## Bundle-check finding

```text
Finding { file: string (path relative to the scanned dir), kind: FindingKind }
FindingKind = "secret-key" | "service-role-name" | "legacy-jwt-anon" | "legacy-jwt-service_role"
```

A finding never carries the matched text. Validation: a JWT-shaped match whose payload does not
decode to JSON, or whose `role` is anything else (e.g. `authenticated`), is not a finding.

## State: hosted legacy keys

```text
enabled ──(owner disables in dashboard, after US1/US2/US4 merged + H2 passes)──▶ disabled
disabled ──(owner re-enables: rollback)──▶ enabled
disabled ──(Supabase final removal, late 2026)──▶ removed (terminal)
```
