# Feature Specification: M2 Domain Package

**Feature Branch**: `003-m2-domain-package`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Milestone 2 in the @docs/PLAN.md" — milestone M2 of `docs/PLAN.md`
(Domain package), using the spec input seed in `docs/IMPLEMENTATION_PLAN.md` §3 M2: "Provide one
shared definition of MarkMe's business rules that every app uses: how a URL is normalized so the
same page is never saved twice; what valid items, folders, tags, notes and preview results look
like; how a link is classified as article, video, image, post or generic link; and a way for each
app to create its own database client with its own session storage. Every rule is covered by
edge-case tests."

Design decisions already approved for this milestone (`docs/IMPLEMENTATION_PLAN.md` §4): A5 and
A21–A36 (M2 design review, 2026-10-22), plus A17 and A19 from M1. They are written into the
requirements below; none are reopened here.

## User Scenarios & Testing _(mandatory)_

This milestone has no screens. Its users are the **MarkMe end users**, who benefit when every
surface applies the same rules (the same page is never saved twice, invalid input is refused with a
clear reason), and the **contributors** who build the preview service (M3), the extension shell
(M4), the save flow (M5) and the library (M6) on top of it. Each story is proven by automated unit
tests over edge-case tables, not by a UI.

### User Story 1 - The same page is recognised as the same link (Priority: P1)

A user saves a link from the current tab or by pasting it. Before anything is stored, the link is
checked and reduced to a canonical form, so two links that only differ in letter case of the
host, a default port, a page anchor, tracking parameters or a trailing slash count as the same
page. The original link (with its tracking parameters) is kept for "open original". Links that
cannot be saved are refused with a reason the interface can show: not a link, not a web link,
contains a username/password, or too long. When the user pastes a link without `https://`, such as
`example.com/post`, it is accepted as a web link.

**Why this priority**: Duplicate prevention (D3, constitution V) depends on one canonical form used
everywhere; the database trusts the value it receives (A17). The validation rules (Story 3) and the
save flow (M5) build on it.

**Independent Test**: Run the normalizer over the rule table, the tracking-parameter list and the
edge-case table in this spec and compare each output (canonical link, original link, or error
reason) with the expected value. Run the paste helper over its table the same way.

**Acceptance Scenarios**:

1. **Given** ` https://a.com`, **When** it is normalized, **Then** surrounding whitespace is
   removed and the result is `https://a.com`.
2. **Given** a link whose scheme is not `http` or `https` (`ftp://a.com`, `javascript:…`,
   `mailto:a@b.com`), **When** it is normalized, **Then** it is refused as "unsupported scheme".
3. **Given** `HTTPS://Ex.COM/A`, **When** it is normalized, **Then** scheme and host are lowercased
   and the path keeps its case: `https://ex.com/A`. An international host such as `bücher.de`
   becomes its ASCII form `xn--bcher-kva.de`.
4. **Given** `https://a.com:443/x`, **When** it is normalized, **Then** the default port is removed
   (`https://a.com/x`); a non-default port such as `:8080` is kept.
5. **Given** `https://a.com/x#top`, **When** it is normalized, **Then** the fragment is removed.
6. **Given** a query with tracking parameters (`utm_*`, `fbclid`, `gclid`, `dclid`, `gbraid`,
   `wbraid`, `msclkid`, `igsh`, `igshid`, `mc_cid`, `mc_eid`, matched ignoring case), **When** it is
   normalized, **Then** those parameters are removed and the others stay: `?utm_source=x&id=2` →
   `?id=2`; `?IGSH=abc` → no query (A23).
7. **Given** a link on a YouTube host (`youtube.com` and its subdomains, `youtu.be`) with an `si`
   parameter, **When** it is normalized, **Then** `si` is removed; on any other host `si` is kept.
8. **Given** a query that is empty, or becomes empty after removing tracking parameters, **When**
   it is normalized, **Then** the result has no `?`.
