# MarkMe: v1 Implementation Plan

| | |
| --- | --- |
| Owner | Mostafa |
| Status | Draft v1.2 |
| Date | 2026-10-17 |
| Inputs | [PRD.md](PRD.md), [PLAN.md](PLAN.md) v1.1, [constitution](../.specify/memory/constitution.md) v1.1.1 |

## 0. How to use this document

- **What it is:** the technical "how" for every v1 milestone (M0–M8) in `PLAN.md`. The PRD says
  *what*, PLAN says *in which order*, this says *how*.
- **Precedence:** constitution > PRD > PLAN > this document. If this document conflicts with one
  above it, the one above wins. Fix this document.
- **Relationship to Spec Kit:** for each milestone:
  - Paste the **Spec input seed** into `/speckit-specify`. Seeds stay technology-light, as Spec Kit
    specs should.
  - Use **Technical design** as the input to `/speckit-plan`.
  - Use **Task breakdown** as the expected shape of `/speckit-tasks`.
  - Bring the **Open items** to `/speckit-clarify`.
- **Change rule:** if `/speckit-clarify` or `/speckit-plan` changes a decision here, update this file
  in the same PR.
- **Proposals:** items marked **(approved, An)** go beyond the PRD. They are listed in §4; Mostafa
  approved all of them on 2026-10-18.

---

## 1. Cross-cutting decisions

### 1.1 Toolchain

Each dependency is listed with its reason (constitution IV).

| Tool | Version policy | Reason |
| --- | --- | --- |
| Node.js | 22 LTS, pinned in `.nvmrc` and `engines` | Current LTS; Cloud Run base image `node:22-slim` |
| pnpm | pinned via `packageManager` in root `package.json` (Corepack) | PRD stack; strict workspace resolution |
| Turborepo | 2.x | PRD stack; cached `lint/typecheck/test/build` |
| TypeScript | 5.x, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | Constitution: strict TS everywhere |
| ESLint | 9 flat config + `typescript-eslint` (type-aware) + `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y` | Shared lint; a11y lint supports VI |
| Prettier | 3.x | Shared formatting |
| Vitest | 3.x in every package | One test runner; fast; works with WXT |
| Testing Library | `@testing-library/react`, `user-event`, `vitest-axe` | Component tests + automated axe checks (PLAN DoD) |
| Playwright | latest stable | E2E with a loaded extension (PRD 7.5) |
| zod | 3.x (or 4 if stable when M0 starts; decide in M0 plan) | Schemas + env validation (PRD, PLAN) |
| Supabase CLI | pinned version in CI (`supabase/setup-cli`) | Local stack, migrations, pgTAP, type generation |

### 1.2 Repository layout (end of v1)

```text
.
├── .github/workflows/{ci.yml,deploy-preview-api.yml,release.yml}
├── .nvmrc  package.json  pnpm-workspace.yaml  turbo.json  .gitleaks.toml
├── scripts/{dev.mjs,check-bundle-secrets.mjs,perf-popup.mjs,perf-search.mjs}
├── apps/
│   ├── extension/
│   │   ├── wxt.config.ts  .env.example  vitest.config.ts  playwright.config.ts
│   │   ├── entrypoints/
│   │   │   ├── background.ts            # auth refresh, preview jobs, OAuth, context menu
│   │   │   ├── popup/{index.html,main.tsx,App.tsx}
│   │   │   └── sidepanel/{index.html,main.tsx,App.tsx}
│   │   ├── src/
│   │   │   ├── lib/{supabase.ts,storage-adapter.ts,env.ts,messages.ts,broadcast.ts,query-client.ts}
│   │   │   ├── features/{auth,save,library,item,folders,tags}/   # components + hooks + tests
│   │   │   ├── ui/                       # design-system components
│   │   │   └── styles/{tokens.css,base.css}
│   │   ├── public/placeholders/{article,video,image,post,link}.svg
│   │   └── e2e/{fixtures.ts,global-setup.ts,smoke.spec.ts}
│   └── preview-api/
│       ├── Dockerfile  .dockerignore  .env.example
│       ├── src/{server.ts,app.ts,env.ts,auth.ts,ratelimit.ts,cache.ts,pipeline.ts}
│       ├── src/ssrf/{ip-policy.ts,resolve.ts,safe-fetch.ts}
│       ├── src/parse/{html-metadata.ts,sanitize.ts}
│       ├── src/oembed/{index.ts,youtube.ts,x.ts,instagram.ts}
│       └── test/{ssrf/*.test.ts,fixtures/*.html,*.test.ts}
└── packages/
    ├── config/{tsconfig/{base,node,react}.json,eslint/index.js,prettier/index.js}
    ├── database/
    │   ├── supabase/{config.toml,seed.sql,migrations/*.sql,tests/*.test.sql}
    │   ├── scripts/seed-10k.sql
    │   └── src/{index.ts,types.gen.ts}
    └── domain/
        └── src/{index.ts,url/normalize.ts,media-type.ts,schemas/*.ts,client/factory.ts,data/*.ts}
```

`apps/web` and `apps/mobile` are **not** created in v1.

### 1.3 Supabase project location

`supabase init` runs **inside `packages/database`**, so migrations, tests and `config.toml` live with
the package that owns them (constitution II). Every CLI call goes through root scripts:

| Script | Command |
| --- | --- |
| `db:start` | `supabase start --workdir packages/database` |
| `db:stop` | `supabase stop --workdir packages/database` |
| `db:reset` | `supabase db reset --workdir packages/database` (re-applies migrations + `seed.sql`) |
| `db:test` | `supabase test db --workdir packages/database` |
| `db:types` | `supabase gen types typescript --local --workdir packages/database > packages/database/src/types.gen.ts && prettier --write` |
| `db:push` | `supabase db push --workdir packages/database` (cloud; linked project) |
| `db:new` | `supabase migration new --workdir packages/database` |

### 1.4 Environment variables

Every app validates its env with a zod schema at startup and fails fast with a readable error.
Committed `.env.example` files list every key. Real `.env*` files are git-ignored.

| App | Key | Notes |
| --- | --- | --- |
| extension | `WXT_SUPABASE_URL` | Local: `http://127.0.0.1:54321` |
| extension | `WXT_SUPABASE_ANON_KEY` | Public anon/publishable key. Never the service-role key |
| extension | `WXT_PREVIEW_API_URL` | Local: `http://127.0.0.1:8787` |
| preview-api | `PORT` | Default 8787 locally; Cloud Run injects `PORT` |
| preview-api | `SUPABASE_URL` | Used to build the JWKS URL + expected issuer |
| preview-api | `SUPABASE_JWT_SECRET` | Optional; only if the project still uses legacy HS256 tokens (decided in M3) |
| preview-api | `CORS_ORIGINS` | Comma list, e.g. `chrome-extension://<pinned-id>` |
| preview-api | `RATE_LIMIT_USER_PER_MIN`, `RATE_LIMIT_IP_PER_MIN`, `RATE_LIMIT_FORCE_PER_HOUR` | Defaults 30 / 60 / 10 |
| preview-api | `META_OEMBED_TOKEN` | Optional; Instagram oEmbed works tokenless (S0 Q6), a token only raises rate limits |
| tests only | `SUPABASE_SERVICE_ROLE_KEY` | Only in E2E global setup / seed scripts; never in any app bundle |

### 1.5 Branches, PRs, commits

- Spec Kit creates one branch per milestone, e.g. `001-m0-monorepo-foundation`,
  `002-m1-database-rls`, `003-m2-domain`, and so on.
- One Spec Kit task = one commit = one PR into the milestone branch. The milestone branch merges to
  `main` when its exit criteria pass in CI.
- Commit format: Conventional Commits (`feat(domain): …`, `test(preview-api): …`, `chore(ci): …`).

### 1.6 CI (GitHub Actions, `ci.yml`)

| Job | Added in | Steps |
| --- | --- | --- |
| `quality` | M0 | checkout → setup pnpm + Node (cache) → `pnpm install --frozen-lockfile` → `turbo run lint typecheck test` (Turborepo local cache via `actions/cache`) |
| `db` | M0 | `supabase/setup-cli` → `pnpm db:start` (exclude unused services: `-x studio,imgproxy,edge-runtime,logflare,vector,supavisor`) → `pnpm db:test` → `pnpm db:types` → `git diff --exit-code packages/database/src/types.gen.ts` (drift check) |
| `secrets` | M0 | `gitleaks/gitleaks-action` on the PR diff |
| `preview-api-image` | M3 | `docker build apps/preview-api` (build only on PRs) |
| `e2e` | M4 | `db:start` → start preview API → build extension → `playwright test` (Chromium, extension loaded) |
| `bundle-secrets` | M8 | build prod extension → `node scripts/check-bundle-secrets.mjs .output/` |

Separate workflows: `deploy-preview-api.yml` (M3, on push to `main`, path-filtered) and
`release.yml` (M8, on tag `v*`).

### 1.7 Test stack summary

| Area | Tools | Location |
| --- | --- | --- |
| Domain | Vitest, table-driven `it.each` | `packages/domain/src/**/*.test.ts` |
| Database | pgTAP via `supabase test db` (+ `basejump-supabase_test_helpers` style helpers written inline, no new dep unless justified) | `packages/database/supabase/tests/*.test.sql` |
| Preview API | Vitest + `supertest` + undici `MockAgent`; injected DNS resolver; local `http.createServer` targets | `apps/preview-api/test/**` |
| Extension components | Vitest + jsdom + Testing Library + `vitest-axe`; WXT `fakeBrowser` for `chrome.*` | next to components |
| E2E | Playwright `chromium.launchPersistentContext` with `--load-extension` | `apps/extension/e2e/` |

---

## 2. Spike S0: OAuth, email confirmation, oEmbed, token refresh

**When:** during M1/M2, before `/speckit-specify` for M4. It is throwaway code in a scratch branch
`spike/s0`. Only the results land, written into the M3 and M4 specs and summarized in §2.3.

### 2.1 Questions and steps

