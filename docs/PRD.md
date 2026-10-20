# MarkMe: Product Requirements Document

|                 |                                                           |
| --------------- | --------------------------------------------------------- |
| Owner           | Mostafa                                                   |
| Status          | Draft v1.1                                                |
| Date            | 2026-10-17                                                |
| Source of truth | Mostafa's project brief + approved decisions (2026-10-17) |

## 1. Overview

MarkMe lets users save web content (images, videos, posts, articles) by link. Each saved item shows a preview and can be organized with folders, tags and search. A user's collection is available on every device where they sign in.

MarkMe is a learning and portfolio project with no financial goal. It is delivered in three versions, each finished and validated before the next starts:

1. **v1:** Chrome extension
2. **v2:** Web application
3. **v3:** Mobile application

## 2. Goals and Non-Goals

### Goals

- Save any web link in one or two actions, with a useful preview.
- Find saved content fast through folders, tags and full-text search.
- Same collection on every signed-in device.
- Showcase a clean, secure, multi-platform TypeScript architecture (portfolio value).

### Non-Goals (initial)

- Offline editing and conflict resolution in v1 (planned for v2)
- Browsers other than Chrome
- Native mobile apps before extension and web are stable
- Recommendations or content classification
- Microservices beyond the preview API

## 3. Users

**Primary persona:** a person who collects links from many sites (tutorials, videos, posts, inspiration) and loses them across bookmarks, chats and tabs. Wants one place to save quickly and find later, on any device.

## 4. Technology Stack

| Area             | Technology                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Monorepo         | pnpm + Turborepo                                                                                   |
| Language         | TypeScript everywhere                                                                              |
| Chrome extension | React + WXT (Vite, Manifest V3)                                                                    |
| Web app          | Next.js                                                                                            |
| Mobile app       | React Native + Expo                                                                                |
| Preview backend  | Express.js in Docker                                                                               |
| Data platform    | Supabase (PostgreSQL, Auth, Realtime)                                                              |
| Local infra      | Supabase CLI + Docker                                                                              |
| Hosting          | Supabase Cloud (free), preview API on Google Cloud Run, web app on Cloudflare Workers via OpenNext |
| UI design        | frontend-design + impeccable skills                                                                |

### Monorepo layout

```text
apps/
  extension/     # WXT + React
  web/           # Next.js (v2)
  mobile/        # Expo (v3)
  preview-api/   # Express
packages/
  database/      # generated Supabase types, migrations
  domain/        # models, validation schemas (zod), business rules
  config/        # shared tsconfig, eslint, prettier
```

### Architecture rules

- Share DB types, domain models, validation schemas and client **factories**. Never share one initialized Supabase client; each app has its own auth-storage adapter.
- Row Level Security on every user-data table.
- Plain queries + cache invalidation first; Realtime only where it clearly helps.
- Platform UI and behavior stay inside each app.
- Clients never fetch arbitrary pages; all preview fetching goes through `preview-api`.

## 5. Product Decisions (approved)

| #   | Topic             | Decision                                                                                                      |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| D1  | Folders           | One folder per item (optional). Tags are many-to-many.                                                        |
| D2  | Previews          | Generic metadata (Open Graph, Twitter Cards, HTML meta) for all sites, plus oEmbed for YouTube, X, Instagram. |
| D3  | Duplicates        | No duplicate URLs per user. Re-saving opens the existing item.                                                |
| D4  | Preview lifecycle | Fetched on save, manual refresh button, stored forever, server cache 24h.                                     |
| D5  | Search            | PostgreSQL full-text search over title, description, URL, tags.                                               |
| D6  | Realtime          | None in v1. v2: live item-list updates across open devices.                                                   |

## 6. Domain Model

| Entity      | Key fields                                                                                                                                                                                                                                                                                                                         | Notes                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `profiles`  | `id` (= auth user id), `display_name`, `created_at`                                                                                                                                                                                                                                                                                | Created on sign-up.                            |
| `items`     | `id`, `user_id`, `url`, `normalized_url`, `title`, `description`, `image_url`, `site_name`, `media_type` (article/video/image/post/link), `embed_provider?` (youtube), `embed_id?`, `favicon_url?`, `folder_id?`, `note?`, `preview_status` (pending/ok/failed), `preview_fetched_at`, `created_at`, `updated_at`, `search_vector` | Unique (`user_id`, `normalized_url`).          |
| `folders`   | `id`, `user_id`, `name`, `created_at`                                                                                                                                                                                                                                                                                              | Unique (`user_id`, lower(`name`)). Flat in v1. |
| `tags`      | `id`, `user_id`, `name`                                                                                                                                                                                                                                                                                                            | Unique (`user_id`, lower(`name`)).             |
| `item_tags` | `item_id`, `tag_id`                                                                                                                                                                                                                                                                                                                | Many-to-many.                                  |

