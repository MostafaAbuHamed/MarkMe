# MarkMe: Delivery Plan

|        |                                                                                        |
| ------ | -------------------------------------------------------------------------------------- |
| Owner  | Mostafa                                                                                |
| Status | Draft v1.5                                                                             |
| Date   | 2026-10-17                                                                             |
| Input  | [PRD.md](PRD.md) (approved), [constitution](../.specify/memory/constitution.md) v1.1.1 |
| Detail | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): technical design per milestone       |

## 1. How we work

- Each milestone below is **one Spec Kit feature**: `/speckit-specify` -> `/speckit-clarify` -> `/speckit-plan` -> `/speckit-tasks` -> `/speckit-analyze` -> `/speckit-implement`.
- Claude (PM) writes the `/speckit-specify` input for each milestone; Mostafa runs it on his machine with Claude Code + Cursor, delegation and review skills.
- One branch per milestone. Each Spec Kit task gets one commit; each user story (a group of connected tasks) gets one PR into the milestone branch, with CI green. The milestone branch merges to `main` only when its exit criteria pass in CI.
- UI milestones use the **frontend-design** and **impeccable** skills.
- Milestones run in order; a milestone starts only after its dependencies are merged.
- The constitution (v1.1.1) is ratified and binding. Change it only through its Governance section.

### Definition of done (every milestone)

Each milestone's exit criteria below come on top of these:

- CI green: lint, typecheck, tests (including DB tests once M1 lands).
- `/speckit-plan` contains a Constitution Check; violations are justified or the plan changed.
- Every PR had a review pass before merge.
- Generated DB types are current (CI drift check passes).
- `pnpm dev` works from a fresh clone.
- README and docs updated if setup or behavior changed; this plan updated if scope moved.
- UI milestones: the milestone's flows work by keyboard alone, and automated axe checks pass in component tests.

## 2. v1 milestones (Chrome extension)

| #   | Milestone (Spec Kit feature) | Depends on | Covers                                                  |
| --- | ---------------------------- | ---------- | ------------------------------------------------------- |
| M0  | Monorepo foundation          | –          | Setup, CI, secrets hygiene                              |
| M1  | Database schema + RLS        | M0         | Domain model (PRD 6), D1, D3, D5, 7.4                   |
| M2  | Domain package               | M0, M1     | URL normalization, schemas, media types                 |
| M3  | Preview API                  | M1, M2     | 7.3, D2, D4                                             |
| M4  | Extension shell + auth       | M1, M2     | US-1, US-1b, US-2, US-3                                 |
| M5  | Save flow + previews         | M3, M4     | US-4, US-5, US-6, US-8, US-9, US-10, D3                 |
| M6  | Library + search             | M5         | US-11, US-12, US-13, US-14, D5                          |
| M7  | Folders + tags management    | M6         | US-15, US-16                                            |
| M8  | Hardening + release          | M7         | US-7 (optional), E2E, perf, a11y audit, README, release |

M3 and M4 can run in parallel. M2 uses M1's generated types and enums, so it starts after M1.

**Spike before the M4 spec (can run during M1/M2):** Google sign-in via `launchWebAuthFlow` with a pinned extension ID, account linking against a password account with an _unconfirmed_ email, and Instagram/X oEmbed access. Record the results in the M3 and M4 specs.

### M0. Monorepo foundation

- pnpm + Turborepo; `apps/{extension,preview-api}`, `packages/{database,domain,config}` (web/mobile folders created later).
- `packages/config`: strict tsconfig, ESLint, Prettier.
- Supabase CLI project (`supabase init`), Docker for local stack.
- GitHub Actions: install, lint, typecheck, test on every PR, with Turborepo cache.
- CI job that runs `supabase start` and pgTAP (one empty test for now), so M1 policy tests run in CI.
- Secrets: `.env.example` per app, env files git-ignored, env validated with zod at startup, secret scanning in CI.
- `pnpm dev` starts Supabase + preview API + extension dev build.
- **Exit:** fresh clone -> one command runs everything; CI green on an empty unit test and an empty pgTAP test.

### M1. Database schema + RLS

