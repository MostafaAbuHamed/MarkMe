# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

M0 (monorepo foundation) is implemented: `apps/extension` (WXT popup placeholder),
`apps/preview-api` (only `GET /healthz`), `packages/config`, `packages/domain`, `packages/database`.

M1 (database schema) is implemented, data layer only: tables `profiles`, `folders`, `tags`,
`items`, `item_tags` with RLS and column-level grants, plus the `search_items` RPC. Internal
functions (triggers, search-vector helpers) live in the `private` schema, closed to `anon` and
`authenticated`. `@markme/database` exports the generated types plus `SearchItemRow`. No app uses
them yet.

M2 (domain package) is implemented. `@markme/domain` exports the URL rules (`normalizeUrl`,
`parseUserUrl`, `detectProvider`, `extractYouTubeId`, `YOUTUBE_ID_PATTERN`), `detectMediaType`,
`LIMITS` and the zod schemas (item, folder/tag names, preview request/response/error, enums
built from `@markme/database` `Constants`). The Supabase client factory `createMarkMeClient`
is only at `@markme/domain/client`; a lint rule keeps `supabase-js` out of the rules entry.
The domain `test` script runs coverage and fails below 100% lines/branches on `src/url/**`
(the text table hides fully covered files); focused runs:
`pnpm --filter @markme/domain exec vitest run <file>`. No app uses the exports yet.

Hosted Supabase project `markme` (free, `eu-central-1`) runs the same migrations. `pnpm db:push` is
the manual production step after a migration PR merges (needs `supabase link` once; the ref lives in
git-ignored `packages/database/supabase/.temp/`); never in CI.

Toolchain: Node 24 (`.nvmrc`; non-interactive shells may need `source ~/.nvm/nvm.sh && nvm use`),
pnpm 12.14.0 via corepack, TypeScript 6.0 (not 7 — typescript-eslint supports <6.1), ESLint 9
(jsx-a11y supports ≤9), zod 4, Vitest 5, Supabase CLI as a pinned dev dependency (`pnpm exec
supabase ...`, no global install).

Commands (repo root): `pnpm dev`, `pnpm lint`, `pnpm format:check` / `pnpm format`, `pnpm typecheck`,
`pnpm test`, `pnpm build`, `pnpm db:start`, `pnpm db:stop`, `pnpm db:reset`, `pnpm db:test`,
`pnpm db:types`, `pnpm db:new`, `pnpm db:push`. `pnpm dev` starts local Supabase (CLI + Docker), the preview API and
the extension dev build; it must keep working after every merge. `pnpm build` and the extension dev
build need `apps/extension/.env`; `pnpm dev` creates `.env` for both apps from `.env.example`, filled
from `supabase status` (an existing `.env` is never overwritten); unit tests and typecheck need no
`.env`. Local ports: preview API 8787, Supabase API 54321, Studio 54323, Mailpit 54324.

CI: five required checks on every PR — lint (also runs `format:check`), typecheck, test, db, secrets; ruleset `ci-gate` blocks
merges to `main` and `NNN-*` milestone branches unless all are green. After a migration run
`pnpm db:types` and commit the result (CI fails on drift).

Config: every app validates env via `parseEnv` from `@markme/domain`; the extension schema is locked
to three public keys by a test.

Dev browser (opt-in): `wxt.config.ts` keeps `webExt.disabled = true`; a gitignored
`apps/extension/web-ext.config.ts` (see README) turns the launch on per machine. On Mostafa's machine
it opens Brave (`/usr/bin/brave-browser`; no Google Chrome installed) with
`--remote-debugging-port=9222`. To check UI yourself, run `pnpm dev` in `apps/extension`, read the
extension id from the service-worker URL in `http://127.0.0.1:9222/json/list`, open
`chrome-extension://<id>/popup.html` via `PUT /json/new?<url>`, and use CDP (`Page.captureScreenshot`,
`Runtime.evaluate`, console events). The id changes per launch until the key is pinned (M4-T1). The
DevTools MCP plugin launches its own Chrome, so it does not work here as configured.

