# Contract: Root commands (FR-004)

All commands run from the repo root. They are `scripts` in the root `package.json`.

| Command | Runs | Notes |
| --- | --- | --- |
| `pnpm dev` | `node scripts/dev.mjs` | See the start sequence below. Must keep working after every merge (constitution) |
| `pnpm build` | `turbo run build` | Preview API `tsc` to `dist/`; extension `wxt build` to `.output/chrome-mv3` |
| `pnpm lint` | `turbo run lint` | ESLint, shared flat config |
| `pnpm typecheck` | `turbo run typecheck` | `tsc --noEmit` (extension: `wxt prepare && tsc --noEmit`) |
| `pnpm test` | `turbo run test && vitest run --dir scripts` | `vitest run` per package, then the root `scripts/*.test.mjs` (env-file fill logic) |
| `pnpm format` | `prettier --write .` | |
| `pnpm format:check` | `prettier --check .` | Used by the `lint` CI job |
| `pnpm db:start` | `supabase start --workdir packages/database -x imgproxy,edge-runtime,logflare,vector,supavisor` | Idempotent |
| `pnpm db:stop` | `supabase stop --workdir packages/database` | Keeps data volumes |
| `pnpm db:reset` | `supabase db reset --workdir packages/database` | Re-applies migrations and `seed.sql` |
| `pnpm db:test` | `supabase test db --workdir packages/database` | pgTAP |
| `pnpm db:types` | `supabase gen types typescript --local --workdir packages/database > packages/database/src/types.gen.ts && prettier --write packages/database/src/types.gen.ts` | Committed output; CI checks drift |
| `pnpm db:new <name>` | `supabase migration new --workdir packages/database` | |

`db:push` (cloud) is added in M1, when a cloud project exists (§1.3, A11).

## `pnpm dev` start sequence and output

Each line is prefixed with `[dev]`. Failures print one actionable line and exit 1, with no stack
trace.

```text
[dev] node 24.22.0 ✓   docker ✓
[dev] supabase: already running (reused)          | or: starting… (first run downloads images, ~5–10 min)
[dev] created apps/preview-api/.env                | or: found apps/preview-api/.env (left unchanged)
[dev] created apps/extension/.env                  | or: found apps/extension/.env (left unchanged)
[dev] Supabase API   http://127.0.0.1:54321
[dev] Studio         http://127.0.0.1:54323
[dev] Mailpit        http://127.0.0.1:54324
[dev] Preview API    http://127.0.0.1:8787/healthz
[dev] Extension      load unpacked: apps/extension/.output/chrome-mv3-dev
[dev] Ctrl-C stops the API and extension build; `pnpm db:stop` stops the database.
@markme/preview-api:dev: preview-api listening on http://127.0.0.1:8787
@markme/extension:dev: …WXT output…
```

| Failure | Message (exit 1) |
| --- | --- |
| wrong Node | `[dev] Node 24 is required (found 26.11.1). Run \`fnm use\` or \`nvm use\` (reads .nvmrc).` |
| Docker down or missing | `[dev] Docker is not running or not installed. Start it (e.g. \`sudo systemctl start docker\`) and run pnpm dev again.` |
| Supabase start fails | the CLI's own output (it names the busy port), then `[dev] supabase failed to start, see above.` |
| API port busy | `@markme/preview-api:dev: preview-api: port 8787 is already in use` |
| invalid `.env` | the `EnvError` message from [env-helper.md](env-helper.md), prefixed by the Turbo task name |
