# MarkMe: Delivery Plan

| | |
| --- | --- |
| Owner | Mostafa |
| Status | Draft v1.0 |
| Date | 2026-10-17 |
| Input | [PRD.md](PRD.md) (approved) |

## 1. How we work

- Each milestone below is **one Spec Kit feature**: `/specify` -> `/clarify` -> `/plan` -> `/tasks` -> `/implement`.
- Claude (PM) writes the `/specify` input for each milestone; Mostafa runs it on his machine with Claude Code + Cursor, delegation and review skills.
- One branch per milestone. Each Spec Kit task gets one commit and one PR into the milestone branch, with CI green. The milestone branch merges to `main` only when its exit criteria pass in CI.
- UI milestones use the **frontend-design** and **impeccable** skills.
- Milestones run in order; a milestone starts only after its dependencies are merged.
- Before the first milestone: run `/constitution` once with the PRD's architecture rules (section 4) and non-functional requirements (section 11).

## 2. v1 milestones (Chrome extension)

| # | Milestone (Spec Kit feature) | Depends on | Covers |
| --- | --- | --- | --- |
| M0 | Monorepo foundation | – | Setup, CI |
| M1 | Database schema + RLS | M0 | Domain model, US-3 data side, 7.4 |
| M2 | Domain package | M0 | URL normalization, schemas, media types |
| M3 | Preview API | M1, M2 | 7.3, D2, D4 |
| M4 | Extension shell + auth | M1, M2 | US-1, US-1b, US-2, US-3 |
| M5 | Save flow + previews | M3, M4 | US-4, US-5, US-6, US-8, US-9, US-10, D3 |
| M6 | Library + search | M5 | US-11, US-12, US-13, US-14, D5 |
| M7 | Folders + tags management | M6 | US-15, US-16 |
| M8 | Hardening + release | M7 | US-7 (optional), E2E, perf, a11y, README, deploy |

M2 can run in parallel with M1. M3 and M4 can run in parallel.

### M0. Monorepo foundation
- pnpm + Turborepo; `apps/{extension,preview-api}`, `packages/{database,domain,config}` (web/mobile folders created later).
- `packages/config`: strict tsconfig, ESLint, Prettier.
- Supabase CLI project (`supabase init`), Docker for local stack.
- GitHub Actions: install, lint, typecheck, test on every PR, with Turborepo cache.
- `pnpm dev` starts Supabase + preview API + extension dev build.
- **Exit:** fresh clone -> one command runs everything; CI green on an empty test.

### M1. Database schema + RLS
- Migrations for `profiles`, `items`, `folders`, `tags`, `item_tags` (PRD section 6).
- `user_id default auth.uid()`; unique `(user_id, normalized_url)`, case-insensitive unique folder/tag names.
- Profile auto-created on sign-up (trigger).
- `search_vector` over title, description, note, URL; tag names folded in (trigger or search function); GIN index.
- Search RPC: text + folder + tags filters, relevance ranking, pagination.
- Folder delete sets `folder_id = null`; tag delete cascades `item_tags`.
- RLS on all tables; `item_tags` checks ownership of item and tag.
- Generated types exported from `packages/database`.
- **Tests (pgTAP):** two users, read/write/cross-user denial per table, uniqueness, FTS ranking.
- **Exit:** all policy tests pass in CI.

### M2. Domain package
- URL normalization (lowercase scheme/host, strip fragment, default ports, `utm_*`/`fbclid`/`gclid`, trailing slash).
- zod schemas: item create/update, folder, tag, note (max 1,000), preview response.
- Media-type detection (article/video/image/post/link).
- Supabase client **factory** taking a storage adapter (no shared instance).
- **Exit:** unit tests with edge-case tables; 100% of normalization rules covered.

### M3. Preview API
- Express in Docker; `POST /v1/preview` with Supabase JWT verification.
- Pipeline: validate -> cache -> oEmbed (YouTube, X, Instagram) -> HTML metadata (OG, Twitter Cards, meta) -> sanitize -> cache 24h.
- Full SSRF protections (PRD 7.3): scheme/port, DNS resolve + IP blocklist v4/v6, connect to validated IP, re-check each redirect, 3 redirects, 5 s, 2 MB, content-type allowlist, no cookies, fixed UA.
- Per-user and per-IP rate limits; forced-refresh flag rate-limited.
- `embed_html` only from allowlisted providers, sanitized.
- **Tests:** SSRF suite (private IPs, rebinding, internal redirects), limits, content types, parsing fixtures, oEmbed, rate limits.
- **Exit:** all SSRF cases blocked in CI; image builds; runs locally via `pnpm dev`.

### M4. Extension shell + auth (UI)
- WXT + React MV3; popup, side panel, background worker; minimal permissions (PRD 7.2).
- `chrome.storage` auth adapter shared by all surfaces.
- Email/password sign up and sign in; inline validation; unconfirmed-email banner with resend.
- Google sign-in via `chrome.identity.launchWebAuthFlow`; account linking verified.
- Sign out clears storage; session survives browser restart; token refresh in background.
- Design system basics: tokens, light/dark themes, base components (frontend-design + impeccable).
- **Exit:** component tests for auth forms; manual check of Google flow and restart persistence.

### M5. Save flow + previews (UI)
- Popup: save active tab in one click; paste URL; pick folder, tags (create on the fly), note.
- Duplicate check via normalized URL -> open existing item with "Already saved".
- Item inserted as `pending`, preview requested, item updated to `ok`/`failed`.
- Preview card: title, description, thumbnail, site, type, oEmbed data.
- Placeholder per `media_type` + favicon for pending, failed and broken thumbnails.
- Refresh button.
- **Exit:** component tests for save flow; save never blocked by preview failure; popup ready < 300 ms.

### M6. Library + search (UI)
- Side panel: newest-first list, infinite scroll 20/page.
- Filter by folder and multiple tags; text search combined with filters (M1 RPC).
- Item detail: open link, edit title and note, change folder, edit tags, delete with confirm.
- Loading, empty, error states.
- **Exit:** component tests; search < 500 ms on 10k seeded items.

### M7. Folders + tags management (UI)
- Create, rename, delete folders (items move to "no folder").
- Rename and delete tags (removed from items).
- Cache invalidation across popup and side panel after changes.
- **Exit:** component tests for each action.

### M8. Hardening + release
- Context menu "Save to MarkMe" for page, link, image (optional US-7).
- Playwright E2E smoke: sign in -> save -> search.
- Accessibility pass (keyboard, WCAG AA contrast) and perf check.
- Deploy: Supabase Cloud project, preview API on Cloud Run, extension production build (pointing to cloud URLs).
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

## 4. Risks to watch during v1

| Risk | Where | Mitigation |
| --- | --- | --- |
| Google OAuth in extensions is fiddly (redirect URLs, account linking) | M4 | Spike it first in M4; verify linking with a test account |
| SSRF gaps | M3 | Test suite written before the fetcher |
| FTS with tags is tricky to keep in sync | M1 | Decide trigger vs. search-time join in M1 plan; test ranking |
| Extension popup speed | M5 | Measure early; keep popup bundle small |

## 5. Next step
Write the `/specify` input for **M0 Monorepo foundation**, then each milestone in order.