## Source documents (read before non-trivial work)

- `.specify/memory/constitution.md` — binding rules. Wins over any spec, plan or this file.
- `docs/PRD.md` — requirements, domain model (section 6), SSRF rules (7.3), required tests (7.5).
- `docs/PLAN.md` — milestones M0–M8 for v1, their dependencies and exit criteria.
- `docs/IMPLEMENTATION_PLAN.md` — technical design, tasks and tests per v1 milestone; spike S0;
  open decisions needing approval (§4).
- `docs/PROJECT_BRIEF.md` — original brief.

## Workflow

- Each milestone in `docs/PLAN.md` is one Spec Kit feature, run in order:
  `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
  Artifacts land in `specs/NNN-<name>/` (e.g. `specs/001-m0-monorepo-foundation/`).
  Spec Kit skills live in `.claude/skills/speckit-*` (mirrored in `.cursor/skills/` and
  `.opencode/commands/`); scripts and templates in `.specify/`.
- One branch per milestone; one commit per Spec Kit task; one PR per user story (a group of
  connected tasks), into the milestone branch.
  The milestone branch merges to `main` only when its exit criteria pass in CI.
- Every `/plan` includes a Constitution Check; violations are justified or the plan changes.
- A milestone starts only after its dependencies are merged (M3 ∥ M4 may run in parallel).
- UI work uses the `frontend-design` and `impeccable` skills.

## Architecture (planned)

pnpm + Turborepo monorepo, strict TypeScript everywhere:

- `apps/extension` — WXT + React, Manifest V3 (v1). Surfaces: popup (quick save), side panel
  (library, search, folder/tag management), background worker (auth refresh, context menu).
- `apps/preview-api` — Express in Docker, Cloud Run. `POST /v1/preview` with the user's Supabase
  JWT. The only place that fetches arbitrary URLs.
- `apps/web` (v2, Next.js on Cloudflare Workers via OpenNext), `apps/mobile` (v3, Expo) — not
  created until their version starts.
- `packages/database` — Supabase migrations and generated types. Regenerate types after every
  migration.
- `packages/domain` — models, zod schemas, URL normalization, media-type detection, business rules,
  and the Supabase client **factory**.
- `packages/config` — shared tsconfig, ESLint, Prettier.

Cross-cutting design points that span several packages:

- **No shared Supabase client instance.** Each app builds its own from the factory with its own
  auth-storage adapter (`chrome.storage` in the extension, shared by popup, side panel and
  background; SSR cookies on web; SecureStore on mobile).
- **Save flow never blocks on previews:** insert item as `preview_status = pending`, call the
  preview API, then update to `ok` or `failed`. The client writes the preview result to the item.
- **Duplicates:** unique `(user_id, normalized_url)`; the normalizer in `packages/domain` is the
  single implementation. Re-saving opens the existing item.
- **Ownership:** `user_id default auth.uid()` plus RLS on every user-data table; `item_tags`
  policies check ownership of both item and tag. Never accept a user id from the client.
- **Search:** Postgres FTS (`search_vector` + GIN) over title, description, note, URL and tag
  names, exposed as a search RPC with folder/tag filters, ranking and pagination.
- **Deletes:** deleting a folder sets `folder_id = null`; deleting a tag cascades `item_tags`.
  Nothing deletes items implicitly.
- No Realtime in v1 — plain queries plus cache invalidation across popup and side panel.

## Testing rules that affect how code is written

- SSRF tests are written before the preview fetcher.
- RLS policies get pgTAP tests with at least two users (read, write, cross-user denial).
- Bug fixes start with a failing test. Never skip or weaken a test to make CI green.

## Constraints

- Stay on free tiers; any paid service needs Mostafa's approval.
- No new dependency, service or abstraction without a stated reason in the plan.
- PRD section 2 non-goals stay out of scope (e.g. offline editing in v1, non-Chrome browsers).