- Migrations for `profiles`, `items`, `folders`, `tags`, `item_tags` (PRD section 6).
- `user_id default auth.uid()`; unique `(user_id, normalized_url)`, case-insensitive unique folder/tag names.
- Profile auto-created on sign-up (trigger).
- `search_vector` over title, description, note, URL; tag names folded in (trigger or search function); GIN index.
- Search RPC: text (word-prefix matching) + folder / no-folder + tags filters, relevance ranking, pagination.
- Folder delete sets `folder_id = null`; tag delete cascades `item_tags`.
- RLS on all tables; `item_tags` checks ownership of item and tag. Column-level insert/update allowlists; a saved URL is immutable.
- Generated types exported from `packages/database`; CI fails if they drift from the migrations.
- Supabase Cloud project created; migrations pushed to it (manual step or CI job, decided in the M1 plan).
- **Tests (pgTAP):** two users, read/write/cross-user denial per table, uniqueness, FTS ranking.
- **Exit:** all policy tests pass in CI; migrations applied to the cloud project.

### M2. Domain package

- URL normalization (lowercase scheme/host, strip fragment, default ports, `utm_*`/`fbclid`/`gclid`, trailing slash).
- zod schemas: item create/update, folder, tag, note (max 1,000), preview response.
- Media-type detection (article/video/image/post/link).
- Supabase client **factory** taking a storage adapter (no shared instance).
- **Exit:** unit tests with edge-case tables; 100% of normalization rules covered.

### M3. Preview API

- Express in Docker; `POST /v1/preview` with Supabase JWT verification.
- Pipeline: validate -> cache -> oEmbed (YouTube, X, Instagram) -> HTML metadata (OG, Twitter Cards, meta) -> sanitize -> cache 24h.
- Each oEmbed provider is optional: if it is unavailable (e.g. Instagram needs a Meta app token), fall back to HTML metadata.
- Full SSRF protections (PRD 7.3): scheme/port, DNS resolve + IP blocklist v4/v6, connect to validated IP, re-check each redirect, 3 redirects, 5 s, 2 MB, content-type allowlist, no cookies, fixed UA.
- Per-user and per-IP rate limits (IP before auth); forced-refresh flag rate-limited.
- Cache and rate limits are in memory for v1 (per instance, lost on scale-to-zero). The M3 plan records this choice and the Cloud Run max-instances setting.
- Embeds only from allowlisted providers, returned as provider + validated id, never HTML.
- Deployed to Cloud Run (`europe-west1`) from CI (walking skeleton), with secrets in the host's secret store; a manual dispatch deploys from the milestone branch for the exit check.
- **Tests (written before the fetcher):** SSRF suite (private IPs, rebinding, internal redirects), limits, content types, parsing fixtures, oEmbed, rate limits.
- **Exit:** all SSRF cases blocked in CI; image builds; runs locally via `pnpm dev`; deployed endpoint answers with a valid JWT and rejects SSRF cases.

### M4. Extension shell + auth (UI)

- WXT + React MV3; popup, side panel, background worker; minimal permissions (PRD 7.2).
- Pinned manifest `key`, so every build (dev and release, any machine) has the same extension ID and OAuth redirect URL.
- `chrome.storage` auth adapter shared by all surfaces.
- Email/password sign up and sign in; inline validation; unconfirmed-email banner with resend.
- Google sign-in via `chrome.identity.launchWebAuthFlow`; account linking behaves as decided after the spike.
- Sign out clears storage; session survives browser restart; token refresh in background.
- Design system basics: tokens, light/dark themes, base components (frontend-design + impeccable).
- Playwright harness for the extension, with a sign-in smoke test.
- **Exit:** component tests for auth forms; E2E sign-in smoke passes in CI; manual check of Google flow and restart persistence.

### M5. Save flow + previews (UI)

- Popup: save active tab in one click; paste URL; pick folder, tags (create on the fly), note.
- Duplicate check via normalized URL -> open existing item with "Already saved".
- Item inserted as `pending`; the **background worker** requests the preview and updates the item to `ok`/`failed`, so closing the popup does not interrupt it.
- On library load, `pending` items older than a few minutes are retried.
- Preview card: title, description, thumbnail, site, type, oEmbed data.
- Placeholder per `media_type` + favicon for pending, failed and broken thumbnails.
- Refresh button.
- **Exit:** component tests for save flow; E2E extended to save; save never blocked by preview failure; closing the popup right after save still ends in `ok`/`failed`; popup ready < 300 ms (median of 10 runs, from popup open to save button enabled).

### M6. Library + search (UI)

- Side panel: newest-first list, infinite scroll 20/page.
- Filter by folder and multiple tags; text search combined with filters (M1 RPC).
- Item detail: open link, edit title and note, change folder, edit tags, delete with confirm.
- Loading, empty, error states.
- Seed script for 10k items.
- **Exit:** component tests; E2E extended to search; first list page < 1 s; search RPC < 500 ms on 10k seeded items (timed script, median of 10 runs).

