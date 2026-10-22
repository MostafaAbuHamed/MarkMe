---
description: "Task list for M2 Domain Package"
---

# Tasks: M2 Domain Package

**Input**: design documents in `specs/003-m2-domain-package/`. Read these before starting a task:

- [spec.md](spec.md): US1–US4, FR-001–FR-020, SC-001–SC-006
- [plan.md](plan.md): deviations 1–6
- [research.md](research.md): R1–R12
- [data-model.md](data-model.md): every rule and limit
- [contracts/domain-package.md](contracts/domain-package.md): names, signatures, files
- [quickstart.md](quickstart.md): V1–V7

**Prerequisites**: constitution v1.1.3. M1 is merged on `main`. The spec requires table-driven
tests (FR-019) and a coverage gate (FR-020), so every code task includes its tests.

## How every code task runs

Each code task is one red → green → commit loop:

1. **Test first.** Write the test file listed under _Test first_. Run it with
   `pnpm --filter @markme/domain exec vitest run <test file>`. It must fail, because the module
   or export does not exist yet.
2. **Implement.** Write the files under _Implement_ until that test passes.
3. **Done check.** Run the commands under _Done when_. All must pass.
4. **Commit.** Use the message given; it ends with the task id. Every commit is green.

Rules for all tasks:

- All paths are under `packages/domain/` unless they start with `/`.
- Non-interactive shells start with `source ~/.nvm/nvm.sh && nvm use`.
- Use `it.each` tables. Each row is `[input, expected]` or an object with a `name`, and the test
  title prints the input (`it.each(rows)('%s → %s', …)`).
- Never weaken, skip or `.only` a test. Never lower a coverage threshold (constitution III).
- Plain exported functions and zod schemas. No classes and no new abstractions beyond the
  contract.
- Export every new public name from `src/index.ts`, except the client, which is exported only
  from `src/client/index.ts`.

## Workflow (A36)

- **One task = one commit.** Conventional Commits, scope `domain`, for example
  `feat(domain): add normalizeUrl (T003)`.
- **One PR per user story**, into the milestone branch `003-m2-domain-package`. All five
  required CI checks must be green before merge. Before opening each PR, review it with the guard
  skills: `clean-code-guard` for `src/**/*.ts`, `test-guard` for `*.test.ts`, and `docs-guard`
  for docs.

  | PR  | Branch                       | Tasks                          | Proves              |
  | --- | ---------------------------- | ------------------------------ | ------------------- |
  | 1   | `m2/us1-link-normalization`  | T001–T004                      | US1, coverage gate  |
  | 2   | `m2/us2-link-classification` | T005–T006                      | US2                 |
  | 3   | `m2/us3-validation-rules`    | T007–T011                      | US3                 |
  | 4   | `m2/us4-client-factory`      | T012–T015 (T015 has no commit) | US4, milestone exit |

- PRs run **in order**. Each story branch starts from the updated `003-m2-domain-package` after
  the previous PR merges. All stories edit `src/index.ts` and `package.json`, so parallel
  branches would conflict.
- After PR 4 merges and T015 passes, the milestone PR `003-m2-domain-package` → `main` is opened.
  Mostafa merges it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 = link normalization, US2 = link classification, US3 = validation rules,
  US4 = client factory

---

## Phase 1: Setup (PR 1)

**Purpose**: put the milestone branch on GitHub so story PRs can target it.

- [x] T001 Commit this task list and publish the milestone branch.
  - **Files**: `specs/003-m2-domain-package/tasks.md`, `specs/003-m2-domain-package/research.md`
    (the R4 and R11 edits made with this task list).
  - **Steps**:
    1. Commit on `003-m2-domain-package` with message `docs(m2): add M2 task list (T001)`.
    2. Check `git ls-remote --heads origin 003-m2-domain-package`. If it is empty, ask Mostafa,
       then `git push -u origin 003-m2-domain-package`. The `ci-gate` ruleset covers `NNN-*`
       branches.
    3. `git switch -c m2/us1-link-normalization`.
  - **Done when**: `origin/003-m2-domain-package` exists and includes the spec, plan and task
    commits, and the current branch is `m2/us1-link-normalization`.

---

## Phase 2: Foundational (PR 1, blocks every story)

**Purpose**: the coverage gate and the `URL` typings that every later task relies on.

- [x] T002 Add the coverage gate and the DOM lib (R10, R12).
  - **Files**: `package.json`, `vitest.config.ts`, `tsconfig.json`, `/pnpm-lock.yaml`.
  - **Implement**:
    - `pnpm --filter @markme/domain add -D -E @vitest/coverage-v8@5.0.5`. It must equal the
      `vitest` version, 5.0.5.
    - `package.json`: `"test": "vitest run --coverage"`.
    - `vitest.config.ts`: keep `include`; add
      `coverage: { provider: "v8", include: ["src/**/*.ts"], exclude: ["src/**/*.test.ts"],
thresholds: { "src/url/**": { lines: 100, branches: 100 } } }`.
    - `tsconfig.json`: add `"compilerOptions": { "lib": ["ES2023", "DOM"] }`.
  - **Test first**: none. Nothing under `src/url/` exists yet. T003 is the first task the gate
    judges.
  - **Done when**:
    - `pnpm --filter @markme/domain test` passes and prints a v8 coverage table.
    - `pnpm --filter @markme/domain typecheck` passes.
    - `git status` shows no `packages/domain/coverage/` (already git-ignored).
  - **Commit**: `build(domain): add v8 coverage gate for src/url and DOM lib (T002)`.

