# MarkMe

MarkMe saves web content by link, with previews, folders, tags and search, synced across devices; v1 is a Chrome extension.

Pre-release. Milestone M0 (monorepo foundation).

## Prerequisites

Linux is the supported platform. macOS likely works but is not tested. Native Windows is not supported; use WSL and follow the Linux steps.

| Tool                   | Version                                                                        | Check                 |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------- |
| Node.js                | 24 LTS (`.nvmrc`); use `fnm` or `nvm`                                          | `node -v` → `v24.*`   |
| pnpm                   | 12, pinned by `packageManager` (`pnpm@12.14.0`); enable with `corepack enable` | `pnpm -v` → `12.14.0` |
| Docker Engine          | running                                                                        | `docker info` exits 0 |
| Git                    | any recent                                                                     |                       |
| Chromium-based browser | for loading the unpacked extension                                             |                       |

No global Supabase CLI is needed. It is a pinned dev dependency.

## Setup

```bash
git clone https://github.com/MostafaAbuHamed/MarkMe.git && cd MarkMe
nvm use # or: fnm use
corepack enable
pnpm install
pnpm dev
```

The first run downloads Supabase Docker images and can take several minutes.

`pnpm dev` then prints a `[dev]` summary. On a first run it looks like this:

```text
[dev] node 24.22.0 ✓   docker ✓
[dev] supabase: starting… (first run downloads images, ~5–10 min)
[dev] created apps/preview-api/.env
[dev] created apps/extension/.env
[dev] Supabase API   http://127.0.0.1:54321
[dev] Studio         http://127.0.0.1:54323
[dev] Mailpit        http://127.0.0.1:54324
[dev] Preview API    http://127.0.0.1:8787/healthz
[dev] Extension      load unpacked: apps/extension/.output/chrome-mv3-dev
[dev] Ctrl-C stops the API and extension build; `pnpm db:stop` stops the database.
```

On later runs the database line reads `supabase: already running (reused)` and the config lines read
`found apps/<app>/.env (left unchanged)`. The output of both apps follows, prefixed by their package name.

## Load the extension

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose **Load unpacked**.
4. Select `apps/extension/.output/chrome-mv3-dev` (created once `pnpm dev` is running).

### Optional: let `pnpm dev` open the browser

To have `pnpm dev` launch a browser with the dev build already loaded, create
`apps/extension/web-ext.config.ts`. The file is gitignored because the browser path depends on your
machine:

```ts
import { defineWebExtConfig } from "wxt";

export default defineWebExtConfig({
  disabled: false,
  // Any Chromium-based browser; omit to use the Chrome that chrome-launcher finds.
  binaries: { chrome: "/usr/bin/brave-browser" },
  // Optional: lets local tools (e.g. a coding agent) attach over the DevTools protocol.
  chromiumArgs: ["--remote-debugging-port=9222"],
});
```

The browser opens with a fresh temporary profile, and the extension reloads as you edit. With the
debugging port set, the popup is reachable at `chrome-extension://<id>/popup.html`; the id is in the
extension service worker URL listed by `http://127.0.0.1:9222/json/list`.

## Stopping

Ctrl-C stops the preview API and the extension build. The local database keeps running. `pnpm db:stop` stops the database.

## Local config

`pnpm dev` creates `apps/preview-api/.env` and `apps/extension/.env` from the matching `.env.example` files, and leaves an existing file unchanged.

To refresh stale values (for example after the local database was re-created), delete the file and run `pnpm dev` again.

`.env` files are git-ignored. Commit the `.env.example` files only; never commit keys. The extension only ever gets public values.

## Commands

All commands run from the repo root.

| Command              | Runs                                                                                                                                                            | Notes                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`           | `node scripts/dev.mjs`                                                                                                                                          | Starts the local stack. Must keep working after every merge.                |
| `pnpm build`         | `turbo run build`                                                                                                                                               | Preview API `tsc` to `dist/`; extension `wxt build` to `.output/chrome-mv3` |
| `pnpm lint`          | `turbo run lint lint:root`                                                                                                                                      | ESLint, shared flat config, plus the root config and `scripts`              |
| `pnpm typecheck`     | `turbo run typecheck`                                                                                                                                           | `tsc --noEmit` (extension: `wxt prepare && tsc --noEmit`)                   |
| `pnpm test`          | `turbo run test && vitest run --dir scripts`                                                                                                                    | Package tests, then the `scripts` tests                                     |
| `pnpm format`        | `prettier --write .`                                                                                                                                            |                                                                             |
| `pnpm format:check`  | `prettier --check .`                                                                                                                                            | Used by the `lint` CI job                                                   |
| `pnpm db:start`      | `supabase start --workdir packages/database -x imgproxy,edge-runtime,logflare,vector,supavisor`                                                                 | Idempotent                                                                  |
| `pnpm db:stop`       | `supabase stop --workdir packages/database`                                                                                                                     | Keeps data volumes                                                          |
| `pnpm db:reset`      | `supabase db reset --workdir packages/database`                                                                                                                 | Re-applies migrations and `seed.sql`                                        |
| `pnpm db:test`       | `supabase test db --workdir packages/database`                                                                                                                  | pgTAP                                                                       |
| `pnpm db:types`      | `supabase gen types typescript --local --workdir packages/database > packages/database/src/types.gen.ts && prettier --write packages/database/src/types.gen.ts` | Committed output; CI checks drift                                           |
| `pnpm db:new <name>` | `supabase migration new --workdir packages/database`                                                                                                            |                                                                             |

`db:push` is not available yet. It is added in M1, when a cloud project exists.

## Repository layout

```text
apps/extension/      Chrome extension (WXT + React, Manifest V3)
apps/preview-api/    Express preview API
packages/config/     Shared TypeScript, ESLint, and Prettier config
packages/database/   Supabase project: config, migrations, seed, generated types
packages/domain/     Shared schemas and domain code
scripts/             Local start script (pnpm dev) and its tests
docs/                Product requirements and plans
specs/               Spec Kit specs (current: 001-m0-monorepo-foundation)
```

## Docs

- [Product requirements](docs/PRD.md)
- [Milestone plan](docs/PLAN.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Constitution](.specify/memory/constitution.md)