9. **Given** remaining parameters such as `?b=2&a=1` or `?q=a+b&r=%20`, **When** the link is
   normalized, **Then** they are kept exactly as written: same order, values and encoding (A25).
10. **Given** `https://a.com/x/` or `https://a.com/`, **When** it is normalized, **Then** the
    trailing slash is removed (`https://a.com/x`, `https://a.com`) (A5).
11. **Given** a link with a username or password (`https://u:p@a.com`), **When** it is normalized,
    **Then** it is refused as "has credentials" (A5, A21).
12. **Given** a link whose original or canonical form is longer than 2,048 characters, **When** it
    is normalized, **Then** it is refused as "too long".
13. **Given** a successful normalization, **When** the result is returned, **Then** it holds both
    the original link (trimmed and parsed, tracking parameters kept) and the canonical link (A21).
14. **Given** pasted text, **When** the paste helper reads it, **Then** the first matching step
    wins (A22):
    - text with a scheme (`name://…`, or one of `http:`, `https:`, `mailto:`, `javascript:`,
      `data:`, `tel:`, `sms:`, `about:`, `blob:`, `vbscript:`) is normalized as written;
    - text with no whitespace whose part before the first `/`, `?` or `#` contains a dot is
      normalized with `https://` in front (`example.com/x?y=1` → `https://example.com/x?y=1`,
      `example.com:8080/x` → `https://example.com:8080/x`);
    - anything else (`localhost:3000`, `notes`, `a.com b`) is refused as "invalid".

---

### User Story 2 - Links are classified the same way everywhere (Priority: P2)

When a preview is built, the link is classified as an article, video, image, post or generic link,
and links from YouTube, X and Instagram are recognised as such. For YouTube the video id is
extracted and checked, so a video embed can be shown without storing any markup (A19, A26). The
preview service and the library use the same rules, so a link never shows one type in one place and
another type elsewhere.

**Why this priority**: The preview service (M3) and the library's embeds (M6) need these rules,
and the placeholder per type (US-9) depends on a correct type. It depends only on M0/M1.

**Independent Test**: Run provider detection over every supported host and path form, plus
non-matching links; run id extraction over valid and invalid ids; run type detection over one case
per precedence step and the tie cases in this spec; compare each result with the expected value.

**Acceptance Scenarios**:

1. **Given** a link on `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com` with
   path `/watch`, `/shorts/`, `/embed/` or `/live/`, or a `youtu.be` link, **When** its provider is
   detected, **Then** it is YouTube.
2. **Given** a link on `x.com`, `twitter.com` or their `mobile.` hosts, **When** its provider is
   detected, **Then** it is X.
3. **Given** an `instagram.com` link with path `/p/`, `/reel/` or `/tv/`, **When** its provider is
   detected, **Then** it is Instagram; any other link has no provider.
4. **Given** a YouTube link, **When** its video id is extracted, **Then** the id is returned only if
   it is exactly 11 characters of letters, digits, `_` or `-` (the same rule the database checks,
   A19); otherwise there is no id.
5. **Given** a link classified as YouTube, or a preview whose oEmbed type is `video`, **When** its
   media type is detected, **Then** it is `video`.
6. **Given** an X or Instagram link (Instagram reels included), **When** its media type is
   detected, **Then** it is `post` (A27).
7. **Given** oEmbed type `photo`, or a content type starting with `image/`, **When** its media type
   is detected, **Then** it is `image` (A27).
8. **Given** page metadata type `video.*` or `article`, **When** its media type is detected,
   **Then** it is `video` or `article`; any other metadata type (`website`, `profile`, `music.*`)
   decides nothing and detection continues (A27).