### M7. Folders + tags management (UI)

- Create, rename, delete folders (items move to "no folder").
- Rename and delete tags (removed from items).
- Cache invalidation across popup and side panel after changes.
- **Exit:** component tests for each action.

### M8. Hardening + release

- Context menu "Save to MarkMe" for page, link, image (optional US-7).
- Playwright E2E smoke finalized: sign in -> save -> search.
- Final accessibility audit (keyboard, WCAG AA contrast) and perf check against PRD 11 budgets.
- Production config: extension build pointing to the Supabase Cloud project and Cloud Run URL; verify the service-role key is absent from the extension bundle.
- Release: production build zipped as a GitHub release, with load-unpacked install steps in the README. Chrome Web Store publishing is out of scope for v1.
- README: setup, architecture diagram, screenshots.
- **Exit:** PRD 7.7 definition of done met.

## 3. Roadmap after v1

### v2: Web app (start after v1 is validated)

1. Next.js app shell + SSR auth (cookie client), deployed to Cloudflare Workers via OpenNext.
2. Library parity with the side panel + bulk actions (move, tag, delete).
3. Realtime item-list updates across devices (Supabase Realtime on `items`).
4. Offline editing + sync (last write wins per field, delete wins), web and extension.
5. "Open in web app" link in the extension; E2E for core flows.

### v3: Mobile app

1. Expo app shell + SecureStore auth adapter.
2. Browse, search, organize.
3. Share-sheet save (iOS + Android).
4. Read cache + offline behavior (reuses v2 sync model), documented in its spec.

### Later

- Public sharing of items and collections.
- Provider-aware URL merging for duplicates (`youtu.be/ID` = `youtube.com/watch?v=ID`, `twitter.com` = `x.com`, `m.` hosts); not in v1 (IMPLEMENTATION_PLAN A24).

## 4. Risks to watch during v1

| Risk                                                                                                               | Where  | Mitigation                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------- |
| Google OAuth in extensions is fiddly (redirect URLs, extension ID)                                                 | M4     | Spike before the M4 spec; pin the manifest `key`                           |
| Google sign-in vs. a password account with an unconfirmed email may not link (or may drop the unverified identity) | M4     | Test in the spike; record the chosen behavior in the M4 spec               |
| SSRF gaps                                                                                                          | M3     | Test suite written before the fetcher                                      |
| Instagram oEmbed needs a Meta app token; X oEmbed terms can change                                                 | M3     | Check access in the spike; every provider falls back to HTML metadata      |
| In-memory cache and rate limits reset on Cloud Run scale-to-zero and are per instance                              | M3     | Accepted for v1; record in the M3 plan; cap max instances                  |
| FTS with tags is tricky to keep in sync                                                                            | M1     | Decide trigger vs. search-time join in M1 plan; test ranking               |
| MV3 popup closes on blur, leaving items stuck at `pending`                                                         | M5     | Preview request runs in the background worker; retry stale `pending` items |
| Extension popup speed                                                                                              | M5     | Measure early; keep popup bundle small                                     |
| Production-only problems found late (CORS, auth redirect URLs, cold starts)                                        | M1, M3 | Cloud project in M1, Cloud Run deploy in M3                                |
| Supabase free tier pauses inactive projects, so the demo may be down                                               | M8     | Document how to resume it in the README                                    |

## 5. Next step

Run the OAuth/oEmbed spike, and write the `/speckit-specify` input for **M0 Monorepo foundation**, then each milestone in order.

## Changelog

- v1.5 (2026-10-23): M3 bullets updated for the M3 design review (IMPLEMENTATION_PLAN §4 A37–A50).
- v1.4 (2026-10-22): one PR per user story (IMPLEMENTATION_PLAN A36); provider-aware URL merging added to Later (A24); M2 depends on M0 + M1.
- v1.3 (2026-10-20): M1 and M3 bullets updated for the M1 design review (IMPLEMENTATION_PLAN §4 A13–A20).
- v1.2 (2026-10-17): linked IMPLEMENTATION_PLAN.md (technical design, tasks, spike S0 steps).
- v1.1 (2026-10-17): fixed M1 coverage; added common definition of done, secrets and DB-test CI to M0, early cloud deploys (M1, M3), pre-M4 spike, background-worker preview flow, pinned extension ID, earlier E2E and a11y checks, measurable perf exits, unpacked-only release, new risks.
- v1.0 (2026-10-17): first draft.
