# Contract: extension env (`apps/extension/src/lib/env-schema.ts`)

Covers FR-001, FR-002; US1 scenario 1, US2 scenarios 1–3.

## Schema

| Key                            | Rule                                    | `expected` text (in errors)                                                     |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------- |
| `WXT_SUPABASE_URL`             | unchanged                               | unchanged                                                                       |
| `WXT_SUPABASE_PUBLISHABLE_KEY` | `/^sb_publishable_[A-Za-z0-9_-]{20,}$/` | `a publishable key (sb_publishable_…) printed by \`pnpm exec supabase status\`` |
| `WXT_PREVIEW_API_URL`          | unchanged                               | unchanged                                                                       |

`extensionEnvSchema.shape` has exactly these three keys. No key name matches
`/SERVICE|SECRET|JWT|ANON/`.

## Behavior (through `loadExtensionEnv` / `parseEnv`)

| Input for `WXT_SUPABASE_PUBLISHABLE_KEY`                        | Result                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| local key from `supabase status` (`sb_publishable_…`, 46 chars) | accepted, returned unchanged                              |
| legacy JWT (`eyJ…`)                                             | `invalid`, expected text above                            |
| `sb_secret_…`                                                   | `invalid`, expected text above                            |
| `replace-with-local-publishable-key` (placeholder)              | `invalid`                                                 |
| `sb_publishable_short` (< 20 after prefix)                      | `invalid`                                                 |
| absent (e.g. old `.env` with only `WXT_SUPABASE_ANON_KEY`)      | `missing`; message ends with the `.env.example` copy hint |

Error messages and `JSON.stringify(error)` never contain the rejected value (existing sentinel
test, kept).

Validation runs where it runs today: `wxt.config.ts` for `wxt` / `wxt build` / `wxt zip`, and
`src/lib/env.ts` in the bundle.

## `.env.example`

```text
# Publishable key (sb_publishable_…) from `pnpm exec supabase status`. pnpm dev fills this in.
# Never a secret key, service-role key or legacy anon JWT. (Replaces WXT_SUPABASE_ANON_KEY.)
WXT_SUPABASE_PUBLISHABLE_KEY=replace-with-local-publishable-key
```

The placeholder matches the existing gitleaks allowlist (`replace-with-[a-z0-9-]+`).
