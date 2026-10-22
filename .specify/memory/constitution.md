<!--
Sync Impact Report (1.1.3, 2026-10-22)
- Version change: 1.1.2 → 1.1.3 (PATCH, approved by Mostafa)
- Development Workflow: "one commit and one PR per task" replaced by one commit per task and one
  PR per user story (a group of connected tasks) into the milestone branch. Reason: the M1 trial
  (specs/002-m1-database-schema/plan.md, Complexity Tracking) is adopted as the rule (decision
  A36). CLAUDE.md, docs/PLAN.md §1 and docs/IMPLEMENTATION_PLAN.md §1.5 changed in the same change.
- Templates: plan-template.md and tasks-template.md name no PR rule; unchanged.
- Principles: unchanged.

Sync Impact Report (1.1.2, 2026-10-20)
- Version change: 1.1.1 → 1.1.2 (PATCH, approved by Mostafa)
- Security principle: "allowlisted `embed_html`" replaced by embeds stored as provider + validated
  id, never HTML. Reason: decision A19 (M1 design review); PRD §6 changed in the same change.
- Principles: unchanged in substance.

Sync Impact Report (1.1.1, 2026-10-18)
- Version change: 1.1.0 → 1.1.1 (PATCH, approved by Mostafa)
- Technology Constraints, Auth: "users may use the app before confirming email" replaced by
  "confirm email before first password sign-in". Reason: Supabase's password grant rejects
  unconfirmed emails (spike S0 Q3). PRD US-1 changed in the same change (decision A7).
- Principles: unchanged.

Sync Impact Report (1.1.0)
- Version change: template (unversioned) → 1.1.0
  (version supplied by Mostafa; first written constitution in this repo)