**URL normalization (shared in `packages/domain`):** lowercase scheme and host, strip fragment, strip default ports, strip common tracking params (`utm_*`, `fbclid`, `gclid`), remove trailing slash on path. Used for duplicate detection.

**Deleting a folder** moves its items to "no folder"; it never deletes items. **Deleting a tag** removes it from items.

## 7. v1: Chrome Extension (detailed)

### 7.1 User stories and acceptance criteria

**Auth**

- **US-1 Sign up:** As a new user I can register with email and password.
  - Validation errors shown inline; password min 8 chars.
  - After signing up I am asked to confirm my email; I can sign in once it is confirmed. Supabase does not allow password sign-in with an unconfirmed email (spike S0 Q3).
  - The confirm-email screen, and a sign-in attempt with an unconfirmed email, offer a "Resend email" action.
- **US-1b Google sign-in:** I can sign up or sign in with my Google account in one click.
  - Uses Supabase Google OAuth via `chrome.identity.launchWebAuthFlow` with the extension redirect URL.
  - A Google sign-in with an email that already has a password account links to the same user (no duplicate accounts). If that password account was never confirmed, Supabase drops its password; the user can set one again via password reset.
- **US-2 Sign in / out:** I can sign in and stay signed in across browser restarts; I can sign out, which clears the session from extension storage.
- **US-3 Session storage:** session is kept in `chrome.storage` via a custom Supabase storage adapter, shared by popup, side panel and background worker.

**Saving**

- **US-4 Save current page:** From the popup, one click saves the active tab's URL.
  - Item appears immediately with `preview_status = pending`, then fills in when the preview returns.
  - If the URL already exists (D3), the existing item opens with a "Already saved" notice.
- **US-5 Save pasted URL:** I can paste any http/https URL and save it. Invalid URLs are rejected with a clear message.
- **US-6 Organize on save:** While saving I can pick a folder, add tags (existing or new) and write my own description (optional, max 1,000 chars, stored as `note`, separate from the preview description).
- **US-7 Context menu (nice-to-have):** right-click "Save to MarkMe" on a page, link or image.

**Previews**

- **US-8 Preview display:** Each item shows title, description, thumbnail, site name and type. YouTube/X/Instagram show oEmbed data.
- **US-9 Failed preview:** If fetching fails, the item still saves with the URL and domain as title, and `preview_status = failed`.
  - A static fallback image is shown instead of a thumbnail: one bundled placeholder per `media_type` (article, video, image, post, link), with the site's favicon on top when available. Same fallback is used while the preview is pending (with a loading state) and when a thumbnail URL fails to load.