| # | Question | Steps |
| --- | --- | --- |
| Q1 | Does Google sign-in via `launchWebAuthFlow` + PKCE work with a pinned extension ID? | Generate a key (`openssl genrsa 2048 \| openssl rsa -pubout -outform DER \| base64 -w0`), put it in a minimal WXT manifest `key`, load unpacked, confirm the ID is stable across machines. Create a Google OAuth client (Web application) whose redirect URI is the Supabase callback. Add `https://<ext-id>.chromiumapp.org/` to Supabase allowed redirect URLs. In the background worker: `signInWithOAuth({ provider: 'google', options: { redirectTo: chrome.identity.getRedirectURL(), skipBrowserRedirect: true } })` → `chrome.identity.launchWebAuthFlow({ url, interactive: true })` → read `code` from the returned URL → `exchangeCodeForSession(code)`. |
| Q2 | Does the flow survive the popup closing? | Start it from the popup **by message to the background worker**. The popup closes when the auth window takes focus, so the flow must not live in the popup. Confirm the session lands in `chrome.storage.local`. |
| Q3 | **Can a user use the app before confirming their email (US-1)?** | With Supabase "Confirm email" **on**, `signUp` normally returns **no session** until the user confirms. With it **off**, users are auto-confirmed, so there is no "unverified" state and the banner can never show. Check the current Supabase Auth settings (local `config.toml` `[auth.email]` and the Cloud dashboard) for an option that allows sign-in with an unverified email. Record exactly what works locally and on Cloud. |
| Q4 | Google sign-in vs. an existing password account with an **unconfirmed** email | Create a password user (unconfirmed), then sign in with Google using the same address. Record whether Supabase links the identities, creates a second user, or drops the unverified password identity. Repeat with a **confirmed** password user. |
| Q5 | Token refresh across popup, side panel and service worker | Each surface creates its own client from the factory with the shared `chrome.storage` adapter. Check that `navigator.locks` (used by supabase-js for refresh) is shared across the extension origin, including the service worker. Force an expiry (short `jwt_expiry` locally) with the popup and side panel both open. Confirm there is a single refresh and no `refresh_token_already_used` error. Check what happens after the worker sleeps: does the next surface to open refresh correctly? |
| Q6 | X and Instagram oEmbed access | Call `https://publish.twitter.com/oembed?url=…` and Instagram via the Meta Graph `instagram_oembed` endpoint. Record whether a token is needed, rate limits, and the response fields. YouTube (`https://www.youtube.com/oembed`) is the baseline. |

### 2.2 Decision rules

- **Q3 fallback** (if an unverified session is not possible): bring Mostafa these options, as a PRD
  change. **(approved as A7: option (a))**
  - **(a)** Keep "Confirm email" on and change US-1 to "must confirm before first sign-in" (simplest).
  - **(b)** Turn confirmation off and drop the banner.
  - **(c)** Turn confirmation off and track verification separately. This is complex, and the
    recommendation is against it.
  - **Recommendation:** use the setting if it exists, otherwise option (a).
- **Q4:** pick the behavior Supabase supports that never creates duplicate accounts. Document it in
  the M4 spec as an acceptance criterion.
- **Q5:** if locks are not shared, only the **background worker** runs `autoRefreshToken: true`. The
  popup and side panel use `autoRefreshToken: false`, read the session from storage, and react to
  `chrome.storage.onChanged`. Since the worker sleeps, add the `alarms` permission for a periodic
  refresh. This is a permission beyond PRD 7.2, so it needs a justification and approval.
- **Q6:** any provider that needs a paid account or unavailable app review is **disabled** and falls
  back to HTML metadata (PLAN M3).

### 2.3 Results template

```markdown
## S0 results (YYYY-MM-DD)
- Pinned extension ID: …            (key stored in apps/extension/wxt.config.ts)
- Q1 Google PKCE flow: works / issues: …
- Q2 Flow from background worker: …
- Q3 Unverified sign-in: supported via … / not supported → chosen option …
- Q4 Linking behavior: unconfirmed → … ; confirmed → …
- Q5 Refresh coordination: navigator.locks shared? … → chosen design …
- Q6 oEmbed: YouTube ✓ / X … / Instagram …
```

### 2.4 S0 results (2026-10-18)

Q3–Q6 were answered from live endpoint calls and the source of the libraries we will ship
(`@supabase/auth-js` 2.118.0, `supabase/auth` at `ce9a8ee`, 2026-09-22). Q1/Q2 need a real
Supabase project and a Google OAuth client; the kit for them is on branch `spike/s0`
(`spike/s0/README.md`).

- **Pinned extension ID:** `dapmmcamlgmaopfaicfjifakodajigha`. The public key is in
  `spike/s0/extension/manifest.json` (`key`) and moves to `apps/extension/wxt.config.ts` in M4-T1.
  The private `.pem` is not in git and isn't needed for unpacked installs.
- **Q1 Google PKCE flow / Q2 from the background worker:** *pending manual run* (the kit implements
  exactly the §2.1 steps in `background.js`, started from the popup by message).
- **Q3 Unverified sign-in: not supported for email + password → A7 option (a).**
  - `GOTRUE_MAILER_ALLOW_UNVERIFIED_EMAIL_SIGN_INS` exists, but it is only read for OAuth providers
    (`internal/api/external.go`).
  - The password grant always returns `email_not_confirmed` when `email_confirmed_at` is null
    (`internal/api/token.go:181`).
  - `signUp` returns no session unless autoconfirm is on, and autoconfirm leaves no unverified state.
  - **Consequence:** sign-up shows a "check your email" screen with resend. Sign-in with an
    unconfirmed email shows the same message plus resend. There is no in-app banner. This
    contradicted the constitution's "users may use the app before confirming email"
    (Technology Constraints); amended in constitution v1.1.1 (2026-10-18).
- **Q4 Linking (from `internal/models/linking.go` + `external.go`):**
  - Google emails are verified, so GoTrue links the identity to the existing user with that email:
    **same `user_id`, no duplicate**.
  - **Unconfirmed** password user: `RemoveUnconfirmedIdentities` deletes the email identity, sets
    `encrypted_password = null` (pre-account-takeover protection), then confirms the user. The old
    password no longer works; the user can set a new one through password reset.
  - **Confirmed** password user: linked, and both the password and Google identities keep working.
  - Under A7 (a) an unconfirmed account never signed in, so it holds no data.
  - **M4 acceptance:** Google sign-in on an existing email returns the same `user_id`.
- **Q5 Refresh coordination: `navigator.locks` is no longer used.** Since auth-js 2.107 the client is
  lockless by default:
  - Refreshes within one instance are single-flighted.
  - Races between contexts are resolved by GoTrue's refresh-token reuse rules.
  - A commit guard re-reads storage after the refresh and discards the rotated tokens if another
    context rotated first. Because all surfaces share `chrome.storage.local`, the guard works
    across popup, side panel and worker.
  - **Design:** every surface uses `autoRefreshToken: true` and does **not** pass a `lock` option.
    Pin `@supabase/supabase-js` ≥ 2.107.
  - After the worker sleeps, the next `getSession()` (surface open, or a preview request in the
    worker) refreshes an expired token.
  - **The `alarms` permission is not needed (A8: not added).**
  - The M4-T7 test forces a short `jwt_expiry` with two clients sharing one storage and asserts a
    single valid session and no `refresh_token_already_used` surfaced to the UI.
- **Q6 oEmbed (live calls, no token):**
  - **YouTube ✓** `https://www.youtube.com/oembed?format=json&url=…` gives title, author, thumbnail
    and type `video`.
  - **X ✓** `https://publish.x.com/oembed?omit_script=true&url=…`. `publish.twitter.com` now 301s
    there, so use the new host directly; our fetcher's redirect re-validation would follow it
    anyway. It returns `author_name`, `type: rich` and a `blockquote` whose text becomes the
    description. There is no title or thumbnail, so the HTML path (OG tags on `x.com` are present
    for a non-browser UA) fills the image.
  - **Instagram ✓ without a token:**
    - Meta made oEmbed tokenless on 2026-06-15:
      `https://graph.facebook.com/v25.0/instagram_oembed?url=…`.
    - It returns only `provider_name`, `type: rich` and a `blockquote` (no title, author or
      thumbnail). Caption text is parsed from the blockquote.
    - Tokenless rate limits are undocumented and may be lower than with a token.
    - Post pages served no OG tags to our UA in the test.
    - Unavailable media returns HTTP 400 `code 24` → fallback.
    - `META_OEMBED_TOKEN` stays optional, for higher limits only.
  - **Tooling note:** Chrome/Brave-branded builds ignore `--load-extension` (Chrome 137+). E2E must
    use Playwright's bundled Chromium, which matches the M4 harness.

---

## 3. Milestones

Every milestone also meets the common definition of done in `PLAN.md` §1.

### M0. Monorepo foundation

**Depends on:** – · **Covers:** setup, CI, secrets hygiene

**Spec input seed**
> Set up the MarkMe monorepo so that a developer can clone it and run the whole local stack (database,
> auth, preview service, Chrome extension dev build) with one command. Every pull request is
> checked automatically for lint, types, unit tests, database tests and leaked secrets. Each app
> refuses to start with missing or invalid configuration and explains what is missing. No product
> features in this milestone.

**Technical design**
- Root `package.json`:
  - `"packageManager": "pnpm@<pinned>"` and `"engines": { "node": ">=22 <23" }`.
  - Scripts `dev`, `build`, `lint`, `typecheck`, `test`, `format`, plus the `db:*` scripts in §1.3.
- `pnpm-workspace.yaml`: `apps/*`, `packages/*`.
- `turbo.json` tasks:
  - `build` (`dependsOn: ["^build"]`, outputs `dist/**`, `.output/**`).
  - `dev` (`cache: false`, `persistent: true`).
  - `lint`, `typecheck` (`dependsOn: ["^build"]` only where a package emits types).
  - `test` (outputs `coverage/**`).
- Internal packages are consumed **as TS source** (`"exports": { ".": "./src/index.ts" }`), with no
  build step for `domain`/`database`. This keeps dev simple, and Vite/tsx compile them.
- `packages/config`:
  - `tsconfig/base.json` (strict flags in §1.1, `moduleResolution: "Bundler"`, `target: ES2022`),
    plus `node.json` (NodeNext) and `react.json` (`jsx: react-jsx`, DOM libs).
  - `eslint/index.js` exports a flat-config array.
  - `prettier/index.js`.
- `apps/preview-api`: Express app with `GET /healthz` → `{ ok: true }`, `src/env.ts` zod loader, and
  `dev` script `tsx watch src/server.ts`. Docker comes in M3.
- `apps/extension`: `wxt` + React template trimmed to a hello popup, `src/lib/env.ts` zod loader over
  `import.meta.env`, and `dev` script `wxt`.
- `packages/database`: `supabase init`, an empty migration folder, and
  `supabase/tests/000-smoke.test.sql`:
  ```sql
  begin; select plan(1); select ok(true, 'pgTAP runs'); select * from finish(); rollback;
  ```
- `packages/domain`: `src/index.ts` with one placeholder export and one unit test.
- `scripts/dev.mjs`:
  1. If `supabase status --workdir packages/database` fails, run `pnpm db:start`.
  2. Print the local URLs and keys hint.
  3. `turbo run dev --filter=@markme/preview-api --filter=@markme/extension`.
  - Root `dev` = `node scripts/dev.mjs`.