- Principles defined:
  - [PRINCIPLE_1_NAME] → I. Security by Default (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Shared Contracts, Separate Clients
  - [PRINCIPLE_3_NAME] → III. Test the Critical Paths
  - [PRINCIPLE_4_NAME] → IV. Simple First
  - [PRINCIPLE_5_NAME] → V. Reliable Sync and Data Integrity
  - added → VI. Quality UX
- Added sections: preamble (scope + source documents), Technology Constraints,
  Development Workflow
- Removed sections: none
- Follow-up TODOs:
  - CLAUDE.md does not exist yet; Governance names it as the runtime guidance file.
    Create it so it does not contradict this document.
-->

# MarkMe Constitution

MarkMe saves web content by link, with previews, folders, tags and search, synced across every
device a user signs in on. Delivered as v1 Chrome extension, v2 web app, v3 mobile app. Source
documents: `docs/PRD.md` (requirements) and `docs/PLAN.md` (milestones). When this constitution
and a spec disagree, this constitution wins until amended.

## Core Principles

### I. Security by Default (NON-NEGOTIABLE)

- Row Level Security is enabled on every user-data table (`profiles`, `items`, `folders`, `tags`,
  `item_tags`, and any future one). A table without RLS policies does not merge.
- Ownership always comes from the authenticated user (`auth.uid()` in the DB, the verified JWT in
  the API). Never trust a submitted user id. `user_id` defaults to `auth.uid()`.
- Every RLS policy is tested with at least two users: read, write, and cross-user denial.
- Clients never fetch arbitrary pages. All preview fetching goes through `apps/preview-api`, which
  enforces the full SSRF rules in PRD 7.3: http/https on ports 80/443 only; DNS resolution with
  private, loopback, link-local, CGNAT, multicast and metadata ranges blocked (IPv4 and IPv6);
  connect to the validated IP; re-validate every redirect; max 3 redirects, 5 s, 2 MB;
  content-type allowlist; no cookies; fixed User-Agent; per-user and per-IP rate limits; sanitized
  output; embeds only from allowlisted providers, stored as provider + validated id, never HTML.
- SSRF tests are written before the fetcher.
- Secrets live only in env files and the host's secret store. The service-role key never reaches
  a client bundle. No secrets in git.

### II. Shared Contracts, Separate Clients

- `packages/database` owns migrations and generated Supabase types. `packages/domain` owns models,
  zod schemas, URL normalization, media-type detection and business rules. `packages/config` owns
  tsconfig, ESLint and Prettier.
- Apps share types, schemas and the Supabase client **factory**. Never share one initialized
  Supabase client; each app passes its own auth-storage adapter (`chrome.storage`, SSR cookies,
  Expo SecureStore).
- Platform UI and platform behavior stay inside their app. Business rules never live in an app if
  another app needs them.
- Schema changes only through migrations; regenerate types after every migration.

### III. Test the Critical Paths

- Required tests per area (PRD 7.5): domain unit tests (normalization edge-case tables, schemas,
  media types); pgTAP for RLS, uniqueness and FTS ranking; preview API SSRF, limits, parsing
  fixtures, oEmbed and rate limits; component tests for UI flows; Playwright E2E smoke for sign
  in, save, search.
- Bug fixes start with a failing test that reproduces the bug.
- Never skip, disable or weaken a test to get CI green.

### IV. Simple First

- Plain queries plus cache invalidation first. Realtime only where it clearly helps (v2 item list).
- No microservices beyond the preview API. No new dependency, service or abstraction without a
  stated reason in the plan.
- Build only what the current version's scope needs (YAGNI). Non-goals in PRD section 2 stay out.

### V. Reliable Sync and Data Integrity

- One user's collection is the same on every signed-in device; the database is the source of
  truth.
- Saving never blocks on a preview: the item is inserted as `pending`, then updated to `ok` or
  `failed`.
- No duplicate URLs per user: unique `(user_id, normalized_url)` using the shared normalizer.
- Deleting a folder moves items to "no folder"; deleting a tag removes it from items. Nothing
  deletes items implicitly.
- From v2: offline edits queue locally; last write wins per field by `updated_at`; delete wins
  over edit.

### VI. Quality UX

- UI work uses the **frontend-design** and **impeccable** skills.
- Every screen defines loading, empty, error and (for previews) pending/failed states, with the
  per-type placeholder plus favicon fallback.
- WCAG AA contrast, full keyboard navigation, light and dark themes.
- Performance budgets: popup ready < 300 ms; first list page < 1 s; search < 500 ms on 10k items.

## Technology Constraints

- pnpm + Turborepo monorepo; TypeScript everywhere in strict mode.
- Layout: `apps/{extension,web,mobile,preview-api}`, `packages/{database,domain,config}`.
- Extension: WXT + React (Vite, Manifest V3), minimal permissions (`activeTab`, `identity`,
  `storage`, `contextMenus`, `sidePanel`, host permissions only for the preview API and Supabase).
- Web (v2): Next.js on Cloudflare Workers via `@opennextjs/cloudflare`. Mobile (v3): React
  Native + Expo.
- Preview API: Express.js in Docker, deployed to Google Cloud Run.
- Data and auth: Supabase (Postgres, Auth, Realtime). Supabase Cloud free plan in production;
  Supabase CLI + Docker locally.
- Auth: email + password and Google sign-in (extension uses `chrome.identity.launchWebAuthFlow`);
  users confirm their email before their first password sign-in (Supabase does not allow
  unconfirmed password sign-in; spike S0 Q3).
- Search: PostgreSQL full-text search over title, description, note, URL and tag names.
- Stay within free tiers; any paid service needs Mostafa's approval.

## Development Workflow

- Versions ship in order (v1, v2, v3). Each is finished and validated before the next starts.
- Each milestone in `docs/PLAN.md` is one Spec Kit feature: `/specify` -> `/clarify` -> `/plan`
  -> `/tasks` -> `/implement`. One branch per milestone; one commit per task; one PR per user
  story (a group of connected tasks) into the milestone branch.
- Every `/plan` includes a Constitution Check against the principles above; any violation is
  listed with its justification or the plan changes.
- Execution runs on Mostafa's machine with Claude Code + Cursor, using the delegation and review
  skills. Every PR gets a review pass before merge.
- CI (GitHub Actions) runs lint, typecheck and tests on every PR. Merge only when CI is green and
  the milestone's exit criteria pass.
- One-command local setup (`pnpm dev`) must keep working after every merge.
- Each task's commit has a clear message. Update README and docs when behavior or setup changes.

## Governance

- This constitution supersedes other practices. Specs, plans and tasks must comply.
- Amendments: proposed in writing with the reason and impact, approved by Mostafa, then the
  version below is bumped (MAJOR: principle removed or redefined; MINOR: principle or section
  added; PATCH: wording). Dependent templates and docs are updated in the same change.
- Reviews check compliance; unjustified complexity is rejected.
- Runtime guidance for agents lives in `CLAUDE.md`, which must not contradict this document.

**Version**: 1.1.3 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-22