- **US-10 Refresh:** A refresh button re-fetches the preview (bypassing the item's stored data; server cache still applies for 24h unless forced by a rate-limited flag).

**Browsing and search**

- **US-11 List:** I see my items, newest first, paginated (infinite scroll, 20 per page).
- **US-12 Filter:** I can filter by folder and by one or more tags. With several tags selected, an item must have **all** of them.
- **US-13 Search:** I can search by text; results come from PostgreSQL FTS over title, description, my description (`note`), URL and tag names, ranked by relevance. Search combines with filters.
- **US-14 Item detail:** open the original link, edit title and my description, change folder, edit tags, delete item (with confirm).

**Organization**

- **US-15 Folders:** create, rename, delete folders.
- **US-16 Tags:** create on the fly, rename, delete.

### 7.2 Extension surfaces

- **Popup:** quick save of current tab (folder + tags), sign-in if signed out.
- **Side panel:** full library: list, search, filters, item detail, folder/tag management.
- **Background service worker:** context menu, auth refresh.
- Permissions kept minimal: `activeTab`, `identity`, `storage`, `contextMenus`, `sidePanel`, host permission only for the preview API and Supabase URLs.

### 7.3 Preview API (`apps/preview-api`)

- `POST /v1/preview` with `{ url }` and the user's Supabase JWT (verified server-side). Returns normalized metadata.
- Pipeline: validate URL -> check cache -> oEmbed provider match -> otherwise fetch HTML and parse metadata -> sanitize -> cache 24h -> return.
- The client (or an Edge path later) writes the result to the item; ownership always comes from the JWT, never a submitted user id.

**SSRF protections (mandatory):**

- Only `http`/`https`; ports 80/443 only.
- Resolve DNS and block private, loopback, link-local, CGNAT, multicast and metadata ranges (IPv4 and IPv6).
- Connect to the resolved, validated IP (DNS rebinding guard); re-validate on every redirect.
- Max 3 redirects, 5s total timeout, 2 MB body limit.
- Accept only `text/html` (and image types for direct image links).
- Per-user and per-IP rate limits.
- No cookies or credentials forwarded; fixed User-Agent.
- Sanitize returned strings. Embeds are returned as provider + validated id (allowlisted providers only), never as HTML.

### 7.4 Security

- RLS on `profiles`, `items`, `folders`, `tags`, `item_tags`: users can only select/insert/update/delete rows where `user_id = auth.uid()`; `item_tags` checks ownership of both item and tag.
- `user_id` defaults to `auth.uid()` in the DB; inserts with another id are rejected.
- Policies tested with at least two users (read, write, cross-user denial).
- Secrets only in env files; service-role key never shipped to clients.

### 7.5 Testing (v1 required)

- **Domain:** URL normalization, validation schemas, media-type detection.
- **Database:** RLS policy tests with multiple users (pgTAP or Supabase test helpers), uniqueness constraints, FTS ranking.
- **Preview API:** SSRF blocklist (private IPs, rebinding, redirects to internal), size/time limits, content-type checks, metadata parsing fixtures, oEmbed providers, rate limiting.
- **Extension:** component tests for save flow; one E2E smoke (Playwright) for sign in -> save -> search.
- CI runs lint, typecheck and tests on every PR.

### 7.6 UI/UX

- Designed with the **frontend-design** and **impeccable** skills.
- Fast: popup opens and is ready to save in under 300 ms.
- Clear states: loading, empty, error, preview pending/failed.
- Keyboard accessible; WCAG AA contrast; light and dark themes.

### 7.7 v1 definition of done

- All US-1 to US-16 met (including US-1b Google sign-in) (US-7 optional).
- RLS and SSRF tests pass in CI.
- Runs locally with one command (Supabase CLI + Docker + `pnpm dev`).
- README with setup, architecture diagram and screenshots.

## 8. v2: Web Application

- Next.js app with full collection browsing and management (same features as the side panel, plus bulk actions: move, tag, delete).
- Reuses `packages/domain` and `packages/database`; Next.js-specific Supabase client (SSR cookies).
- Responsive layouts for desktop and mobile browsers.
- **Realtime (D6):** item list updates live across open devices (insert, update, delete) via Supabase Realtime on `items`, scoped by RLS.
- **Offline editing:** users can create, edit and organize items while offline; changes queue locally and sync on reconnect. Conflict rule: last-write-wins per field using `updated_at`, deletes win over edits. Applies to web and extension.
- Extension gains a "Open in web app" link.
- Done when: feature parity + bulk actions, realtime verified on two devices, offline edits sync correctly after reconnect, E2E tests for core flows.

## 9. v3: Mobile Application

- Expo app (iOS and Android): browse, search, organize.
- Save via the OS share sheet (share a link from any app to MarkMe).
- Supabase client with secure storage adapter (Expo SecureStore).
- Caching: read cache of recent items for fast start; behavior when offline must be defined explicitly in the v3 spec (reuses the v2 offline sync model).
- Done when: share-to-save works on both platforms, core flows tested, cache behavior documented.

## 10. Future (post v3)

- Public sharing of items and collections.

## 11. Non-Functional Requirements

| Area           | Requirement                                             |
| -------------- | ------------------------------------------------------- |
| Security       | RLS everywhere, SSRF protections, no secrets in clients |
| Performance    | Item list first page < 1s; search < 500 ms on 10k items |
| Reliability    | Save never blocked by preview failure                   |
| Accessibility  | WCAG AA, keyboard navigation                            |
| Code quality   | Strict TypeScript, ESLint, Prettier, shared configs     |
| Dev experience | One-command local setup; Turborepo cached builds        |

## 12. Success Metrics (portfolio)

- Each version shipped with passing CI and documented setup.
- Zero cross-user data access in RLS tests.
- All SSRF test cases blocked.
- Clear README and demo (screenshots or short video) per version.

## 13. Risks

| Risk                            | Mitigation                                          |
| ------------------------------- | --------------------------------------------------- |
| SSRF via preview API            | Protections in 7.3, dedicated test suite            |
| Unauthorized data access        | RLS + multi-user tests, ownership from `auth.uid()` |
| Cross-platform auth differences | Per-app storage adapter, shared client factory      |
| Sync expectations               | Defined per version; offline editing in v2          |
| Scope creep                     | Strict version order; non-goals enforced            |

## 14. Open Questions

- None.

## 15. Next Steps

1. Review and approve this PRD.
2. Convert v1 into Spec Kit specs (setup/monorepo, database + RLS, preview API, extension auth, save flow, library/search, organization).
3. Execute specs on Mostafa's machine.

## Changelog

- v1.2 (2026-10-20): `items.embed_html` replaced by `embed_provider` + `embed_id` (IMPLEMENTATION_PLAN §4 A19); the preview API returns embeds as provider + id.
- v1.1 (2026-10-18): approved IMPLEMENTATION_PLAN §4 decisions A1 (`items.favicon_url`, filled by the preview API), A3 (multi-tag filter = all selected tags) and A7 option (a) (US-1: confirm email before first sign-in, per spike S0 Q3); US-1b notes the S0 Q4 linking behavior.
- v1.0 (2026-10-17): approved.