- `.gitignore`: `.env`, `.env.*` except `.env.example`, `.output`, `.wxt`, `coverage`, `.turbo`,
  `packages/database/supabase/.temp`.
- `.gitleaks.toml`: default rules + allowlist for `.env.example` placeholders.
- `README.md`: prerequisites (Node 22, pnpm, Docker, Supabase CLI), `pnpm install`, `pnpm dev`.

**Task breakdown**

| ID | Task | Proof |
| --- | --- | --- |
| M0-T1 | Root workspace: `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.gitignore`, `turbo.json` | `pnpm install` succeeds |
| M0-T2 | `packages/config` (tsconfig presets, ESLint flat config, Prettier) | `pnpm lint` on an empty repo passes |
| M0-T3 | `packages/domain` + `packages/database` skeletons with placeholder test | `pnpm test` runs 1 test |
| M0-T4 | `apps/preview-api` stub with `/healthz` and zod env loader | Unit test: missing env → throws with key name |
| M0-T5 | `apps/extension` WXT stub with zod env loader | `pnpm --filter extension build` produces `.output/chrome-mv3` |
| M0-T6 | `supabase init` in `packages/database`, smoke pgTAP test, `db:*` scripts | `pnpm db:start && pnpm db:test` passes |
| M0-T7 | `scripts/dev.mjs` + root `dev` | Fresh clone → `pnpm dev` starts all three |
| M0-T8 | `ci.yml` jobs `quality`, `db`, `secrets` | CI green on the PR |
| M0-T9 | `.env.example` per app, gitleaks config, README setup | gitleaks job passes; README steps work verbatim |

**Exit verification**
```bash
git clone … && cd MarkMe && pnpm install && pnpm dev   # supabase + api + extension dev build up
curl -s localhost:8787/healthz                          # {"ok":true}
pnpm lint && pnpm typecheck && pnpm test && pnpm db:test
```
CI is green, with one passing unit test and one passing pgTAP test.

**Open items for `/clarify`**
- zod 3 vs 4.
- Whether `turbo` remote cache is needed. Default: no, and local `actions/cache` is enough.

---

### M1. Database schema + RLS

**Depends on:** M0 · **Covers:** PRD 6, D1, D3, D5, PRD 7.4

**Spec input seed**
> Create the data store for MarkMe: user profiles, saved items, folders, tags and the item↔tag
> link. Each user can only ever see or change their own data, and this is proven by automated tests
> with two users. An item belongs to at most one folder and can have many tags. A user cannot save
> the same (normalized) URL twice. Folder and tag names are unique per user, ignoring case. Deleting
> a folder keeps its items (they become "no folder"); deleting a tag removes it from items. Users
> can search their items by text across title, descriptions, their own note, URL and tag names,
> combined with folder and tag filters, ranked by relevance and paginated. The schema is also
> applied to the hosted production database.

**Technical design: migrations** (one file per concern, in order)

1. `…_extensions_and_types.sql`
   - `create extension if not exists pgtap with schema extensions;` (tests only; Supabase ships it).
   - `create type public.media_type as enum ('article','video','image','post','link');`
   - `create type public.preview_status as enum ('pending','ok','failed');`
   - A shared `public.set_updated_at()` trigger function.

2. `…_profiles.sql`
   - `profiles(id uuid primary key references auth.users on delete cascade, display_name text, created_at timestamptz not null default now())`.
   - `public.handle_new_user()`: `security definer`, `set search_path = ''`. It inserts
     `(new.id, new.raw_user_meta_data->>'full_name')` or the email local part. It runs from an
     `after insert on auth.users` trigger.

3. `…_folders_tags.sql`
   - `folders(id uuid pk default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null check (length(btrim(name)) between 1 and 100), created_at timestamptz not null default now(), unique (id, user_id))`.
     The extra `unique (id, user_id)` is the target of the composite FK below.
   - `create unique index folders_user_name_uq on folders (user_id, lower(name));`
   - `tags(...)` has the same shape. PRD 6 lists no `tags.created_at`; adding it is
     **(approved, A12)**. It is useful for sorting and costs nothing.
   - `create unique index tags_user_name_uq on tags (user_id, lower(name));`

4. `…_items.sql`
   - `items`:
     - `id uuid pk default gen_random_uuid()`
     - `user_id uuid not null default auth.uid() references auth.users on delete cascade`
     - `url text not null check (url ~* '^https?://')`
     - `normalized_url text not null`
     - `title text`, `description text`, `image_url text`
     - `favicon_url text` **(approved, A1)**
     - `site_name text`
     - `media_type media_type not null default 'link'`
     - `embed_html text`
     - `folder_id uuid`
     - `note text check (char_length(note) <= 1000)`
     - `preview_status preview_status not null default 'pending'`
     - `preview_fetched_at timestamptz`
     - `created_at`, `updated_at timestamptz not null default now()`
     - `search_vector tsvector not null default ''::tsvector`
     - `unique (user_id, normalized_url)`
     - `foreign key (folder_id, user_id) references folders (id, user_id) on delete set null (folder_id)`
   - The composite FK (Postgres 15+ column list) makes it **impossible** to put an item in another
     user's folder. Deleting a folder nulls only `folder_id`.
   - `item_tags(item_id uuid references items on delete cascade, tag_id uuid references tags on delete cascade, primary key (item_id, tag_id))`.
   - Indexes:
     - `items (user_id, created_at desc, id desc)` for the list.
     - `items (user_id, folder_id)`.
     - `item_tags (tag_id)`.
     - `gin (search_vector)`.
   - `updated_at` trigger on `items`.

5. `…_rls.sql`
   - `alter table … enable row level security` on all five tables.
   - `profiles`: select/update where `id = auth.uid()`. No insert or delete from clients (the
     trigger does it).
   - `folders`, `tags`, `items`: four policies each (`select`/`insert`/`update`/`delete`), all with
     `to authenticated`.
     - `using` and `with check`: `user_id = (select auth.uid())`. The `(select …)` wrapper is the
       Supabase-recommended form so the planner caches the call.
   - `item_tags`:
     - select/delete `using`: **both** sides owned, i.e. `exists (select 1 from items i where i.id = item_id and i.user_id = (select auth.uid())) and exists (select 1 from tags t where t.id = tag_id and t.user_id = (select auth.uid()))`.
       Checking both sides is defense in depth against a bad row from an admin path.
     - insert `with check` requires **both** the item and the tag to be owned.
     - No update policy (rows are immutable; delete + insert).
   - Revoke update of `user_id` from `authenticated` on items/folders/tags (column privilege). This
     stops ownership transfer even though `with check` already blocks it.

6. `…_search.sql`
   - **FTS approach: trigger-maintained `search_vector`.** It is chosen over a search-time join so
     the GIN index covers tag names too. The trade-off: a tag rename rewrites the vectors of its
     items, which is fine at personal-collection scale.
   - `public.item_search_vector(p_item_id uuid) returns tsvector` builds:
     ```sql
     setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
     setweight(to_tsvector('simple', coalesce(string_agg(t.name,' '),'')), 'B') ||
     setweight(to_tsvector('simple', coalesce(note,'')), 'B') ||
     setweight(to_tsvector('simple', coalesce(description,'')), 'C') ||
     setweight(to_tsvector('simple', regexp_replace(url, '[/:.?=&_-]+', ' ', 'g')), 'D')
     ```
     Config `simple` vs `english` is open, see §4.
   - Triggers:
     - `before insert or update of title, description, note, url on items` sets
       `new.search_vector`, computing from `new.*` plus current tags.
     - `after insert or delete on item_tags` updates the affected item.
     - `after update of name on tags` updates all items with that tag.
   - `public.search_items(p_query text default null, p_folder_id uuid default null, p_tag_ids uuid[] default null, p_limit int default 20, p_offset int default 0)`:
     - Returns `setof` a composite with item columns, `tags jsonb` (`[{id,name}]`) and
       `rank real`.
     - `language sql stable security invoker`, so **RLS applies**.
     - Filters:
       - `p_query` uses `websearch_to_tsquery('simple', p_query)`.
       - Folder: `folder_id = p_folder_id`. A separate `p_no_folder boolean` covers "no folder" if
         clarify wants that filter.
       - Tags: an item must have **all** of `p_tag_ids` (`having count(distinct tag_id) = cardinality(p_tag_ids)`).
         The semantics are open, see §4.
     - Order: with a query, `ts_rank_cd(search_vector, q) desc, created_at desc`. Without one,
       `created_at desc, id desc`.
     - The ALL-tags filter is evaluated after the GIN match (group/having). This is fine at v1 scale
       and is measured by `perf-search` in M6.
     - Offset pagination is acceptable at 10k items per user. Keyset is a later optimization.
     - `p_limit` is clamped to 1–50.

**Types**
- `pnpm db:types` writes `packages/database/src/types.gen.ts`.
- `src/index.ts` re-exports `Database`, plus helpers `Tables<'items'>` and so on, and the row
  types of the `search_items` result.

**Cloud project**
- Create the free Supabase project (region near Mostafa, e.g. `eu-central-1`).
- `supabase link --project-ref … --workdir packages/database`, then `pnpm db:push`.
- **Decision:** manual push, documented in the README. A CI auto-push needs a stored DB password
  and a production-migration policy, which is not worth it for v1 (constitution IV).

**Tests (pgTAP, `packages/database/supabase/tests/`)**
- Helpers file `001-helpers.test.sql`. Better: a non-test `tests/helpers.sql` included via `\ir`.
  - Create two users by inserting into `auth.users`.
  - Switch identity with:
    ```sql
    set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
    ```
  - `reset role` switches back to the admin identity.

| File | Asserts |
| --- | --- |
| `010-schema.test.sql` | tables, columns, enums, indexes exist (`has_table`, `has_column`, `has_index`); RLS enabled on all 5 (`select relrowsecurity`) |
| `020-profiles.test.sql` | sign-up trigger creates profile; user A reads own, not B's; cannot insert/delete |
| `030-folders.test.sql` | A CRUD own; A cannot read/update/delete B's; insert with `user_id = B` fails; case-insensitive duplicate name fails; same name for A and B allowed |
| `040-tags.test.sql` | same matrix as folders |
| `050-items.test.sql` | A CRUD own; cross-user denial; insert with B's id rejected; duplicate `normalized_url` for A fails, same URL for B allowed; note > 1000 rejected; A cannot set `folder_id` to B's folder (FK); folder delete → `folder_id` null, item survives |
| `060-item-tags.test.sql` | A links own item+own tag; A cannot link own item + B's tag, or B's item + own tag; A cannot see B's links; tag delete cascades links, items survive |
| `070-search.test.sql` | title match ranks above description-only match; tag-name match found; note match found; URL token match found; folder filter; multi-tag filter; user A's search never returns B's items; tag rename updates results; pagination limit/offset |

