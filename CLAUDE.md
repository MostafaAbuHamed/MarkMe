# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The repo is pre-code: only planning docs and Spec Kit scaffolding exist. No `package.json`, build,
lint or test tooling yet. The first milestone (M0, monorepo foundation) creates them. Update this
file with the real commands once M0 lands.

The only command already fixed by the plan: `pnpm dev` starts local Supabase (CLI + Docker), the
preview API and the extension dev build. It must keep working after every merge.

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
  Spec Kit skills live in `.claude/skills/speckit-*` (mirrored in `.cursor/skills/` and
  `.opencode/commands/`); scripts and templates in `.specify/`.
- One branch per milestone; one commit and one PR per Spec Kit task, into the milestone branch.
  The milestone branch merges to `main` only when its exit criteria pass in CI.
- Every `/plan` includes a Constitution Check; violations are justified or the plan changes.
- A milestone starts only after its dependencies are merged (M1 ∥ M2, M3 ∥ M4 may run in parallel).
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