**Checkpoint**: the gate is wired. Every later commit runs it.

---

## Phase 3: User Story 1 - The same page is recognised as the same link (P1) 🎯 MVP

**Goal**: `normalizeUrl` and `parseUserUrl` produce the original link plus the canonical duplicate
key, or one error code (FR-001–FR-005).

**Independent test**: `pnpm --filter @markme/domain test`. The rule, tracking, edge and paste
tables pass, and `src/url/normalize.ts` and `src/url/parse-user-url.ts` show 100% lines and
branches.

- [x] T003 [US1] Implement `normalizeUrl` (A5, A21, A23–A25; R1–R4).
  - **Files**: `src/url/normalize.ts`, `src/url/normalize.test.ts`, `src/index.ts`.
  - **Test first** (`src/url/normalize.test.ts`). Five tables, then one invariant:
    1. **Rule table**, input → `normalizedUrl`:
       - `"  https://a.com "` → `https://a.com`
       - `HTTPS://Ex.COM/A` → `https://ex.com/A`
       - `https://bücher.de` → `https://xn--bcher-kva.de`
       - `https://a.com:443/x` → `https://a.com/x`
       - `http://a.com:80/x` → `http://a.com/x`
       - `http://a.com:8080` → `http://a.com:8080`
       - `https://a.com:80/x` → `https://a.com:80/x`
       - `https://a.com/x#top` → `https://a.com/x`
       - `https://a.com/x?#f` → `https://a.com/x`
       - `https://a.com/x?` → `https://a.com/x`
       - `https://a.com/x?b=2&a=1` → unchanged
       - `https://a.com/x?q=a+b&r=%20` → unchanged
       - `https://a.com/x/` → `https://a.com/x`
       - `https://a.com/` → `https://a.com`
       - `https://a.com//` → `https://a.com`
       - `https://a.com/a//` → `https://a.com/a`
       - `https://a.com/x/?a=1` → `https://a.com/x?a=1`
       - `https://:@a.com` → `https://a.com` (the parser drops empty userinfo)
    2. **Error table**, input → `error`:
       - `invalid`: `""`, `"   "`, `"not a url"`, `"https://"`, `"http://a b.com"`
       - `unsupported_scheme`: `ftp://a.com`, `javascript:alert(1)`, `mailto:a@b.com`,
         `data:text/plain,hi`, `file:///etc/passwd`
       - `has_credentials`: `https://u:p@a.com`, `https://u@a.com`
       - Order (R4): `ftp://u:p@a.com` → `unsupported_scheme`
       - Length:
         - `"https://a.com/" + "a".repeat(2034)` is OK. Assert both `url.length` and
           `normalizedUrl.length` ≤ 2048, and `normalizedUrl.length === 2048`.
         - `"https://a.com/" + "a".repeat(2035)` → `too_long`.
         - `"https://a.com/x?utm_source=" + "a".repeat(2040)` → `too_long`. The original is
           too long even though the canonical form is short.
    3. **Tracking table**: `https://a.com/x?<key>=1&id=2` → `https://a.com/x?id=2` for each of:
       - `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_foo`
       - `fbclid`, `gclid`, `dclid`, `gbraid`, `wbraid`, `msclkid`
       - `igsh`, `igshid`, `mc_cid`, `mc_eid`

       Plus:
       - `?IGSH=abc` → no query; `?UTM_Source=x&id=2` → `?id=2` (case-insensitive key)
       - position: first, middle (`?a=1&fbclid=x&b=2` → `?a=1&b=2`) and last
       - kept as written: `?utm=1`, `?xutm_source=1`, `?fbclid2=1`, `?utm%5Fsource=1`
       - `si` removed on `https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc`,
         `https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=1`,
         `https://youtu.be/dQw4w9WgXcQ?si=abc` and `https://studio.youtube.com/?si=1`
       - `si` kept on `https://a.com/x?si=1`, `https://notyoutube.com/?si=1` and
         `https://youtube.com.evil.com/?si=1`

    4. **Query table** (A25, R3):
       - empty segments dropped: `?a=1&&b=2` → `?a=1&b=2`; `?&a=1` → `?a=1`; `?a=1&` → `?a=1`;
         `?&` → no query
       - kept: `?a=`, `?a`, `?a=1&a=2`
       - `?s=a b` → `?s=a%20b` (the parser's encoding, R1)
    5. **Edge table**:
       - `http://[::1]` → `http://[::1]`
       - `http://[::1]:8080/x/` → `http://[::1]:8080/x`
       - `https://a.com/%2f//x` and `https://a.com/%2F//x` both unchanged and different
       - `https://www.a.com` stays `https://www.a.com`
       - `https://youtu.be/dQw4w9WgXcQ` ≠ `https://youtube.com/watch?v=dQw4w9WgXcQ`
       - `https://twitter.com/a` stays `https://twitter.com/a`

    Then:
    - **`url` output**: `https://a.com/x?utm_source=y#top` → `url` is
      `https://a.com/x?utm_source=y#top`, and `normalizedUrl` is `https://a.com/x`.
    - **Invariant**: for every OK row above,
      `normalizeUrl(r.normalizedUrl)` is OK with the same `normalizedUrl` (idempotent, R2), and
      `normalizedUrl` matches `/^https?:\/\//` (the M1 check, A17).

  - **Implement** (`src/url/normalize.ts`):
    - Exports: `MAX_URL_LENGTH = 2048`, `type NormalizeError`, `type NormalizeResult`,
      `normalizeUrl(input: string): NormalizeResult` (contract).
    - Steps, in order: `input.trim()` → `URL.parse` (`null` → `invalid`) → protocol check →
      credentials check → build `normalizedUrl` from parts (R1) → `url.href.length >
MAX_URL_LENGTH` → `too_long` (R4; one check caps both).
    - Tracking keys live in one `const` set plus a `utm_` prefix check. `si` is removed when
      `hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname ===
'youtu.be'`.
    - Path: `pathname.replace(/\/+$/, "")`.
    - `src/index.ts`: export `normalizeUrl`, `MAX_URL_LENGTH` and both types.
  - **Done when**: `pnpm --filter @markme/domain test` passes, and the coverage table shows
    `normalize.ts` at 100% lines and branches. `pnpm --filter @markme/domain lint` and
    `typecheck` pass.
  - **Commit**: `feat(domain): add normalizeUrl with tracking and edge-case tables (T003)`.

- [x] T004 [US1] Implement `parseUserUrl` for the paste field (A22).
  - **Files**: `src/url/parse-user-url.ts`, `src/url/parse-user-url.test.ts`, `src/index.ts`.
  - **Test first** (`src/url/parse-user-url.test.ts`), input → result:
    - **Step 1, scheme present** (normalized as written):
      - `HTTPS://A.com` → `https://a.com`
      - `ftp://a.com`, `mailto:a@b.com`, `JavaScript:alert(1)`, `about:blank`, `tel:+123`,
        `sms:1`, `data:text/html,x`, `blob:https://a.com/x`, `vbscript:x` and
        `chrome-extension://abc/x` → `unsupported_scheme`
    - **Step 2, looks like a host** (`https://` added):
      - `example.com/x?y=1` → `https://example.com/x?y=1`
      - `example.com:8080/x` → `https://example.com:8080/x`
      - `Example.COM` → `https://example.com`
      - `"  example.com/x  "` → `https://example.com/x`
      - `example.com#top` → `https://example.com`
      - `a.com?x=1` → `https://a.com?x=1`
      - `192.168.1.1:8080` → `https://192.168.1.1:8080` (blocking is M3's job)
      - `u:p@a.com` → `has_credentials`
      - `a:b.c` → `invalid` (bad port)
    - **Step 3, otherwise** → `invalid`: `localhost:3000`, `notes`, `a.com b`, `foo/bar.baz`
      (the dot is after the `/`), `""`, `"   "`
  - **Implement** (`src/url/parse-user-url.ts`): `parseUserUrl(input: string): NormalizeResult`.
    Use the two scheme regexes and the step-2 rule exactly as written in the contract. Steps 1 and
    2 call `normalizeUrl`; step 3 returns `{ ok: false, error: "invalid" }`. Export it from
    `src/index.ts`.
  - **Done when**:
    - `pnpm --filter @markme/domain test` passes with 100% for `parse-user-url.ts`; `lint` and
      `typecheck` pass.
    - **Gate proof (quickstart V1)**: comment out one step-3 row. `test` must fail on the
      `src/url/**` branch threshold. Restore the row and do not commit the change.
  - **Commit**: `feat(domain): add parseUserUrl for pasted links (T004)`.

**Checkpoint (PR 1)**: open `m2/us1-link-normalization` → `003-m2-domain-package`. US1's
independent test passes in CI.

---

## Phase 4: User Story 2 - Links are classified the same way everywhere (P2)

**Goal**: one provider detector, one YouTube id rule matching the database, and one media-type
precedence (FR-006–FR-008).

**Independent test**: `pnpm --filter @markme/domain test`. The provider, id and media-type tables
pass, and `src/url/provider.ts` shows 100%.

Branch: `m2/us2-link-classification`, from `003-m2-domain-package` after PR 1 merges.

- [x] T005 [US2] Implement `detectProvider`, `extractYouTubeId` and `YOUTUBE_ID_PATTERN` (A19,
      A26; R5, R6).
  - **Files**: `src/url/provider.ts`, `src/url/provider.test.ts`, `src/index.ts`.
  - **Test first** (`src/url/provider.test.ts`). Use the valid id `dQw4w9WgXcQ`:
    - **YouTube**: each of `youtube.com`, `www.youtube.com`, `m.youtube.com` and
      `music.youtube.com`, with each of `/watch?v=ID`, `/shorts/ID`, `/embed/ID` and `/live/ID`
      (16 rows), plus `https://youtu.be/ID` and `https://youtu.be/`.
    - **X**: `x.com`, `twitter.com`, `www.x.com`, `www.twitter.com`, `mobile.x.com` and
      `mobile.twitter.com`, each with `/a/status/1`.
    - **Instagram**: `instagram.com` and `www.instagram.com`, with `/p/abc/`, `/reel/abc/` and
      `/tv/abc/`.
    - **`null`**:
      - `https://youtube.com/`, `https://youtube.com/feed`, `https://youtube.com/watchlater`
      - `https://studio.youtube.com/watch?v=ID`, `https://notyoutube.com/watch?v=ID`
      - `https://x.com.evil.com/a`
      - `https://www.instagram.com/explore`, `https://help.instagram.com/p/abc`
      - `https://a.com`, `not a url`
    - **Id**: valid for `/watch?v=ID`, `/shorts/ID`, `/shorts/ID/`, `/embed/ID`, `/live/ID` and
      `youtu.be/ID`.
    - **`null` id**:
      - `v` of 10 or 12 characters, or with `!`
      - `/watch` with no `v`
      - `https://youtu.be/`
      - a non-YouTube link with `?v=dQw4w9WgXcQ`
    - **Pattern**: `YOUTUBE_ID_PATTERN.source === "^[A-Za-z0-9_-]{11}$"`, with a comment naming
      the M1 check `items_embed_youtube_chk` in
      `/packages/database/supabase/migrations/20261021123948_item_rules.sql`.
  - **Implement** (`src/url/provider.ts`):
    - `type Provider`, `YOUTUBE_ID_PATTERN`, `detectProvider(url: string): Provider | null` and
      `extractYouTubeId(url: string): string | null`.
    - Host lists are `const` sets matching data-model "Provider" exactly. Parse with `URL.parse`;
      `null` → `null`.
    - Export all four from `src/index.ts`.
  - **Done when**: `test` passes with `provider.ts` at 100%; `lint` and `typecheck` pass.
  - **Commit**: `feat(domain): add provider detection and YouTube id rule (T005)`.

- [x] T006 [US2] Implement `detectMediaType` (A27; R7) and add the `@markme/database` dependency
      (R9).
  - **Files**: `package.json`, `/pnpm-lock.yaml`, `src/media-type.ts`, `src/media-type.test.ts`,
    `src/index.ts`.
  - **Setup**: `pnpm --filter @markme/domain add @markme/database@workspace:*` (a runtime
    dependency, for `Enums` now and `Constants` in T007).
  - **Test first** (`src/media-type.test.ts`), input → type, one table:
    - **Step 1**:
      - `{ provider: "youtube", ogType: "article" }` → `video`
      - `{ oembedType: "video" }` → `video`
      - `{ oembedType: " VIDEO " }` → `video`
    - **Step 2**:
      - `{ provider: "x" }` → `post`
      - `{ provider: "instagram", url: "https://www.instagram.com/reel/abc/" }` → `post`
      - `{ provider: "x", oembedType: "rich" }` → `post`
    - **Step 3**:
      - `{ oembedType: "photo" }` → `image`
      - `{ contentType: "image/png" }` → `image`
      - `{ contentType: "IMAGE/PNG; charset=binary" }` → `image`
      - `{ contentType: "text/html" }` → `link`
    - **Step 4**:
      - `video.movie` and `video.other` → `video`
      - `article` and `" Article "` → `article`
      - `website`, `profile` and `music.song` alone → `link`
    - **Step 5**:
      - each of `.png .jpg .jpeg .gif .webp .avif .svg` → `image`
      - `.mp4` and `.webm` → `video`
      - `https://a.com/X.PNG` → `image`
      - `https://a.com/x?f=a.png` → `link`
      - `https://a.com/png` → `link`
    - **Ties**:
      - `ogType: "website"` + `https://a.com/v.mp4` → `video`
      - `oembedType: "rich"` + `ogType: "article"` → `article`
      - `oembedType: "rich"` alone → `link`
      - `contentType: "image/jpeg"` + `ogType: "article"` → `image`
      - `ogType: "article"` + `https://a.com/a.png` → `article`
      - `url: "not a url"` → `link`

    Default `url` is `https://a.com/page` when a row does not set one.

  - **Implement** (`src/media-type.ts`):
    - `type MediaType = Enums<"media_type">` (import type from `@markme/database`).
    - `detectMediaType(input)`, with the signature in the contract. It runs the six steps in
      data-model order and returns on the first match. The extension sets are `const` arrays.
    - Export the function and the type from `src/index.ts`.
  - **Done when**: `test`, `lint` and `typecheck` pass. The coverage gate still holds.
  - **Commit**: `feat(domain): add detectMediaType precedence (T006)`.

**Checkpoint (PR 2)**: open `m2/us2-link-classification` → `003-m2-domain-package`.

---

## Phase 5: User Story 3 - Every surface accepts and refuses the same input (P3)

**Goal**: one set of limits and zod schemas for items, folders, tags and previews, with enums
taken from the database (FR-009–FR-014).

**Independent test**: `pnpm --filter @markme/domain test`. Every at-limit row passes, every
one-over row fails, and the enum values equal `Constants`.

Branch: `m2/us3-validation-rules`, from `003-m2-domain-package` after PR 2 merges.

Test helper used in every schema test: `schema.safeParse(input)`. Assert `success` and, on
success, `data` with `toEqual`. Real v4 uuids for fixtures:
`3f2504e0-4f89-41d3-9a0c-0305e82c3301`, `6fa459ea-ee8a-4ca4-894e-db77e160355e` (R8). For 21
distinct ids, generate them in the test with `crypto.randomUUID()`. For 21 distinct tag names,
use `Array.from({ length: 21 }, (_, i) => "t" + i)`.

- [x] T007 [US3] Add `LIMITS` and the database enums (A30, A34; R9).
  - **Files**: `src/schemas/limits.ts`, `src/schemas/limits.test.ts`, `src/schemas/enums.ts`,
    `src/schemas/enums.test.ts`, `src/index.ts`.
  - **Test first**:
    - `limits.test.ts`:
      - `LIMITS` equals
        `{ title: 300, description: 1000, siteName: 200, note: 1000, url: 2048, name: 100, tagsPerItem: 20 }`
        and `Object.isFrozen(LIMITS)` is true.
      - Each value ≤ its M1 ceiling: title 500, description 2000, siteName 200, note 1000,
        url 2048, name 100. Write the ceilings as literals in the test, with a comment naming
        `item_rules.sql` and `name_rules.sql`.
    - `enums.test.ts`: for `mediaType`, `previewStatus` and `embedProvider`:
      - `schema.options` equals `Constants.public.Enums.media_type` (and the other two);
      - `expectTypeOf<z.infer<typeof mediaType>>().toEqualTypeOf<Enums<"media_type">>()`, and the
        same for the other two;
      - one value outside the list (`"audio"`, `"done"`, `"vimeo"`) fails.
  - **Implement**:
    - `src/schemas/limits.ts`: `export const LIMITS = Object.freeze({ … } as const)`, with
      `url: MAX_URL_LENGTH` imported from `../url/normalize`. One source for 2048.
    - `src/schemas/enums.ts`: `z.enum(Constants.public.Enums.<name>)` for the three.
    - Export `LIMITS`, `mediaType`, `previewStatus` and `embedProvider` from `src/index.ts`.
  - **Done when**: `test`, `lint` and `typecheck` pass.
  - **Commit**: `feat(domain): add LIMITS and enums from database Constants (T007)`.

- [x] T008 [P] [US3] Add the `httpUrl` schema and `urlErrorCode` (A33; R8).
  - **Files**: `src/schemas/http-url.ts`, `src/schemas/http-url.test.ts`, `src/index.ts`.
  - **Test first** (`http-url.test.ts`):
    - `" https://a.com/x/?utm_source=y "` → `{ url: "https://a.com/x/?utm_source=y", normalizedUrl: "https://a.com/x" }`.
    - Each error code fails, and `urlErrorCode(result.error)` returns it:
      - `not a url` → `invalid`
      - `ftp://a.com` → `unsupported_scheme`
      - `https://u:p@a.com` → `has_credentials`
      - a 2,100-character URL → `too_long`
    - `123` (not a string) fails, and `urlErrorCode` returns `null`.
    - `example.com` fails with `invalid`. The schema never adds `https://`; only `parseUserUrl`
      does.
  - **Implement** (`src/schemas/http-url.ts`):
    - `httpUrl = z.string().transform(…)`, as in R8: a `custom` issue with
      `message: code, params: { code }`, then `z.NEVER`.
    - `urlErrorCode(error: z.ZodError): NormalizeError | null` returns the first issue whose
      `params.code` is a `NormalizeError`.
    - Export both from `src/index.ts`.
  - **Done when**: `test`, `lint` and `typecheck` pass.
  - **Commit**: `feat(domain): add httpUrl schema built on normalizeUrl (T008)`.

- [x] T009 [P] [US3] Add the text schemas `note`, `title`, `folderName`, `tagName`, `tagNames`
      and `tagIds` (A28, A29; R8).
  - **Files**: `src/schemas/text.ts`, `src/schemas/text.test.ts`, `src/index.ts`.
  - **Test first** (`text.test.ts`), one `describe` per schema. Every limit comes from `LIMITS`,
    never a literal:
    - **`note`**:
      - `"a".repeat(1000)` passes; `"a".repeat(1001)` fails
      - `"  " + "a".repeat(1000) + "  "` passes (trim before length)
      - `"  hi  "` → `"hi"`; `""` and `"   "` → `null`
    - **`title`**: 300 passes, 301 fails; `"  "` → `null`.
    - **`folderName`**:
      - 100 passes, 101 fails
      - `"  Work "` → `"Work"`
      - `"a  b"` → `"a  b"` (folders keep inner spaces)
      - `"a,b"` passes
      - `"   "` and `""` fail
    - **`tagName`**:
      - `"  React   Native "` → `"React Native"`
      - `"a\t\nb"` → `"a b"`
      - `"a,b"` fails
      - 100 passes, 101 fails
      - `"   "` fails
    - **`tagNames`**:
      - `["React", "react", "Vue"]` → `["React", "Vue"]`
      - `[" React ", "REACT"]` → `["React"]`
      - `[]` → `[]`
      - 20 distinct pass; 21 distinct fail
      - 21 names where one is a case duplicate → 20 and passes (cap after dedupe)
      - `["a", " "]` fails
    - **`tagIds`**:
      - `[id1, id1, id2]` → `[id1, id2]`
      - 21 distinct fail
      - `"not-a-uuid"` fails
      - `"00000000-0000-0000-0000-000000000000"` fails (documents R8)
  - **Implement** (`src/schemas/text.ts`): the chains in R8, built from `LIMITS`. One local
    `dedupeBy(list, key)` helper is shared by `tagNames` (key `toLowerCase()`) and `tagIds`
    (identity). Export all six schemas from `src/index.ts`.
  - **Done when**: `test`, `lint` and `typecheck` pass.
  - **Commit**: `feat(domain): add note, name and tag schemas (T009)`.

- [x] T010 [US3] Add `itemCreate` and `itemUpdate` (A29, A33; FR-014). Depends on T008 and T009.
  - **Files**: `src/schemas/item.ts`, `src/schemas/item.test.ts`, `src/index.ts`.
  - **Test first** (`item.test.ts`):
    - **`itemCreate`**:
      - `{ url: "https://a.com/x?utm_source=y" }` → `{ url: { url: "https://a.com/x?utm_source=y", normalizedUrl: "https://a.com/x" } }`
      - With `folderId: id1`, `tagNames: ["A", "a"]` and `note: ""` → `folderId` kept,
        `tagNames: ["A"]`, `note: null`.
      - `{ url: "https://u:p@a.com" }` fails, and `urlErrorCode` returns `has_credentials`.
      - `folderId: "x"` fails.
      - `{ url, userId: id2 }` → output has no `userId` (stripped).
      - A missing `url` fails.
    - **`itemUpdate`**:
      - `{}` → `{}`
      - `{ folderId: null }` → `{ folderId: null }`
      - `{ title: "  " }` → `{ title: null }`
      - `{ note: "x" }` → `{ note: "x" }`
      - `{ tagIds: [id1, id1] }` → `{ tagIds: [id1] }`
      - `{ userId: id2 }` → `{}`
      - `{ url: "https://a.com" }` → `{}` (the URL is immutable after save, A15)
  - **Implement** (`src/schemas/item.ts`):
    - `itemCreate = z.object({ url: httpUrl, folderId: z.uuid().optional(), tagNames: tagNames.optional(), note: note.optional() })`.
    - `itemUpdate = z.object({ title: title.optional(), note: note.optional(), folderId: z.uuid().nullable().optional(), tagIds: tagIds.optional() })`.
    - Export `ItemCreateInput`, `ItemCreate`, `ItemUpdateInput` and `ItemUpdate`
      (`z.input`/`z.output`) next to the schemas, and all of them from `src/index.ts`.
  - **Done when**: `test`, `lint` and `typecheck` pass. Under `exactOptionalPropertyTypes`, the
    output type of `itemUpdate` has `folderId?: string | null`.
  - **Commit**: `feat(domain): add itemCreate and itemUpdate schemas (T010)`.

- [x] T011 [US3] Add `previewRequest`, `previewResponse`, `previewError` and
      `PREVIEW_ERROR_CODES` (A19, A35; R8). Depends on T005, T007 and T008.
  - **Files**: `src/schemas/preview.ts`, `src/schemas/preview.test.ts`, `src/index.ts`.
  - **Test first** (`preview.test.ts`):
    - **`previewRequest`**:
      - `{ url: "https://a.com" }` passes, and the output has `url.normalizedUrl`
      - `{ url, force: true }` passes
      - `{ url: "example.com" }` fails (`invalid`)
      - `force: "yes"` fails
    - **`previewResponse`**:
      - Minimal: `{ url: "https://a.com", mediaType: "link" }` passes.
      - Full: every field set, with `embed: { provider: "youtube", id: "dQw4w9WgXcQ" }` and
        `provider: "youtube"`, passes and is unchanged.
      - At limit: title 300, description 1000 and siteName 200 pass.
      - One over (301, 1001 and 201) each fail.
      - `imageUrl` of `javascript:x`, `imageUrl` of 2,049 characters, and `faviconUrl` of
        `https://u:p@a.com` each fail.
      - `imageUrl` `https://a.com/i.png?utm_source=x` is kept as given (not normalized).
      - `mediaType: "audio"` fails.
      - `embed.id` of `"short"` fails; `embed.provider` of `"vimeo"` fails.
      - `provider: "instagram"` passes; `provider: "vimeo"` fails.
    - **`previewError`**: each of the six codes passes; `{ error: "oops" }` fails.
      `PREVIEW_ERROR_CODES` equals
      `["invalid_url", "unauthorized", "blocked_target", "rate_limited", "fetch_failed", "timeout"]`.
  - **Implement** (`src/schemas/preview.ts`):
    - A local `webLink = z.string().max(LIMITS.url).refine(v => normalizeUrl(v).ok)`.
    - `previewResponse` follows data-model "Preview request / result / error". It uses
      `mediaType` and `embedProvider` from `enums.ts`, `YOUTUBE_ID_PATTERN` for `embed.id`, and
      `z.enum(["youtube", "x", "instagram"])` for `provider`. Add a type test asserting that enum
      equals the `Provider` type.
    - `PREVIEW_ERROR_CODES` is `as const`, and `previewError = z.object({ error: z.enum(PREVIEW_ERROR_CODES) })`.
    - Export the schemas, `PREVIEW_ERROR_CODES` and the `z.input`/`z.output` types from
      `src/index.ts`.
  - **Done when**: `test`, `lint` and `typecheck` pass.
  - **Commit**: `feat(domain): add preview request, response and error schemas (T011)`.

**Checkpoint (PR 3)**: open `m2/us3-validation-rules` → `003-m2-domain-package`.

---

## Phase 6: User Story 4 - Each app creates its own database client (P4)

**Goal**: `createMarkMeClient` on its own entry point, with fixed security options and a new
client per call (FR-015–FR-018).

**Independent test**: `pnpm --filter @markme/domain test` and `lint`. The factory tests pass, and
importing `@markme/domain` does not load `@supabase/supabase-js`.

Branch: `m2/us4-client-factory`, from `003-m2-domain-package` after PR 3 merges.

- [x] T012 [US4] Add the `./client` entry point, the `supabase-js` dependency and the isolation
      guards (A31; R11).
  - **Files**: `package.json`, `/pnpm-lock.yaml`, `eslint.config.mjs` (new),
    `src/client/index.ts` (new, a stub until T013), `src/index.test.ts`.
  - **Setup**: `pnpm --filter @markme/domain add @supabase/supabase-js@^2.118.0`. Add
    `"./client": "./src/client/index.ts"` to `exports`.
  - **Test first** (append to `src/index.test.ts`):
    - `vi.mock("@supabase/supabase-js", () => { throw new Error("supabase-js loaded by the rules entry"); })`.
    - A test that `await import("./index")` resolves and exposes `normalizeUrl`.
  - **Implement**:
    - `eslint.config.mjs`:
      `import base from "@markme/config/eslint"; export default [...base, { files: ["src/**/*.ts"], ignores: ["src/client/**"], rules: { "no-restricted-imports": ["error", { paths: [{ name: "@supabase/supabase-js", message: "Only src/client may import supabase-js (A31)." }] }] } }];`
    - `src/client/index.ts`: `export {};` placeholder, replaced in T013.
  - **Done when**:
    - `test` and `lint` pass.
    - **Guard proof** (do not commit): add `import "@supabase/supabase-js";` to `src/index.ts`.
      Both `pnpm --filter @markme/domain test` (the index test fails) and `lint` (the
      restricted-import error) must fail. Revert the line.
    - `pnpm lint` at the root still passes, so the new config does not break Turbo's lint.
  - **Commit**: `build(domain): add client subpath, supabase-js and import guard (T012)`.

- [x] T013 [US4] Implement `createMarkMeClient` and `AuthStorage` (A31; R11; constitution II).
  - **Files**: `src/client/factory.ts`, `src/client/factory.test.ts`, `src/client/index.ts`.
  - **Test first** (`src/client/factory.test.ts`). Setup:
    - Wrap the real `createClient` in a spy:
      `vi.mock("@supabase/supabase-js", async (importOriginal) => { const m = await importOriginal<typeof import("@supabase/supabase-js")>(); return { ...m, createClient: vi.fn(m.createClient) }; })`.
    - Before each test, stub `fetch` with `vi.stubGlobal("fetch", vi.fn(...))` before creating any
      client. After each, run `vi.unstubAllGlobals()` and `vi.clearAllMocks()`.
    - Use an in-memory `AuthStorage` (a `Map` behind `vi.fn` methods).
    - Use URL `https://abcdefghijklmnop.supabase.co`, key `sb-abcdefghijklmnop-auth-token`, and
      anon key `"anon"`.

    Cases:
    1. **Fixed options**: `createClient` was called with
       `(url, "anon", { auth: { storage, flowType: "pkce", autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`.
    2. **`detectSessionInUrl: true`** is passed through as `true`.
    3. **No pass-through**: with `{ ...opts, lock: vi.fn() } as never`, the `auth` object has
       exactly the five keys of case 1. In a separate statement,
       `// @ts-expect-error lock is not an option` on `createMarkMeClient({ ...opts, lock: … })`
       proves it at type level.
    4. **Read**: store an unexpired session JSON under the key. The session has `access_token`,
       `refresh_token`, `token_type: "bearer"`, `expires_in: 3600`, `expires_at: now + 3600`, and
       `user: { id: <v4>, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at }`.
       `(await client.auth.getSession()).data.session?.access_token` equals it,
       `storage.getItem` was called with the key, and `fetch` was not called.
    5. **Write**: store the same session with `expires_at` in the past. Stub `fetch` to return
       `200` with a new session JSON. After `getSession()`, `storage.setItem` was called with the
       key and a value containing the new `access_token`, and the stubbed `fetch` URL contains
       `/auth/v1/token?grant_type=refresh_token`.
    6. **Remove**: with a stored session and `fetch` stubbed to return `204`,
       `await client.auth.signOut({ scope: "local" })` calls `storage.removeItem` with the key.
    7. **No singleton**: two calls with the same options give clients that are `not.toBe` each
       other. A client created with storage A never calls storage B.

    If supabase-js needs another field in the stored session, add it to the fixture. Never
    loosen an assertion.

  - **Implement** (`src/client/factory.ts`):
    - `AuthStorage`, `CreateMarkMeClientOptions`, `MarkMeClient` and
      `createMarkMeClient({ url, anonKey, storage, detectSessionInUrl = false })`, as in the
      contract. It returns `createClient<Database>(url, anonKey, { auth: { storage, flowType: "pkce", autoRefreshToken: true, persistSession: true, detectSessionInUrl } })`.
    - Build `auth` from the destructured names only. No module-level variables.
    - `src/client/index.ts` re-exports these four names.
  - **Done when**:
    - `test`, `lint` and `typecheck` pass.
    - `grep -rn "supabase-js" packages/domain/src` matches only `src/client/` and the mock in
      `src/index.test.ts`.
  - **Commit**: `feat(domain): add createMarkMeClient factory with fixed auth options (T013)`.

**Checkpoint**: US4 proven. Phase 7 goes into the same PR 4.

---

## Phase 7: Polish & milestone exit (PR 4)

- [x] T014 [P] Update the runtime docs for M2 (constitution: update docs when behavior changes).
  - **Files**: `/CLAUDE.md`, `/README.md`.
  - **Changes**:
    - **`/CLAUDE.md` "Current state"**: add an M2 paragraph. `@markme/domain` exports the URL
      rules (`normalizeUrl`, `parseUserUrl`, provider and id helpers), `detectMediaType`,
      `LIMITS` and the zod schemas. The client factory is only at `@markme/domain/client`. The
      domain `test` script enforces 100% lines/branches on `src/url/**`. For focused runs, use
      `pnpm --filter @markme/domain exec vitest run <file>`. No app uses the exports yet.
    - **`/README.md` "Repository layout"**:
      - The `packages/domain/` line → "Shared rules: URL normalization, schemas, media types;
        client factory at `@markme/domain/client`".
      - The `specs/` line → "current: 003-m2-domain-package".
  - **Done when**: `pnpm format:check` passes, and the `docs-guard` review finds every named
    export in `src/index.ts` or `src/client/index.ts`.
  - **Commit**: `docs: describe the M2 domain package (T014)`.

- [x] T015 Milestone exit verification (no commit). Run [quickstart.md](quickstart.md) V1–V6 on
      `003-m2-domain-package` after PR 4 merges.
  - **Done when**:
    - V1: the domain test passes, with `normalize.ts`, `parse-user-url.ts` and `provider.ts` at
      100% lines and branches.
    - V2–V4 pass.
    - V5: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passes.
    - V6: `pnpm dev` starts the stack, and `/healthz` returns 200.
    - Every FR-001–FR-020 and SC-001–SC-006 maps to a passing test or check. Run
      `/speckit-analyze` if unsure.
    - Then open the milestone PR `003-m2-domain-package` → `main`, with all five checks green.
      Mostafa merges it.

---

## Dependencies & execution order

### Phase dependencies

- **Setup (T001)** comes first.
- **Foundational (T002)** blocks every story: the gate and the DOM lib.
- **US1 (T003–T004)** depends on T002.
- **US2 (T005–T006)** needs only M0/M1 in substance. It lands after PR 1 because it shares
  `src/url/`, the gate and `src/index.ts`.
- **US3 (T007–T011)** depends on US1 (`normalizeUrl`, `MAX_URL_LENGTH`) and on US2
  (`YOUTUBE_ID_PATTERN`, `Provider`, the `@markme/database` dependency).
- **US4 (T012–T013)** needs only M0/M1 in substance. It lands after PR 3 so that
  `package.json` and `src/index.ts` merge in one line.
- **Polish (T014–T015)** comes last.

### Within each story

- Every task is test first (red), then implement (green), then the done check, then one commit.
- US1: T003, then T004 (`parseUserUrl` calls `normalizeUrl`).
- US2: T005, then T006 (media type takes a `Provider`).
- US3: T007, then T008 ∥ T009, then T010 (needs both), then T011.
- US4: T012, then T013.

### Story completion order

```text
T001 ─▶ T002 ─▶ US1 (PR 1) ─▶ US2 (PR 2) ─▶ US3 (PR 3) ─▶ US4 + Polish (PR 4) ─▶ T015 ─▶ milestone PR → main
```

## Parallel examples

```text
# US3, after T007 (different files; each adds one export line to src/index.ts):
T008 src/schemas/http-url.ts + http-url.test.ts
T009 src/schemas/text.ts + text.test.ts

# PR 4 (different files):
T013 src/client/factory.ts + factory.test.ts
T014 /CLAUDE.md, /README.md
```

The rest is sequential. Each later task imports the previous one's exports.

## Implementation strategy

- **MVP = PR 1 (US1)**: the duplicate key that M5 and the database depend on, held to 100%
  coverage from its first commit.
- **Then** PR 2 (classification, for M3/M6), PR 3 (validation, for M3/M5) and PR 4 (factory, for
  M4).
- Stop at each PR checkpoint. The story's independent test must pass in CI before the next story
  branch is created.

## Notes

- `[P]` = different files and no unfinished dependency. `[USn]` maps the task to spec.md.
- The tracking list and canonical rules are close to permanent once M5 stores keys (A17). Any
  later change to `normalize.ts` needs a decision entry in `docs/IMPLEMENTATION_PLAN.md` §4.
- If an implementation finding contradicts research R1–R12, stop. Update research.md and plan.md
  (and `docs/IMPLEMENTATION_PLAN.md`, per its change rule) in the same PR, and tell Mostafa.