**Task breakdown**

| ID | Task | Proof |
| --- | --- | --- |
| M1-T1 | Test helpers (two users, identity switch) | Used by every later test |
| M1-T2 | Types/enums + `profiles` + sign-up trigger, with `020` test | `db:test` |
| M1-T3 | `folders`, `tags` + unique indexes, with `030`/`040` (RLS included in same PR so no table merges without RLS) | `db:test` |
| M1-T4 | `items`, `item_tags`, composite FK, indexes, `updated_at`, with `050`/`060` + RLS | `db:test` |
| M1-T5 | `010-schema` test (RLS-enabled assertion for every table) | `db:test` |
| M1-T6 | FTS vector + triggers + `search_items`, with `070` | `db:test` |
| M1-T7 | Generated types + package exports; CI drift check now meaningful | `db` job green |
| M1-T8 | Cloud project, link, push; README "Database" section | Tables visible in the cloud dashboard |

The constitution says a table without RLS does not merge, so each table PR includes its policies
(T3, T4).

**Exit verification**
```bash
pnpm db:reset && pnpm db:test      # all files pass
pnpm db:types && git diff --exit-code packages/database/src/types.gen.ts
supabase migration list --linked --workdir packages/database   # local == remote
```

**Open items for `/clarify`**
- Tag filter: ALL vs ANY.
- FTS config.
- Whether "no folder" is a filter option.
- Whether `tags.created_at` is wanted.

---

### M2. Domain package

**Depends on:** M0 (parallel with M1) · **Covers:** URL normalization, schemas, media types, client factory

**Spec input seed**
> Provide one shared definition of MarkMe's business rules that every app uses: how a URL is
> normalized so the same page is never saved twice; what valid items, folders, tags, notes and
> preview results look like; how a link is classified as article, video, image, post or generic
> link; and a way for each app to create its own database client with its own session storage.
> Every rule is covered by edge-case tests.

**Technical design**

`src/url/normalize.ts`:
`normalizeUrl(input: string): { ok: true; url: string } | { ok: false; error: 'invalid' | 'unsupported_scheme' }`

| # | Rule | Example in → out |
| --- | --- | --- |
| 1 | Trim whitespace; parse with WHATWG `URL` | `"  https://a.com "` → `https://a.com` |
| 2 | Only `http:`/`https:` | `ftp://a.com` → `unsupported_scheme`; `javascript:…` → `unsupported_scheme` |
| 3 | Lowercase scheme and host (WHATWG does it; IDN → punycode) | `HTTPS://Ex.COM/A` → `https://ex.com/A` (path case kept) |
| 4 | Strip default port | `https://a.com:443/x` → `https://a.com/x`; `http://a.com:8080` kept |
| 5 | Strip fragment | `https://a.com/x#top` → `https://a.com/x` |
| 6 | Strip tracking params: `utm_*` (any case), `fbclid`, `gclid` | `?utm_source=x&id=2` → `?id=2` |
| 7 | Drop an empty query | `https://a.com/x?` / all params stripped → no `?` |
| 8 | Keep remaining param order and values unchanged | `?b=2&a=1` stays |
| 9 | Remove trailing slash on path; root has no slash in output | `https://a.com/x/` → `https://a.com/x`; `https://a.com/` → `https://a.com` **(approved, A5)** |
| 10 | Keep userinfo? → **reject** URLs with credentials | `https://u:p@a.com` → `invalid` (avoids storing secrets) **(approved, A5)** |

Edge-case table: IPv6 host `http://[::1]` (normalizes; the preview API blocks it), IDN
`https://bücher.de` → `https://xn--bcher-kva.de`, encoded paths left as-is, `www.` **kept** (not in
PRD), repeated slashes kept, very long URLs (cap 2048 chars → `invalid`).

`src/media-type.ts`: `detectMediaType(input: { url: string; contentType?: string; ogType?: string; oembedType?: string; provider?: 'youtube' | 'x' | 'instagram' }): MediaType`. The first match wins:
1. `provider === 'youtube'` or oEmbed type `video` → `video`.
2. `provider` `x`/`instagram` → `post`.
3. `contentType` starts with `image/` → `image`.
4. `og:type`: `video.*` → `video`; `article` → `article`.
5. URL extension (`.png|.jpe?g|.gif|.webp|.avif|.svg`) → `image`; (`.mp4|.webm`) → `video`.
6. Fallback → `link`.

`src/schemas/`:
- `note` = `z.string().trim().max(1000)`.
- `folderName` / `tagName` = trimmed, 1–100 chars. Tag names may not contain commas, because the
  tag input splits on them.
- `itemCreate` = `{ url: httpUrl, folderId?: uuid, tagNames?: tagName[] (max 20), note? }`.
- `itemUpdate` = partial `{ title (max 300), note, folderId (nullable), tagIds }`.
- `previewRequest` = `{ url: httpUrl, force?: boolean }`.
- `previewResponse` = `{ url, title?, description?, imageUrl?, faviconUrl?, siteName?, mediaType, embedHtml?, provider? }`.
  - String lengths are capped (title 300, description 1000, URLs 2048).
  - The preview API and the client both parse with it.

`src/client/factory.ts`:
```ts
export interface AuthStorage { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void>; }
export function createMarkMeClient(opts: { url: string; anonKey: string; storage: AuthStorage; flowType?: 'pkce' | 'implicit'; autoRefreshToken?: boolean; detectSessionInUrl?: boolean }): SupabaseClient<Database>
```
It returns a **new** client every call. There is no module-level singleton, and a test asserts this
(constitution II).

**Tests**
- `normalize.test.ts`: `it.each` over the rule table + edge-case table. **Coverage threshold 100%**
  lines/branches for `src/url/**` in `vitest.config.ts`.
- `media-type.test.ts`: each precedence step, plus ties.
- `schemas.test.ts`: boundary values (note 1000 OK / 1001 fails, empty tag, whitespace-only names).
- `factory.test.ts`: uses the passed storage, and two calls return different instances.

**Task breakdown**

| ID | Task |
| --- | --- |
| M2-T1 | `normalizeUrl` + full rule/edge tables + coverage gate |
| M2-T2 | zod schemas + tests |
| M2-T3 | `detectMediaType` + tests |
| M2-T4 | `createMarkMeClient` + `AuthStorage` type + tests (depends on M1 types; stub `Database` type if M1 not merged, then switch) |

**Exit verification:** `pnpm --filter @markme/domain test --coverage` passes, with the normalization
coverage gate at 100%.

**Open items for `/clarify`**
- Root trailing slash.
- Credentials in URL.
- Max tags per item.
- Whether `www.` is stripped (proposed: no).

---

### M3. Preview API

**Depends on:** M1, M2 (or M0 + M2 per PLAN) · **Covers:** PRD 7.3, D2, D4

**Spec input seed**
> Provide a small, secure service that, given a link from a signed-in user, returns a preview: title,
> description, image, site name, icon, type and, for YouTube, X and Instagram, the provider's embed
> data when available. The service must never be usable to reach private or internal networks,
> must limit time, size, redirects and request rates, and must clean everything it returns. Results
> are cached for a day; a user can force a refresh, at a limited rate. It runs locally with the rest
> of the stack and is deployed to a public endpoint.

**Technical design**

Request flow (`src/app.ts`):
```
POST /v1/preview  { url, force? }
  → cors (allowlist) → json body limit 4 KB → auth (JWT) → rate limit (per sub + per IP; force limiter)
  → zod previewRequest → normalizeUrl → pipeline → zod previewResponse → 200
Errors: 400 invalid_url | 401 unauthorized | 422 blocked_target | 429 rate_limited | 502 fetch_failed | 504 timeout
```
Error bodies are `{ error: code }` only, never internal details.