9. **Given** a link ending in an image extension (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`,
   `.avif`, `.svg`) or a video extension (`.mp4`, `.webm`), **When** no earlier step matched,
   **Then** it is `image` or `video`.
10. **Given** no step matched, **When** its media type is detected, **Then** it is `link`; oEmbed
    `rich` alone decides nothing (`rich` + metadata type `article` → `article`).
11. **Given** metadata type `website` on a `.mp4` link, **When** its media type is detected,
    **Then** it is `video`.

---

### User Story 3 - Every surface accepts and refuses the same input (Priority: P3)

Wherever a user creates or edits an item, folder or tag, or wherever a preview result is received,
the input is checked against one set of rules with one set of limits. Text is trimmed, empty text
means "no value", tag lists are cleaned instead of failing the save, and the item types, preview
states and embed providers always match the database. The preview service and the extension both
read preview results and preview errors with the same rules.

**Why this priority**: The save flow (M5), item editing (M6) and the preview service (M3) all
validate with these rules. It builds on Story 1 (link rules) and Story 2 (YouTube id rule).

**Independent Test**: Validate boundary values for every limit (at the limit passes, one over
fails), empty and whitespace-only text, tag-list cleaning, every link error reason, and compare the
allowed type/state/provider values with the database's own list.

**Acceptance Scenarios**:

1. **Given** the shared limits (title 300, description 1,000, site name 200, note 1,000, link
   2,048, folder/tag name 100, tags per item 20), **When** any rule or the preview service checks a
   length, **Then** it uses these numbers from one shared source (A30). They stay below the
   database's ceilings (A18).
2. **Given** a note of 1,000 characters, **When** it is validated, **Then** it passes; with 1,001
   it fails. **Given** a note or title that is empty after trimming, **When** it is validated,
   **Then** the result is "no value", never empty text (A29).
3. **Given** a folder or tag name, **When** it is validated, **Then** it is trimmed and must be
   1–100 characters; a whitespace-only name fails.
4. **Given** a tag name, **When** it is validated, **Then** inner whitespace runs collapse to one
   space and a comma makes it fail (the tag input splits on commas) (A28).
5. **Given** a tag list `React, react, Vue`, **When** it is validated, **Then** duplicates are
   removed ignoring case and the first spelling is kept (`React`, `Vue`); more than 20 tags after
   removing duplicates fails (A28).
6. **Given** a new item with a link, optional folder, optional tag names and optional note, **When**
   it is validated, **Then** the link goes through the Story 1 rules and the result carries both the
   original and canonical link; a refused link fails with the same reason the normalizer gives
   (A33).
7. **Given** an item edit, **When** it is validated, **Then** any of title, note, folder (which may
   be cleared) and the full tag set may be given; the tag set holds ids, duplicates removed, at most 20.
8. **Given** a preview request, **When** it is validated, **Then** it holds a link checked by the
   Story 1 rules and an optional "force refresh" flag.
9. **Given** a preview result, **When** it is validated, **Then** its text fields respect the shared
   limits, its media type is one the database allows, and any embed is a YouTube embed whose id
   passes the Story 2 id rule; anything else fails.
10. **Given** a preview error body, **When** it is validated, **Then** only the codes `invalid_url`,
    `unauthorized`, `blocked_target`, `rate_limited`, `fetch_failed` and `timeout` are accepted
    (A35).
11. **Given** the database's list of media types, preview states and embed providers, **When** the
    shared rules list them, **Then** they are the same values, taken from the database package and
    never copied by hand (A34).

---

### User Story 4 - Each app creates its own database client (Priority: P4)

Each app (the extension now, the web and mobile apps later) creates its own database client and
passes in its own session storage, so the extension keeps its session in extension storage, the web
app in cookies and the mobile app in secure storage. The security-relevant session settings are
fixed and cannot be changed by an app. No app ever shares a single client with another, and the
preview service can use the shared rules without loading the database client at all.

**Why this priority**: The extension shell (M4) needs it to sign users in. End users get nothing
from it until M4 ships, and it depends only on M0/M1.

**Independent Test**: Create a client with an in-memory storage, confirm it reads and writes the
session through that storage, confirm the fixed settings are applied, and confirm that two calls
return two different clients. Confirm that loading the shared rules does not load the database
client library.

**Acceptance Scenarios**:

1. **Given** an app passes a project address, a public key and its own session storage, **When** it
   creates a client, **Then** the client stores and reads its session only through that storage.
2. **Given** a client is created, **When** its settings are inspected, **Then** sign-in uses the
   PKCE flow, sessions persist and refresh automatically, and reading a session from the page
   address is off unless the app turns it on (A31).
3. **Given** an app tries to pass any other session setting (for example a lock), **When** it
   creates a client, **Then** the setting is not accepted.
4. **Given** the factory is called twice, **When** the two results are compared, **Then** they are
   different clients; the package holds no shared client (constitution II).
5. **Given** an app imports the shared rules, **When** it does not import the client entry point,
   **Then** the database client library is not loaded (A31).

---

### Edge Cases

- **IPv6 host** `http://[::1]`: normalizes normally; blocking private addresses is the preview
  service's job (M3).
- **Encoded paths and repeated slashes**: left as they are; percent-encoding is not normalized
  (`%2f` ≠ `%2F`) (A25).
- **Empty values and bare keys** `?a=` and `?a`: kept. **Repeated keys** `?a=1&a=2`: kept.
- **`www.` and provider aliases**: `www.a.com` and `a.com`, `youtu.be/ID` and
  `youtube.com/watch?v=ID`, `twitter.com` and `x.com` stay different links in v1 (A24).
- **`si` outside YouTube**: kept, because other sites may use it for real data.
- **Paste `u:p@a.com`**: gets `https://` and is refused as "has credentials".
- **Paste `a:b.c`**: gets `https://` and is refused as "invalid" (bad port).
- **Tag list with only duplicates and spaces**: cleaned list; an empty tag fails.
- **Tracking list changes later**: rows keep the canonical link they were saved with (A17), so the
  list is treated as close to permanent.
- **Preview text longer than the limits**: the preview service truncates to the shared limits
  before returning (M3), so validation of its result does not fail on length.

## Requirements _(mandatory)_

### Functional Requirements

**Link normalization (Story 1)**

- **FR-001**: The system MUST provide one link normalizer that returns either the original link and
  the canonical link, or one error reason out of `invalid`, `unsupported_scheme`,
  `has_credentials`, `too_long` (A21).
- **FR-002**: The canonical link MUST apply every rule in Story 1 scenarios 1–12: trim; http/https
  only; lowercase scheme and host with international hosts in ASCII form; default port removed;
  fragment removed; tracking parameters removed (A23); empty query dropped; remaining parameters
  kept byte for byte (A25); trailing slash removed including on the root (A5); credentials refused;
  2,048-character cap on both outputs.
- **FR-003**: The normalizer MUST NOT merge `www.` hosts or provider aliases (A24).
- **FR-004**: The system MUST provide a paste helper that applies the three steps in Story 1
  scenario 14 and otherwise uses the normalizer (A22). Saving the current tab MUST use the
  normalizer directly.
- **FR-005**: The canonical link MUST be the single value used as the duplicate key and the preview
  cache key by every app.

**Link classification (Story 2)**

- **FR-006**: The system MUST detect YouTube, X and Instagram links with exactly the hosts and paths
  in Story 2 scenarios 1–3, and report no provider for any other link (A26).
- **FR-007**: The system MUST extract a YouTube video id and publish the id rule (11 characters of
  letters, digits, `_`, `-`) so other components check ids with the same rule as the database
  (A19, A26).
- **FR-008**: The system MUST classify a link's media type with the precedence in Story 2 scenarios
  5–10; the first matching step wins (A27).

**Validation rules (Story 3)**

- **FR-009**: The system MUST publish one set of limits (Story 3 scenario 1) used by every rule and
  by the preview service's truncation (A30).
- **FR-010**: The system MUST provide validation rules for: a web link (built on the normalizer,
  failing with its error reason, A33), note, folder name, tag name, tag list, item creation, item
  edit, preview request, preview result and preview error, with the behaviour in Story 3 scenarios
  2–10.
- **FR-011**: Text that is empty after trimming MUST become "no value" for note and title; rules
  MUST never output empty text for them (A29).
- **FR-012**: Tag lists MUST be cleaned (duplicates removed ignoring case, first spelling kept)
  rather than failing; more than 20 after cleaning MUST fail (A28).
- **FR-013**: Allowed media types, preview states and embed providers MUST be taken from the
  database package's generated values, not copied (A34).
- **FR-014**: Rules MUST use camelCase field names. Mapping between database rows and these shapes
  is out of scope (M5).

**Client factory (Story 4)**

- **FR-015**: The system MUST provide a client factory that takes a project address, a public key, a
  session storage (read, write, remove) and an optional "read session from page address" switch
  (default off), and returns a typed database client.
- **FR-016**: The factory MUST fix the PKCE sign-in flow, automatic token refresh and session
  persistence, and MUST NOT accept a lock or any other pass-through setting (A31; spike S0 Q5).
- **FR-017**: Every factory call MUST return a new client; the package MUST NOT hold a shared
  client (constitution II).
- **FR-018**: The factory MUST be reachable only through a separate entry point, so that importing
  the shared rules never loads the database client library (A31).

**Quality gate**

- **FR-019**: Every rule MUST be covered by table-driven unit tests over the scenarios and edge
  cases in this spec.
- **FR-020**: The package's test run MUST always measure coverage and MUST fail if line or branch
  coverage of the link-normalization code is below 100%; the existing CI test check enforces it
  (A32).

### Key Entities

- **Normalized link**: the pair (original link, canonical link) produced from user or tab input,
  or an error reason. The canonical link is the duplicate key.
- **Provider**: YouTube, X or Instagram, or none; for YouTube, a validated video id.
- **Media type**: `article`, `video`, `image`, `post` or `link`, as defined by the database.
- **Limits**: the shared maximum lengths and counts used by every rule.
- **Item input**: the fields a user gives when creating an item (link, folder, tag names, note) or
  editing one (title, note, folder, tag set).
- **Folder / tag name**: a trimmed, length-limited name; tag names have no commas.
- **Preview request / result / error**: what a client sends to the preview service, the preview data
  it gets back, and the error codes it can get.
- **Session storage**: the read/write/remove interface each app supplies to the client factory.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of the link-normalization rules, tracking parameters, edge cases and paste
  examples in this spec have a passing test, and line and branch coverage of the
  link-normalization code is 100%.
- **SC-002**: Every provider host/path form, id case and media-type precedence step listed in
  Story 2 has a passing test.
- **SC-003**: Every limit has a passing at-limit test and a failing one-over-limit test.
- **SC-004**: The allowed media types, preview states and embed providers match the database's
  values in 100% of test runs; a change in the database values without a matching change here
  fails the build.
- **SC-005**: Two calls to the client factory never return the same client, and loading the shared
  rules without the client entry point loads zero database-client code.
- **SC-006**: The milestone's tests and the coverage gate pass in CI on the milestone branch, and
  one-command local setup still starts the whole stack.

## Assumptions

- M1 is merged (PR #46), so the generated database types and allowed values are available from the
  database package.
- Link parsing follows the standard URL parsing rules; host lowercasing and international host
  conversion come from them.
- Session-storage adapters themselves (extension storage, cookies, secure storage) are built by
  each app (the extension's in M4), not in this milestone.
- Saving items, mapping database rows to these shapes and calling the preview service are M3/M5
  work; this milestone only provides the rules they use.
- The two new dependencies (database client library, coverage tool) are justified in the plan, as
  the constitution requires (A31, A32).
- Delivery: one commit per task and one PR per user story into the milestone branch, in order
  US1 → US2 → US3 → US4 (A36); US2 and US4 depend only on M0/M1.