| Module | Design |
| --- | --- |
| `auth.ts` | `jose` `createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', SUPABASE_URL))`, `jwtVerify` with `issuer = ${SUPABASE_URL}/auth/v1`, `audience = 'authenticated'`. If S0/M3 plan finds the project on legacy HS256, verify with `SUPABASE_JWT_SECRET` instead. `req.userId = payload.sub`. No call to Supabase per request. **Test seam:** `createAuth({ jwks })` takes a key set (the remote JWKS in prod, `createLocalJWKSet` with a test key pair in tests), so tests sign their own tokens. |
| `ratelimit.ts` | `express-rate-limit` (memory store). User limiter keyed by `req.userId`; IP limiter keyed by `req.ip` with `app.set('trust proxy', 1)` (Cloud Run front end); `force` limiter per user per hour. Reason for dep: standard, small, well tested. |
| `cache.ts` | `lru-cache` `{ max: 5000, ttl: 24h }` keyed by normalized URL. `force: true` skips the read but still writes. In memory per instance (accepted, PLAN). |
| `ssrf/ip-policy.ts` | `isBlockedAddress(ip: string): boolean` using `ipaddr.js` (reason: correct v4/v6 parsing incl. mapped/embedded forms). Block if `range()` is not `unicast`. Explicit list: `0.0.0.0/8`, `10/8`, `100.64/10` (CGNAT), `127/8`, `169.254/16` (incl. `169.254.169.254` metadata), `172.16/12`, `192.0.0/24`, `192.0.2/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, `224/4`, `240/4`, `255.255.255.255`; IPv6 `::/128`, `::1`, `fc00::/7` (incl. `fd00:ec2::254` metadata), `fe80::/10`, `ff00::/8`, `64:ff9b::/96` and `64:ff9b:1::/48` (NAT64 → check embedded v4), `2001::/32` (Teredo, blocked), `2001:db8::/32`, `::ffff:0:0/96` (check mapped v4), `2002::/16` (6to4 → check embedded v4). |
| `ssrf/resolve.ts` | `resolveSafe(host): Promise<string>`. If the host is an IP literal, check it directly. Otherwise use `dns.promises.lookup(host, { all: true })`. If **any** address is blocked, reject (stricter than "pick a good one"). Return the first address. The resolver is injectable for tests. |
| `ssrf/safe-fetch.ts` | `safeFetch(url, { deadline, maxBytes, maxRedirects, accept })`. Per hop: check scheme ∈ {http, https} and port ∈ {80, 443} (empty port OK) → `resolveSafe` → request through an undici `Agent` whose `connect.lookup` returns **only the validated IP** (pins the connection; SNI/Host still the hostname) → `redirect: 'manual'`. On 3xx: resolve `Location` against the current URL, count ≤ 3, repeat all checks. Headers: fixed `User-Agent: MarkMeBot/1.0 (+repo URL)`, `Accept`, **no cookies**, no auth. One `AbortSignal.timeout(5000)` is created **once before hop 0** and passed to every hop, so 5 s is the total for all redirects, not per hop. Body read as a stream with a byte counter; abort at 2 MB. Content-type allowlist: `text/html`, `application/xhtml+xml`, `image/*` (image → metadata from URL only, no body parse). |
| `parse/html-metadata.ts` | `cheerio` (reason: robust HTML parsing; no DOM needed). Read the first 2 MB only. Priority: `og:*` → `twitter:*` → `<title>`/`meta[name=description]`. Favicon: `link[rel~=icon]` → `/favicon.ico`. Resolve all URLs relative to the final URL; keep only `http(s)` URLs. |
| `parse/sanitize.ts` | Strip tags and control chars from every string, decode entities, collapse whitespace, cap lengths (same caps as `previewResponse`). |
| `oembed/*` | Provider adapters `{ match(url): boolean; fetch(url): Promise<Partial<Preview>> }`, each calling **only its fixed endpoint** through `safeFetch` (the endpoint is a constant, never user-derived). Disabled adapters return `null` → HTML path. YouTube: `https://www.youtube.com/oembed?format=json&url=…`. X: `https://publish.x.com/oembed?omit_script=true&url=…`. Instagram: `https://graph.facebook.com/v25.0/instagram_oembed?url=…` (tokenless; `access_token` added only if `META_OEMBED_TOKEN` is set). X/Instagram return only a `blockquote`: its text becomes the description, and the HTML path fills title/image (S0 Q6). |
| `embed_html` | **Built from server-side templates, never copied from provider HTML (approved, A6).** YouTube: extract the video ID with a strict regex → `<iframe src="https://www.youtube-nocookie.com/embed/{id}" …>`. X/Instagram: `embed_html = null` (their embeds need remote scripts, which MV3 extension pages can't run); title/author/thumbnail still returned. |
| `pipeline.ts` | `validate → cache → oEmbed match → safeFetch HTML → parse → detectMediaType → sanitize → cache.set → return`. On provider failure, fall through to HTML. On HTML failure, throw a typed error mapped to 502/504/422. |

**Docker and deploy**
- `Dockerfile`:
  - Multi-stage: `node:22-slim` builder runs `pnpm deploy --filter @markme/preview-api --prod`
    and compiles TS with `tsc` or `tsup`.
  - Runtime stage `node:22-slim` runs as `USER node`, with `CMD ["node","dist/server.js"]` and a
    `HEALTHCHECK` on `/healthz`.
- `deploy-preview-api.yml` runs on push to `main` when `apps/preview-api/**`, `packages/domain/**`
  or the lockfile change:
  1. Google auth via **Workload Identity Federation** (no JSON keys in GitHub).
  2. Build and push to Artifact Registry.
  3. `gcloud run deploy markme-preview-api --region … --max-instances=1 --min-instances=0 --memory=256Mi --allow-unauthenticated --set-env-vars …`
     - `--allow-unauthenticated` is right because auth is the JWT in the app.
     - Secrets, if any, come from Secret Manager via `--set-secrets`.
  4. Post-deploy smoke: `curl /healthz` → 200, and `POST /v1/preview` without a token → 401.
     This proves the deployed endpoint answers. The valid-JWT and SSRF checks against Cloud Run
     stay manual in the exit verification.
  - Free-tier note: Cloud Run, Artifact Registry (0.5 GB) and Secret Manager all have free quotas.
    Keep images small and delete old ones.
- `pnpm dev` runs `tsx watch` (no Docker locally, for speed). CI proves the image builds.

**Tests (written before `safe-fetch.ts` exists: M3-T2 lands before M3-T3)**

| Suite | Cases |
| --- | --- |
| `ip-policy.test.ts` | Every range above blocked, with v4, v6, IPv4-mapped (`::ffff:127.0.0.1`), NAT64/6to4-embedded forms; decimal/octal/hex IPv4 literals (`http://2130706433`, `http://0177.0.0.1`, `http://0x7f.1`): assert `new URL(…).hostname === '127.0.0.1'`, then blocked; public IPs (`8.8.8.8`, `2606:4700::1111`) allowed |
| `safe-fetch.scheme-port.test.ts` | `file:`, `ftp:`, `gopher:`, `data:` rejected; ports 22, 8080, 6379 rejected; 80/443 allowed |
| `safe-fetch.dns.test.ts` | Host resolving to private IP blocked; host resolving to mixed public+private blocked; **rebinding**: resolver returns public on first call, private on second → connection still goes to the first validated IP (assert via the injected lookup/connect spy), never a second lookup |
| `safe-fetch.redirect.test.ts` | Redirect to `http://127.0.0.1`, to `http://169.254.169.254/latest/meta-data`, to a host resolving private → blocked; 4th redirect → error; relative `Location` resolved; redirect to `ftp:` blocked |
| `safe-fetch.limits.test.ts` | Server that trickles bytes past 5 s → 504; 3 MB body → aborted at 2 MB; `application/json`, `application/octet-stream` rejected; `image/png` accepted without body parse |
| `safe-fetch.headers.test.ts` | Request carries fixed UA; no `cookie`/`authorization` header; `Set-Cookie` from target not replayed on redirect |
| `html-metadata.test.ts` | Fixtures: OG-complete page, Twitter-only page, bare `<title>`, relative image URLs, malicious `<script>` in title, huge description, missing everything |
| `oembed.test.ts` | YouTube/X/Instagram via `MockAgent`; provider 4xx/5xx → HTML fallback; Instagram tokenless request has no `access_token`, and adds it when `META_OEMBED_TOKEN` is set; Meta `code 24` → HTML fallback; X/Instagram blockquote text → description; YouTube embed built from ID only (no provider HTML passthrough) |
| `app.test.ts` (supertest) | No/invalid/expired JWT → 401; valid JWT (signed with a test JWKS) → 200; invalid URL → 400; private target → 422; rate limit per user and per IP → 429; `force` limiter → 429; cache hit doesn't refetch; CORS rejects unknown origin; error bodies have no stack |

Local targets: tests start `http.createServer` on `127.0.0.1` and **temporarily inject an allow-all
policy** to test limits. The production policy is tested separately to always block loopback. The
"allow" seam exists only in tests (constructor injection) and is never set from env.

**Task breakdown**

| ID | Task |
| --- | --- |
| M3-T1 | App skeleton: env, error mapper, CORS, body limit, `/healthz`, JWT auth middleware + tests |
| M3-T2 | **SSRF test suites** (`ip-policy`, `scheme-port`, `dns`, `redirect`, `limits`, `headers`) committed red/skipped-by-`todo`; `ip-policy.ts` implemented to green its suite |
| M3-T3 | `resolve.ts` + `safe-fetch.ts` → all SSRF suites green |
| M3-T4 | HTML metadata parser + sanitizer + fixtures |
| M3-T5 | oEmbed adapters + `embed_html` templates + tests |
| M3-T6 | Pipeline + cache + `POST /v1/preview` + `app.test.ts` |
| M3-T7 | Rate limiters (user, IP, force) + tests |
| M3-T8 | Dockerfile + `preview-api-image` CI job |
| M3-T9 | Cloud Run deploy workflow (WIF, Artifact Registry, max-instances 1) + README section |

Note on M3-T2: committing tests "red" breaks CI. Instead, land the suites as `it.todo`/`it.fails` for
`safe-fetch` and flip them in T3. The constitution only requires the tests to be *written before* the
fetcher, not merged failing.

**Exit verification**
```bash
pnpm --filter @markme/preview-api test           # all SSRF suites green
docker build -t markme-preview apps/preview-api
TOKEN=$(…sign in a test user, read access_token…)
curl -s -XPOST $API/v1/preview -H "authorization: Bearer $TOKEN" -d '{"url":"https://example.com"}'          # 200
curl -s -XPOST $API/v1/preview -H "authorization: Bearer $TOKEN" -d '{"url":"http://169.254.169.254/"}'     # 422
```
Run against both local and the Cloud Run URL.

**Open items for `/clarify`**
- `embed_html` template-only approach.
- Rate-limit numbers.
- Whether direct image links return the image URL as `imageUrl`.
- JWKS vs HS256.

---

### M4. Extension shell + auth (UI)

**Depends on:** M1, M2, S0 · **Covers:** US-1, US-1b, US-2, US-3

**Spec input seed**
> Ship the MarkMe Chrome extension shell: a popup for quick actions, a side panel for the library,
> and a background process. A person can create an account with email and password, sign in, sign
> in with Google in one click, stay signed in after restarting the browser, and sign out. After
> signing up they are asked to confirm their email before first sign-in, with a way to resend the
> email. Forms show clear inline errors. The extension asks for the fewest
> permissions possible, looks good in light and dark mode, and is fully keyboard accessible.

**Technical design**
- `wxt.config.ts`:
  - `modules: ['@wxt-dev/module-react']`.
  - `manifest`:
    - `name`, `key: '<pinned public key from S0>'`.
    - `permissions: ['activeTab','identity','storage','contextMenus','sidePanel']`.
    - `host_permissions` are built from env at build time (`${WXT_SUPABASE_URL}/*`,
      `${WXT_PREVIEW_API_URL}/*`).
    - `side_panel.default_path: 'sidepanel.html'`, `action.default_title`.
  - `contextMenus` is requested **in M4** so the manifest's permission set stays the same through
    v1. It is in the constitution's minimal list, and M8 only adds the handler.
- `src/lib/storage-adapter.ts`: `chromeStorageAdapter: AuthStorage` over `browser.storage.local`
  (survives restarts). Keys are namespaced by the supabase-js `storageKey`.
- `src/lib/supabase.ts`:
  - Each entrypoint calls `createMarkMeClient({ url, anonKey, storage: chromeStorageAdapter, flowType: 'pkce', detectSessionInUrl: false, autoRefreshToken: true })` with **no `lock` option** (auth-js is lockless since 2.107; S0 Q5)
    once **per surface** (module scope of that entrypoint; not shared across surfaces).
  - Surfaces subscribe to `browser.storage.onChanged` to call `supabase.auth.getSession()` and
    re-render when another surface signs in or out.
- `src/lib/messages.ts`: a typed message union handled in `background.ts`:
  - `{ type: 'auth:google' }` → runs the S0 Q1 flow and returns `{ ok } | { error }`.
  - M5 adds `preview:request`, `preview:refresh`.
- **Auth UI** (`features/auth/`):
  - `SignInForm`, `SignUpForm` (zod: email, password ≥ 8; errors via `aria-describedby`; submit
    disabled while pending).
  - `GoogleButton`.
  - `ConfirmEmailNotice` (A7 option (a), S0 Q3): shown after sign-up (no session is returned) and
    when sign-in fails with `email_not_confirmed`. Resend uses
    `supabase.auth.resend({ type: 'signup', email })` with a 60 s cooldown. It is a `role="status"`
    element. There is no in-app unverified banner, because an unconfirmed user cannot hold a session.
  - `AccountMenu` (sign out → `supabase.auth.signOut()`, which clears the storage keys; verify they
    are gone).
- The popup shows `SignIn` when signed out and a placeholder "Save" view otherwise (built in M5).
  The side panel uses the same gate.
- **Design system basics** (frontend-design + impeccable skills, run before writing UI):
  - `styles/tokens.css`: CSS custom properties for color (semantic: `--bg`, `--fg`, `--muted`,
    `--accent`, `--danger`, `--focus`), spacing, radius, type scale and motion.
    - Light/dark via `prefers-color-scheme` and a `data-theme` override.
    - Every text/background pair is checked for AA.
  - Components in `src/ui/`: `Button`, `IconButton`, `TextField`, `Textarea`, `Select`, `Banner`,
    `Spinner`, `Dialog` (native `<dialog>`), `Toast`, `VisuallyHidden`.
  - **No CSS framework (approved, A9).** Reason: keep the popup bundle small for the 300 ms
    budget. CSS modules are supported by Vite with no new dependency.
- **Data layer:** `@tanstack/react-query` (reason: request caching, infinite queries for M6,
  invalidation for M7; would otherwise be hand-rolled). One `QueryClient` per surface.
- **Supabase dashboards** (local `config.toml` + Cloud):
  - Google provider enabled.
  - Redirect allow-list includes `https://<ext-id>.chromiumapp.org/**`.
  - "Confirm email" **on** (A7 (a)); autoconfirm off.
  - Local email testing through the bundled mail catcher (Mailpit/Inbucket on `:54324`).
- **Playwright harness** (`e2e/fixtures.ts`):
  - `chromium.launchPersistentContext('', { channel: 'chromium', args: ['--disable-extensions-except=…', '--load-extension=…'] })`.
  - Read the extension ID from the service worker URL.
  - `global-setup.ts` creates a confirmed test user through the Admin API using the service-role key
    (test env only).
  - The smoke test opens `chrome-extension://<id>/popup.html`, signs in, and sees the signed-in view.

**Tests**
- Component tests:
  - SignIn/SignUp validation (empty, bad email, 7-char password), submit success/failure.
  - Confirm-email notice after sign-up and on `email_not_confirmed`; resend cooldown.
  - Sign-out clears storage (`fakeBrowser`).
  - A `vitest-axe` assertion on each form.
- Adapter tests: get/set/remove against `fakeBrowser.storage.local`.
- Background message handler: `auth:google` with mocked `identity.launchWebAuthFlow` and a mocked
  client.
- E2E: sign-in smoke in CI.
- Manual (recorded in the PR): Google flow end-to-end; close and reopen Chrome → still signed in.

**Task breakdown**

| ID | Task |
| --- | --- |
| M4-T1 | WXT manifest: pinned key, permissions, host permissions from env, entrypoints (popup, sidepanel, background) |
| M4-T2 | `chrome.storage` adapter + per-surface client + storage-change sync + tests |
| M4-T3 | Design tokens, themes, base UI components + axe tests (frontend-design/impeccable) |
| M4-T4 | Sign-up / sign-in forms + auth gate in popup and side panel + tests |
| M4-T5 | Confirm-email notice + resend (A7 (a), S0 Q3) + tests |
| M4-T6 | Google sign-in via background message + Supabase/Google config docs + tests |
| M4-T7 | Sign-out + session restore + lockless refresh across surfaces (S0 Q5) + tests |
| M4-T8 | TanStack Query setup per surface |
| M4-T9 | Playwright harness + sign-in smoke + `e2e` CI job |

**Exit verification**
```bash
pnpm --filter @markme/extension test     # component + axe tests
pnpm --filter @markme/extension e2e      # sign-in smoke (also in CI)
```
Manual checklist: Google sign-in works; Chrome restart keeps the session; sign out removes the
`sb-*` keys from `chrome.storage.local`; the whole flow works by keyboard.

**Open items for `/clarify`**
- Resolved by S0 (§2.4): US-1 behavior (A7 (a)) and linking (same `user_id`).
- Theme toggle in the UI vs system-only.

---

### M5. Save flow + previews (UI)

**Depends on:** M3, M4 · **Covers:** US-4, US-5, US-6, US-8, US-9, US-10, D3, D4

**Spec input seed**
> From the popup, a signed-in person saves the current page with one click, or pastes any web
> link. While saving they can choose a folder, add existing or new tags and write their own short
> description. The item appears at once and its preview (title, description, image, site, type)
> fills in a moment later, even if they close the popup. If the preview can't be fetched, the item
> is still saved with a sensible title and a type-specific placeholder image. Saving a link that is
> already saved opens the existing item with an "Already saved" notice. Any preview can be refreshed
> on demand. The popup is ready to save in under 300 ms.

**Technical design**
- **New migration `…_save_item.sql`:**
  ```sql
  create function public.save_item(p_url text, p_normalized_url text, p_folder_id uuid default null,
                                   p_tag_names text[] default '{}', p_note text default null)
  returns table (item_id uuid, already_saved boolean)
  language plpgsql security invoker set search_path = '' as $$ … $$;
  ```
  - Insert into `items` (title defaults to the hostname so US-9 holds even before the preview
    returns) with `on conflict (user_id, normalized_url) do nothing returning id`.
  - If no row came back, select the existing id and return `already_saved = true`, ignoring the
    tags/note passed. Proposed: don't merge; clarify.
  - For each trimmed tag name: `insert into tags(name) … on conflict (user_id, lower(name)) do nothing`.
    The conflict target must match the `tags_user_name_uq` index expression exactly; add a comment
    in the migration and a pgTAP case.
    then select ids by `lower(name)`, then insert into `item_tags`.
  - Reasons: one transaction (no half-saved item), and PostgREST `upsert` can't target an
    expression index. `security invoker` keeps RLS in force. pgTAP tests cover new, duplicate,
    tag reuse case-insensitively, cross-user isolation, and an invalid folder (FK error).
  - **(approved, A2)** It is not in the PRD, but it implements D3/US-6 safely.
- **`favicon_url` column (approved, A1):** PRD 6 has no favicon field, but US-9 needs "the site's
  favicon on top". It is filled by the preview API (see M3 `previewResponse.faviconUrl`). Without it
  the alternative is the Chrome `favicon` permission (`_favicon/` URLs), which widens permissions.
  Proposed: add the column in M1 so no extra migration is needed.
- **Shared data functions** `packages/domain/src/data/items.ts`:
  - `saveItem(client, input)`, `applyPreview(client, itemId, preview)`, `markPreviewFailed(client, itemId)`,
    `getItem(client, id)`, `listStalePending(client, olderThanMs)`.
  - Reason: v2/v3 reuse the same rules (constitution II). These are plain functions that take a
    client, not a new abstraction.
- **Popup save view** (`features/save/`):
  - On open:
    - `browser.tabs.query({ active: true, currentWindow: true })`. The URL is available because the
      user invoked the action (`activeTab`).
    - Prefill the URL field.
    - The **Save** button is enabled as soon as the URL is known. Folder and tag lists load in
      parallel and never block the button.
  - The paste field validates with `normalizeUrl`. Non-http(s) URLs (`chrome://`, `file://`) show
    "This page can't be saved".
  - `FolderSelect` (from the `folders` query), `TagInput` (combobox with autocomplete over `tags`;
    Enter/comma creates a chip; keyboard and ARIA combobox pattern), `NoteField` with a 1000-char
    counter.
  - Submit:
    1. `saveItem`.
    2. If `already_saved`, show the existing item card with an "Already saved" banner and a
       "View in library" button that opens the side panel at that item via
       `browser.sidePanel.open({ windowId })` + message.
    3. Otherwise show the item card in `pending` and send `{ type: 'preview:request', itemId }` to
       the background worker.
- **Background preview job** (`background.ts`):
  1. On `preview:request` / `preview:refresh`, read the session from its own client.
  2. Get the item.
  3. `fetch(PREVIEW_API_URL + '/v1/preview', { body: { url, force }, headers: { authorization } })`.
  4. Parse with `previewResponse`.
  5. `applyPreview` sets `preview_status = 'ok'` and `preview_fetched_at = now()`.
  - On any failure, `markPreviewFailed` (`status = 'failed'`, title stays the hostname).
  - Afterwards, broadcast `{ type: 'items:changed', ids }`. M7 formalizes the broadcast; M5 starts
    it in `src/lib/broadcast.ts` using `BroadcastChannel('markme')`.
  - The worker stays alive during the fetch (an extension event plus an in-flight fetch keeps an MV3
    worker running well past 5 s).
- **Stale pending retry:** when the popup or side panel loads, query items with
  `preview_status = 'pending' and created_at < now() - interval '2 minutes'` (max 5) and send
  `preview:request` for each.
- **Preview card** (`features/item/PreviewCard.tsx`):
  - Shows thumbnail or placeholder, title, description (2-line clamp), site name, type badge, and
    a refresh `IconButton` with `aria-label`.
  - Pending state: placeholder + spinner + `aria-busy`.
  - Failed state: placeholder + "Preview unavailable".
  - `<img onError>` swaps to the placeholder.
  - The favicon is an overlaid 16 px `<img>` that hides itself on error.
  - `embed_html` (YouTube iframe) is **not rendered in the popup**. In M6 detail it renders only
    from the server template in a sandboxed `<iframe>`. Extension CSP `frame-src` needs the YouTube
    nocookie origin; that is decided in the M6 plan.
- `public/placeholders/{article,video,image,post,link}.svg`: designed per the token palette and
  readable in both themes.
- **Refresh (US-10):** sends `preview:refresh` with `force: true`. The API's force limiter applies,
  and a 429 shows a "Try again later" toast. The stored data is overwritten only on success.
- **Perf** `scripts/perf-popup.mjs`:
  - Uses the Playwright extension fixture.
  - 10 runs, each: open `popup.html`, then measure `performance.now()` at
    `performance.mark('save-ready')` (set when the Save button becomes enabled).
  - Prints the median and fails if ≥ 300 ms.
  - Keep the popup entry lean: lazy-load `TagInput` suggestions, no heavy dependencies.

**Tests**
- pgTAP `080-save-item.test.sql` (cases listed above).
- Domain data function tests with a mocked client.
- Component tests:
  - Save current tab, paste invalid URL, paste valid URL, folder+tags+note submit.
  - Already-saved path.
  - Note > 1000 blocked.
  - Pending → ok update on broadcast.
  - Failed shows placeholder.
  - Broken `image_url` → placeholder.
  - Refresh button sends the message; 429 toast.
  - axe on the save view and card.
- Background tests: success writes `ok`; API 5xx → `failed`; invalid response shape → `failed`;
  popup closed (no listener) still completes.
- E2E, two cases, both in CI, no public network needed:
  - **Failure path (real preview API):** save a page from a local fixture server. It is on
    loopback, so the API blocks it, and the expected result is **`failed` + placeholder**. This
    proves "save never blocked by preview failure".
  - **Happy path (stub preview API):** a second Playwright project builds the extension with
    `WXT_PREVIEW_API_URL` pointing at `e2e/stub-preview-api.ts`, a tiny local server that returns
    a fixed valid `previewResponse`. Expected result: **`ok`** with title and thumbnail. The stub
    exists only in `e2e/` and is never part of the preview API.

**Task breakdown**

| ID | Task |
| --- | --- |
| M5-T1 | `save_item` migration + pgTAP + regenerated types |
| M5-T2 | Domain data functions + tests |
| M5-T3 | Popup save view: current tab + paste + validation + perf mark |
| M5-T4 | Folder select + tag combobox + note field + tests |
| M5-T5 | Already-saved flow + open in side panel |
| M5-T6 | Background preview job + message protocol + broadcast + tests |
| M5-T7 | Preview card + placeholders + favicon + image fallback + tests |
| M5-T8 | Refresh + stale-pending retry + tests |
| M5-T9 | E2E save step + `perf-popup` script (CI job; median < 300 ms) |

**Exit verification**
```bash
pnpm db:test && pnpm --filter @markme/extension test && pnpm --filter @markme/extension e2e
node scripts/perf-popup.mjs        # median < 300 ms
```
Manual: save, then close the popup at once; reopen the side panel and see `ok`/`failed`, never stuck
at `pending`.

**Open items for `/clarify`**
- Does re-saving merge the new tags/note into the existing item (proposed: no)?
- Stale threshold (2 min) and retry cap.
- `favicon_url`.
- Popup layout (full form vs. "Save" + expandable options).

---

### M6. Library + search (UI)

**Depends on:** M5 · **Covers:** US-11, US-12, US-13, US-14, D5

**Spec input seed**
> In the side panel, a person browses their saved items newest first with endless scrolling, filters
> by a folder and by one or more tags, and searches by text across titles, descriptions, their notes,
> links and tag names, with the best matches first and filters still applied. Opening an item lets
> them visit the original link, edit the title and their note, change its folder, edit its tags,
> and delete it after confirming. Every view has clear loading, empty and error states. The first
> page appears within a second and searches return within half a second on a 10,000-item library.

**Technical design**
- Side panel `App.tsx`: a view state machine `{ view: 'library' } | { view: 'item', id } | { view: 'manage' }`
  (`manage` is filled in M7). No router dependency. Back button and `Escape` return to the library;
  focus is restored to the originating card.
- `features/library/`:
  - `useLibraryQuery({ q, folderId, tagIds })` = `useInfiniteQuery` calling `rpc('search_items', { p_query, p_folder_id, p_tag_ids, p_limit: 20, p_offset })`.
    `getNextPageParam` = offset + 20 while the page is full.
  - `SearchBox`: debounced 250 ms; `/` focuses it; `Escape` clears.
  - `FilterBar`: folder select + tag multi-select chips. Filter state is persisted in
    `chrome.storage.session` so reopening the panel keeps it.
  - `ItemList`: `IntersectionObserver` sentinel for the next page. It is a semantic `<ul>`, and
    cards are links/buttons in tab order.
  - States:
    - Initial skeleton.
    - Empty library ("Save your first link" + hint).
    - Empty search ("No results for …" + clear filters).
    - Error with retry.
    - "Loading more" at the end.
  - Search result highlighting is optional (via `ts_headline`); proposed: skip in v1.
- `features/item/ItemDetail.tsx`:
  - Open link: `<a target="_blank" rel="noopener noreferrer">`.
  - Edit title and note, with a zod `itemUpdate` form.
  - Folder select.
  - Tag editor: the same combobox as M5. Diff → insert/delete `item_tags`; new names → create tags
    first.
  - Delete: `Dialog` with explicit confirm and focus trap. On delete, return to the list.
  - Domain data functions: `updateItem`, `setItemTags`, `deleteItem`.
  - After any mutation: invalidate the `['items']` queries and broadcast.
  - Embedded YouTube player only if the M6 plan accepts the CSP change; otherwise the thumbnail
    links out.
- **Seed** `packages/database/scripts/seed-10k.sql`:
  - Creates a perf user.
  - 50 folders, 200 tags, 10,000 items via `generate_series` with varied titles/descriptions from
    word lists, about 3 tags per item.
  - Run with `psql` against local only.
- **Perf** `scripts/perf-search.mjs`:
  - Signs in as the perf user (anon key), then runs `search_items` 10× for each of: first page no
    query, query `"react hooks"`, query + folder, query + 2 tags.
  - Prints medians. Fails if the first page is ≥ 1000 ms or any search is ≥ 500 ms.
  - Optionally checks `explain analyze` to confirm the GIN index is used.

**Tests**
- Component tests:
  - List renders pages and requests the next page on scroll.
  - Search debounce.
  - Filter combination passes the right RPC params.
  - Empty/error states.
  - Detail edit saves.
  - Tag diff calls the correct inserts/deletes.
  - Delete confirm and cancel paths.
  - Keyboard: `/` focus, Escape back, focus restore.
  - axe on list and detail.
- pgTAP: pagination and filter cases from M1 `070` already exist. Add one for `p_offset` beyond the
  end returning empty.
- E2E: extend the smoke so that after the save, searching finds the item.

**Task breakdown**

| ID | Task |
| --- | --- |
| M6-T1 | Side panel shell + view state + keyboard/focus handling |
| M6-T2 | Infinite list via `search_items` + states + tests |
| M6-T3 | Search box + filter bar + persisted filter state + tests |
| M6-T4 | Item detail: view, open link, edit title/note + tests |
| M6-T5 | Folder change + tag editing + domain functions + tests |
| M6-T6 | Delete with confirm dialog + tests |
| M6-T7 | 10k seed + `perf-search` script + results in PR |
| M6-T8 | E2E search step |

**Exit verification**
```bash
pnpm --filter @markme/extension test && pnpm --filter @markme/extension e2e
psql "$LOCAL_DB_URL" -f packages/database/scripts/seed-10k.sql
node scripts/perf-search.mjs       # first page < 1 s, search < 500 ms (medians of 10)
```

**Open items for `/clarify`**
- Result highlighting.
- Embedded player in detail.
- Whether filters persist per session or permanently.

---

### M7. Folders + tags management (UI)

**Depends on:** M6 · **Covers:** US-15, US-16

**Spec input seed**
> A person can create, rename and delete folders, and rename and delete tags, from the side panel.
> Deleting a folder never deletes its items; they move to "no folder". Deleting a tag removes it
> from every item. Names must be unique per person regardless of case, with a clear message when
> they're not. After any change, everything open (popup and side panel) shows the new state without
> a manual reload.

**Technical design**
- `features/folders/FolderManager.tsx` and `features/tags/TagManager.tsx`, reached through the
  `manage` view.
  - Each is a list with inline rename (Enter saves, Escape cancels), "New folder" (tags are still
    created on the fly; a manual "New tag" is optional), and delete.
  - Each row shows its item count. Counts come from a small RPC `folder_tag_counts()` or a grouped
    select via PostgREST (`items(count)`); decide in the M7 plan, preferring no new RPC.
- Delete confirm text includes the count ("12 items will move to No folder" / "Removed from 7
  items").
- Errors: Postgres `23505` (unique violation) → "A folder named 'X' already exists". Mapping lives
  in `packages/domain` (`mapDbError`).
- Domain data functions: `createFolder`, `renameFolder`, `deleteFolder`, `renameTag`, `deleteTag`.
- **Cross-surface invalidation:** `src/lib/broadcast.ts` exposes
  `publish({ type: 'folders:changed' | 'tags:changed' | 'items:changed' })`. Each surface subscribes
  and maps the event to `queryClient.invalidateQueries`:
  - folders → `['folders']` and `['items']`.
  - tags → `['tags']` and `['items']`, because tag names appear on cards.
  - `BroadcastChannel` needs no permission or dependency. **Roles:** the service worker only
    *publishes* (after preview jobs), and the popup and side panel *subscribe*. Nothing relies on a
    sleeping worker receiving a message. Popup/side panel → worker requests use
    `runtime.sendMessage`, which wakes the worker. Verify in S0 Q5 that a worker-side publish reaches
    open pages.
- Deleting the folder or tag that is currently a library filter clears that filter.

**Tests**
- Component tests for each action:
  - Create, rename, rename conflict message, delete confirm and cancel, for both folders and tags.
  - Count text.
  - Filter cleared after deleting the active one.
  - axe.
- Broadcast test: a publish in one `QueryClient` triggers invalidation in another, using two
  `BroadcastChannel` instances in jsdom.
- The DB behavior (set null / cascade) is already covered by M1 pgTAP.

**Task breakdown**

| ID | Task |
| --- | --- |
| M7-T1 | Broadcast module + per-surface subscription + tests (and migrate M5/M6 ad-hoc invalidation to it) |
| M7-T2 | Domain functions + `mapDbError` + tests |
| M7-T3 | Folder manager (create/rename/delete + counts) + tests |
| M7-T4 | Tag manager (rename/delete + counts) + tests |
| M7-T5 | Filter cleanup on delete + popup folder/tag lists refresh + tests |

**Exit verification:** `pnpm --filter @markme/extension test`. Manual: with the popup and side panel
both open, rename a folder in the side panel; the popup's folder list updates.

**Open items for `/clarify`**
- Whether "New tag" exists outside of the save/edit flows.
- Folder sort order (proposed: alphabetical).

---

### M8. Hardening + release

**Depends on:** M7 · **Covers:** US-7 (optional), E2E, perf, a11y audit, README, release

**Spec input seed**
> Finish v1: optionally let people right-click a page, link or image and save it to MarkMe; make
> sure the full journey (sign in, save, search) is covered by an automated end-to-end test; audit
> accessibility and speed against the agreed budgets; build a production version that talks to the
> hosted database and preview service without containing any secret; publish it as a downloadable
> release with clear install steps, and document the project with setup instructions, an
> architecture diagram and screenshots.

**Technical design**
- **Context menu (US-7):**
  - `runtime.onInstalled` → `contextMenus.create({ id: 'save', title: 'Save to MarkMe', contexts: ['page','link','image'] })`.
  - On click, the URL is `info.linkUrl ?? info.srcUrl ?? info.pageUrl`. Reject anything other than
    http(s) (`data:`, `blob:`, `chrome:`).
  - Then `saveItem` → preview job (same as M5).
  - Feedback through `chrome.action.setBadgeText`/`setBadgeBackgroundColor` (✓ / "!" / "="),
    cleared after 3 s. No `notifications` permission.
  - If signed out, show the badge "!" and call `chrome.action.openPopup()` where supported (Chrome
    127+); otherwise only the badge.
- **E2E final** `smoke.spec.ts`: sign in → save a fixture page → wait for `failed`/`ok` → search by a
  word in its title → result visible → open detail. Runs in CI on every PR.
- **A11y audit:**
  - axe run on every view in Playwright via `@axe-core/playwright` (reason: full-page checks the
    component tests can't do).
  - A manual keyboard checklist: tab order, focus visible, dialogs trap and restore focus, combobox
    keys, `Escape` paths.
  - Contrast table for both themes, recorded in `docs/a11y-audit.md`.
- **Perf check:** rerun `perf-popup.mjs` and `perf-search.mjs` with the production build. Record
  the numbers in the README.
- **Production config:**
  - `.env.production` (git-ignored) with Cloud Supabase URL + anon key + Cloud Run URL. The release
    workflow gets them from GitHub Actions **variables** (they are public values) and builds with
    `wxt build --mode production`.
  - Cloud Run `CORS_ORIGINS` = `chrome-extension://<pinned-id>`.
  - Supabase Cloud Auth: Site URL, redirect allow-list (`https://<id>.chromiumapp.org/**`), Google
    provider client ID/secret (stored in Supabase only), "Confirm email" on (A7 (a)).
- **Bundle secret check** `scripts/check-bundle-secrets.mjs`:
  - Scans `.output/chrome-mv3/**` for the env var name `SERVICE_ROLE`, the literal
    `"role":"service_role"` inside any base64url JWT payload found by regex, and `sb_secret_`
    prefixes.
  - Exits non-zero on a match. Runs in CI (`bundle-secrets` job) and in `release.yml`.
- **Release** `release.yml` on tag `v*`: install → test → prod build → bundle check → `wxt zip` →
  `softprops/action-gh-release` (or `gh release create`) attaching `markme-<version>-chrome.zip`.
- **README:**
  - What it is and screenshots (popup, side panel light/dark, detail).
  - Mermaid architecture diagram: Extension (popup / side panel / worker) → Supabase (Auth, Postgres
    + RLS) and → Preview API (Cloud Run) → the internet, with the SSRF guard noted.
  - Local setup (`pnpm dev`), tests, env vars, deploy notes.
  - Install from release (load unpacked).
  - "Demo is down?": Supabase free projects pause after inactivity; restore from the dashboard.
  - Links to PRD/PLAN/this doc.

**Task breakdown**

| ID | Task |
| --- | --- |
| M8-T1 | Context menu save (page/link/image) + badge feedback + tests (optional, US-7) |
| M8-T2 | E2E final smoke (sign in → save → search → detail) |
| M8-T3 | `@axe-core/playwright` page checks + keyboard checklist + `docs/a11y-audit.md`; fix findings |
| M8-T4 | Perf rerun on prod build; fix regressions; record numbers |
| M8-T5 | Production env wiring + Cloud Run CORS + Supabase Cloud auth checklist |
| M8-T6 | `check-bundle-secrets.mjs` + CI job |
| M8-T7 | `release.yml` + first `v1.0.0` release |
| M8-T8 | README (diagram, screenshots, setup, install, resume-paused-project) |

**Exit verification:** PRD 7.7 definition of done:
- [ ] US-1–US-16 + US-1b accepted (traceability matrix §5, each with a test or a manual check recorded).
- [ ] RLS + SSRF suites green in CI.
- [ ] Fresh clone → `pnpm dev` works.
- [ ] README with setup, architecture diagram, screenshots.
- [ ] GitHub release zip installs via "Load unpacked" and works against the cloud stack.

---

## 4. Decisions (all approved by Mostafa, 2026-10-18)

| # | Proposal | Where | Why | Rejected alternative |
| --- | --- | --- | --- | --- |
| A1 | Add `items.favicon_url`, filled by the preview API | M1/M3/M5 | US-9 requires a favicon; the alternative needs the extra `favicon` permission | No favicon overlay; placeholder only |
| A2 | `save_item` RPC (atomic insert + tag upsert + links) | M5 | Atomic save; PostgREST can't upsert on `lower(name)` | Multi-request client save, with partial-failure risk |
| A3 | Tag filter = item has **all** selected tags | M1/M6 | Narrows results as tags are added; usual expectation | ANY |
| A4 | FTS config `simple` (no stemming) | M1 | Works for mixed English/Arabic content; `english` stems English only | `english` |
| A5 | Root URL normalizes without the trailing slash; URLs with credentials are rejected | M2 | Consistent with the "remove trailing slash" rule; avoids storing passwords | Keep root `/`; strip credentials |
| A6 | `embed_html` built only from server templates (YouTube); X/Instagram embeds `null` | M3 | No untrusted HTML; MV3 pages can't run provider scripts anyway | Sanitized provider HTML |
| A7 | US-1 fallback if Supabase can't allow unverified sign-in (S0 Q3) | M4 | The platform may not support the PRD behavior | Option (a): confirm before first sign-in |
| A8 | `alarms` permission only if S0 Q5 shows the worker must refresh tokens | M4 | Extra permission beyond PRD 7.2 | Not added |
| A9 | No CSS framework; CSS variables + CSS modules | M4 | Popup < 300 ms; no new dependency | Tailwind |
| A10 | Re-saving an existing URL does not merge new tags/note | M5 | Simple, matches D3 "opens the existing item" | Merge |
| A11 | Manual `db:push` to Supabase Cloud (no CI auto-migrate) | M1 | No stored DB password in CI; v1 scale | CI job on `main` |
| A12 | Add `tags.created_at` (not in PRD 6) | M1 | Stable sort in the tag manager; no cost | Omit; sort tags by name |

A1, A3 and A7 are in PRD v1.1. S0 Q3 showed Supabase cannot allow unverified password sign-in, so
A7 option (a) applies; the constitution was amended to match (v1.1.1, Auth line).
S0 Q5 showed the `alarms` permission is not needed (A8: not added). The rest go into the
milestone specs as written.

---

## 5. Traceability matrix

| Requirement | Milestone · tasks | Proof |
| --- | --- | --- |
| US-1 Sign up | M4-T4, M4-T5 | `SignUpForm.test.tsx`, confirm-notice tests, S0 Q3 |
| US-1b Google sign-in | S0 Q1–Q4, M4-T6 | background handler test, manual Google check |
| US-2 Sign in/out, persistence | M4-T4, M4-T7, M4-T9 | E2E sign-in, sign-out storage test, manual restart |
| US-3 `chrome.storage` session | M4-T2 | adapter tests |
| US-4 Save current page | M5-T3, M5-T6, M5-T9 | save component tests, E2E save |
| US-5 Save pasted URL | M2-T1, M5-T3 | `normalize.test.ts`, invalid URL test |
| US-6 Organize on save | M5-T1, M5-T4 | `080-save-item.test.sql`, tag combobox tests |
| US-7 Context menu (optional) | M8-T1 | context menu tests |
| US-8 Preview display | M3-T4–T6, M5-T7 | parser/oEmbed tests, `PreviewCard` tests |
| US-9 Failed preview | M3-T6, M5-T6, M5-T7 | background `failed` tests, placeholder tests, E2E (loopback → failed) |
| US-10 Refresh | M3-T7, M5-T8 | force-limiter test, refresh tests |
| US-11 List | M1-T6, M6-T2 | `070-search.test.sql`, list tests |
| US-12 Filter | M1-T6, M6-T3 | filter pgTAP + component tests |
| US-13 Search | M1-T6, M6-T3, M6-T8 | ranking pgTAP, E2E search |
| US-14 Item detail | M6-T4–T6 | detail tests |
| US-15 Folders | M1-T3/T4, M7-T3 | `030`/`050` pgTAP, folder manager tests |
| US-16 Tags | M1-T3/T4, M5-T4, M7-T4 | `040`/`060` pgTAP, tag manager tests |
| D1 One folder, many tags | M1-T4 | schema + `050`/`060` |
| D2 Generic metadata + oEmbed | M3-T4, M3-T5 | parser + oEmbed tests |
| D3 No duplicates | M1-T4, M2-T1, M5-T1, M5-T5 | unique constraint test, normalizer, already-saved test |
| D4 Preview lifecycle (on save, refresh, stored, 24h cache) | M3-T6, M3-T7, M5-T6, M5-T8 | cache + limiter tests |
| D5 FTS | M1-T6 | `070-search.test.sql` |
| D6 No Realtime in v1 | all | no Realtime subscription in code (review check) |
| PRD 6 domain model | M1 | `010-schema.test.sql` |
| PRD 7.2 permissions | M4-T1, M8-T1 | manifest review in PR |
| PRD 7.3 SSRF rules (each) | M3-T2, M3-T3, M3-T7 | SSRF suites (one test per rule) |
| PRD 7.4 RLS + ownership | M1-T2–T5 | pgTAP two-user matrix |
| PRD 7.5 tests | M1, M2, M3, M4–M8 | as above; CI jobs §1.6 |
| PRD 7.6 UI/UX (300 ms, states, a11y, themes) | M4-T3, M5-T9, M6-T2, M8-T3/T4 | perf scripts, axe tests, audit doc |
| PRD 11 perf budgets | M5-T9, M6-T7, M8-T4 | `perf-popup.mjs`, `perf-search.mjs` |
| Secrets hygiene | M0-T8/T9, M8-T6 | gitleaks, bundle secret check |

## Changelog
- v1.2 (2026-10-18): §4 decisions approved; S0 results for Q3–Q6 (§2.4) applied to M3/M4 (lockless refresh, no `alarms`, confirm-before-sign-in, tokenless Instagram, `publish.x.com`). Q1/Q2 pending a manual run.
- v1.1 (2026-10-17): applied plan review (Cursor, GLM 5.2 Max). Changes:
  - item_tags select/delete check both sides.
  - Teredo/NAT64 ranges added; the single deadline for the whole redirect chain is now explicit.
  - JWKS test seam; post-deploy smoke step.
  - `contextMenus` permission fixed in M4.
  - Happy-path E2E with a stub preview API.
  - BroadcastChannel roles clarified.
  - ON CONFLICT and tag-filter notes; IP-literal assertion; A12 added.
- v1.0 (2026-10-17): first draft covering M0–M8, spike S0, approvals list and traceability.
