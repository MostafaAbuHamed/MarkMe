# Feature Specification: M3 Preview API

**Feature Branch**: `004-m3-preview-api`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "on m3-preview-api" — milestone M3 of `docs/PLAN.md` (Preview API),
using the spec input seed in `docs/IMPLEMENTATION_PLAN.md` §3 M3: "Provide a small, secure service
that, given a link from a signed-in user, returns a preview: title, description, image, site name,
icon, type and, for YouTube, X and Instagram, the provider's embed data when available. The service
must never be usable to reach private or internal networks, must limit time, size, redirects and
request rates, and must clean everything it returns. Results are cached for a day; a user can force
a refresh, at a limited rate. It runs locally with the rest of the stack and is deployed to a public
endpoint."

Design decisions already approved for this milestone (`docs/IMPLEMENTATION_PLAN.md` §4): A37–A50
(M3 design review, 2026-10-23), plus A6 and A19 (embeds as provider + id) and A26 (shared YouTube id
rule). They are written into the requirements below; none are reopened here.

## User Scenarios & Testing _(mandatory)_

This milestone has no screens. Its users are the **MarkMe end users**, whose saved links get a
readable card (title, image, site, type) without the extension ever fetching third-party pages
itself, and the **contributors** who build the save flow (M5) and the library (M6) on top of it.
Because the service fetches any link a user submits, its first job is to be safe: it must never let
a user reach the network it runs in. Each story is proven by automated tests against local test
servers; the last one is also checked against the deployed endpoint.

### User Story 1 - Fetching a link can never reach a private network (Priority: P1)

A signed-in user asks for a preview of a link. Before anything is fetched, the service checks who
the caller is and whether the target is a public web address. It refuses links that use another
scheme or port, links whose host is (or resolves to) a private, loopback, link-local, carrier-grade
NAT, multicast, documentation or cloud-metadata address, in IPv4 or IPv6 and in their encoded or
embedded forms. It connects only to the address it checked, so a host that changes its answer
between the check and the fetch (DNS rebinding) cannot redirect it. Every redirect is checked the
same way. Time, size, redirect count and content type are capped, and nothing identifying the user
(cookies, credentials) is ever sent to the target.

**Why this priority**: The constitution (I, III) makes SSRF protection non-negotiable and requires
its tests before the fetcher. Every other story fetches through this one.

**Independent Test**: Run the SSRF suites (address policy, scheme/port, DNS, redirects, limits,
headers) against local test servers and an injected name resolver; every blocked case is refused
and every allowed case succeeds. Run the sign-in checks with tokens signed by a test key.

**Acceptance Scenarios**:

1. **Given** a request without a token, with a malformed token, an expired token, or a token not
   issued by the project's sign-in service for signed-in users, **When** it reaches the service,
   **Then** it is refused as `unauthorized`. A valid token is accepted with no call back to the
   sign-in service per request (A37).
2. **Given** a link with scheme `file:`, `ftp:`, `gopher:` or `data:`, or a port other than 80/443
   (22, 8080, 6379), **When** it is fetched, **Then** it is refused before any connection.
3. **Given** a target in any blocked range (for example `127.0.0.1`, `10.0.0.1`, `169.254.169.254`,
   `100.64.0.1`, `[::1]`, `[fd00:ec2::254]`, `[::ffff:127.0.0.1]`, a NAT64/6to4 form embedding a
   private IPv4), or an IPv4 written in decimal, octal or hex (`2130706433`, `0177.0.0.1`,
   `0x7f.1`), **When** it is fetched, **Then** it is refused as `blocked_target`. Public addresses
   (`8.8.8.8`, `2606:4700::1111`) are allowed.
4. **Given** a host that resolves to several addresses, **When** any of them is blocked, **Then**
   the link is refused; otherwise the service connects to the first checked IPv4 address, or to an
   IPv6 address only when the host has no IPv4, and never tries another address (A41).
5. **Given** a host whose name resolves to a public address on the first lookup and a private one on
   the second, **When** it is fetched, **Then** the connection goes to the first checked address and
   no second lookup happens.
6. **Given** a redirect to a loopback, metadata or private-resolving target, or to a non-web scheme,
   **When** it is followed, **Then** it is refused; a relative redirect is resolved against the
   current page; a fourth redirect fails.
7. **Given** a target that sends bytes slowly, **When** 5 seconds pass in total across all
   redirects, **Then** the request ends as `timeout`.
8. **Given** a body larger than 2 MB, or a compressed body that grows past 2 MB once decompressed,
   **When** it is read, **Then** reading stops at 2 MB (A45).
9. **Given** a response whose type is not a web page or an image (for example `application/json` or
   `application/octet-stream`), **When** a page is fetched, **Then** it is refused; the provider
   adapters of Story 2 may allow JSON for their own fixed endpoints only. A final status outside
   2xx ends as `fetch_failed` (A45).
10. **Given** any fetch, **When** its request is inspected, **Then** it carries the fixed MarkMe
    user agent and no cookie or authorization header, and cookies set by the target are never sent
    on a redirect.

---

### User Story 2 - A link becomes a clean, readable preview (Priority: P2)

From the fetched page, the service builds a preview: title, description, image, site name, icon and
media type. It prefers the page's sharing metadata, then its social-card metadata, then the plain
page title and description. For YouTube, X and Instagram it first asks the provider's own preview
service, and falls back to the page when the provider is unavailable. For YouTube it returns the
video's id so each app can build its own player; it never returns provider markup. Every text is
cleaned and cut to the shared limits, and pages in older encodings (such as Arabic `windows-1256`)
read correctly.

**Why this priority**: The card in the save flow (M5) and the library (M6) depends on it, and it is
built entirely on the safe fetch of Story 1.

**Independent Test**: Run the metadata parser over saved page fixtures and the provider adapters
over simulated provider responses; compare each preview with the expected fields.

**Acceptance Scenarios**:

1. **Given** a page with sharing metadata, **When** it is parsed, **Then** title, description,
   image and site name come from it; a page with only social-card metadata uses that; a page with
   neither uses its `<title>` and description.
2. **Given** a page without an icon link, **When** it is parsed, **Then** the icon is the site's
   `/favicon.ico`; relative image and icon links are resolved against the final page address, and
   only web links are kept.
3. **Given** an image or icon link whose host is `localhost` or a blocked address written directly
   (`127.0.0.1`, `[::1]`), **When** it is parsed, **Then** it is dropped, so a page cannot make the
   user's browser load something on their local network (A42).
4. **Given** a title that contains markup or a script, control characters, encoded entities or runs
   of whitespace, **When** it is cleaned, **Then** markup and control characters are removed,
   entities decoded and whitespace collapsed; any text longer than its shared limit (title 300,
   description 1,000, site name 200) is cut to that limit.
5. **Given** a page in `windows-1256` declared in the response header, or only in a `<meta>` tag in
   its first 1,024 bytes, **When** it is parsed, **Then** its text reads correctly; an unknown
   encoding name falls back to UTF-8 (A40).
6. **Given** a YouTube link, **When** its preview is built, **Then** the provider's data is used
   and the result carries a YouTube embed made of the provider name and a video id that passes the
   shared id rule, never markup (A6, A19, A26).
7. **Given** an X or Instagram link, **When** its preview is built, **Then** the provider's post
   text becomes the description and the page fills the title and image; the result carries no embed.
   Instagram is asked without an access token unless one is configured.
8. **Given** a provider that fails, refuses (for example Meta's error code 24) or is disabled,
   **When** its preview is built, **Then** the page path is used instead and the user still gets a
   preview.
9. **Given** a direct link to an image, **When** its preview is built, **Then** the image is the
   final link, the type is `image` and the title is the decoded file name; the image body is not
   parsed (A39).
10. **Given** a page with no usable metadata, **When** its preview is built, **Then** the result is
    a success that holds only the link and its media type (A45).

---

### User Story 3 - A signed-in user gets a preview fast and fairly (Priority: P3)

The extension sends a link and the user's token to one endpoint and gets back a preview or a short
error code it can show. A preview of the same page is reused for 24 hours for every user, so saving
a popular link is instant. A user may force a fresh preview, at a limited rate. Request rates are
limited per address (before the token is even checked, so a flood of bad tokens is throttled too)
and per user. Logs help debugging without recording what users save.

**Why this priority**: It turns Stories 1 and 2 into the contract the save flow (M5) calls. It
depends on both.

**Independent Test**: Call the endpoint in-process with test tokens against local targets; check
status codes, response bodies, cache reuse, limiter responses and log lines.

**Acceptance Scenarios**:

1. **Given** a valid token and a public link, **When** a preview is requested, **Then** the answer
   is a preview that passes the shared preview-result rules.
2. **Given** a link the shared link rules refuse (not a link, unsupported scheme, credentials, too
   long) or a body that is not a valid request, **When** a preview is requested, **Then** the answer
   is `invalid_url`. A body over 4 KB is refused.
3. **Given** each failure, **When** the error is returned, **Then** the body is only the error code
   (`invalid_url`, `unauthorized`, `blocked_target`, `rate_limited`, `fetch_failed`, `timeout`) with
   no internal details or stack trace.
4. **Given** a preview of a page was built in the last 24 hours (for any user), **When** the same
   page (same canonical link) is requested again, **Then** the stored preview is returned without
   fetching the page again (A45).
5. **Given** the "force refresh" flag, **When** a preview is requested, **Then** the page is fetched
   again and the stored preview replaced; more than 10 forced refreshes per user per hour are
   refused as `rate_limited`.
6. **Given** more than 60 requests per minute from one address, signed in or not, **When** the next
   one arrives, **Then** it is refused as `rate_limited` before the token is checked (A38).
7. **Given** more than 20 requests per minute or 300 per day from one user, **When** the next one
   arrives, **Then** it is refused as `rate_limited`. Every `rate_limited` answer says when to retry.
8. **Given** a request from an origin that is not the MarkMe extension (or another configured
   origin), **When** it reaches the service, **Then** cross-origin access is denied; a request with
   no origin at all (command-line tools, smoke tests) is allowed, since the token is the gate (A44).
9. **Given** any request, **When** it is logged, **Then** there is one line with method, status,
   duration, error code, cache hit and the target's host only, never its full link, path, query,
   the user's id or the token (A43).

---

### User Story 4 - The service ships as an image and answers on a public endpoint (Priority: P4)

The service is packaged as a container image that CI builds on every change, and is deployed to a
public endpoint from CI with no long-lived cloud keys stored in the repository. Mostafa can deploy
from the milestone branch before it merges, so the milestone's exit check runs against the real
endpoint. The one-time cloud setup that only a human can do is guided step by step. Locally, the
service keeps starting with the rest of the stack.

**Why this priority**: It is the walking skeleton's last step and proves the whole path end to end,
but it adds no new behaviour and depends on Stories 1–3.

**Independent Test**: Build the image in CI; run the guided setup once; trigger a deploy from the
milestone branch; check the deployed health endpoint and the exit-verification requests.

**Acceptance Scenarios**:

1. **Given** a change to the service, the shared rules or the lockfile, **When** CI runs, **Then**
   the container image builds; the image runs as a non-root user and reports its own health.
2. **Given** a push to `main` touching the service, or a manual deploy from `main` or a milestone
   branch (`NNN-*`), **When** the deploy workflow runs, **Then** it signs in to the cloud through
   short-lived federated identity (no key files in the repository), publishes an image tagged with
   the commit, and deploys it with at most one instance and scale to zero (A47, A48). Any other
   branch or repository cannot deploy.
3. **Given** a deploy finished, **When** the smoke check runs, **Then** the health endpoint answers
   and a preview request without a token is refused as `unauthorized`.
4. **Given** the deployed endpoint, **When** a signed-in test user requests `https://example.com`
   and `http://169.254.169.254/`, **Then** the first returns a preview and the second is refused as
   `blocked_target`.
5. **Given** the image registry, **When** new images are published, **Then** only the 3 most recent
   are kept, so storage stays inside the free quota (A48).
6. **Given** a fresh cloud account, **When** Mostafa runs the guided setup, **Then** it walks him
   through the project, billing link, a $1 budget alert, the federated identity and the deploy
   account, and records the resulting ids as repository variables, not secrets (A49).
7. **Given** `pnpm dev`, **When** it starts, **Then** the preview service runs locally next to the
   database and the extension, as before.

---

### Edge Cases

- **Host resolves to both public and private addresses**: refused, even though one address is
  public (stricter than picking a good one).
- **AAAA record listed before A**: the IPv4 address is used (A41).
- **IPv6-only host**: its IPv6 address is used; it may still fail on the deployed endpoint, whose
  default outbound network is IPv4-only, and then ends as `fetch_failed`.
- **5-second budget**: shared by all redirects, not reset per hop.
- **Compressed body under 2 MB that inflates past it**: stopped at 2 MB of decompressed data.
- **Target sets cookies and redirects**: the cookie is not sent to the next hop.
- **Image link that is actually HTML**: handled by the response's content type, not the extension.
- **Same page, two users**: the second user gets the first user's stored preview; previews are
  public data because no fetch ever carries user credentials (A45).
- **Service restarts or scales to zero**: the stored previews and rate-limit counters are lost; this
  is accepted for v1 (`docs/PLAN.md` M3).
- **Expired token during a burst**: still counted by the address limiter, which runs first.
- **Provider succeeds but the YouTube id fails the shared rule**: no embed; the rest of the preview
  is returned.
- **Link with a page anchor or tracking parameters**: shares the stored preview of its canonical
  link; the fetch uses the link as given.

## Requirements _(mandatory)_

### Functional Requirements

**Access and request contract (Stories 1, 3)**

- **FR-001**: The service MUST expose one preview endpoint that takes a link and an optional "force
  refresh" flag, validated by the shared preview-request rule (M2), and returns a preview that
  passes the shared preview-result rule.
- **FR-002**: The service MUST accept only requests carrying a valid token issued by the project's
  sign-in service for signed-in users, verified against the project's published public keys only
  (no shared-secret fallback, A37), with no per-request call to the sign-in service. The caller's
  identity MUST come only from the token.
- **FR-003**: Errors MUST map to `400 invalid_url`, `401 unauthorized`, `422 blocked_target`,
  `429 rate_limited`, `502 fetch_failed` and `504 timeout`, with a body holding only the code.
- **FR-004**: Request bodies over 4 KB MUST be refused.
- **FR-005**: Cross-origin access MUST be limited to a configured origin list whose default is the
  pinned MarkMe extension origin; requests with no origin MUST be allowed (A44).

**Safe fetch (Story 1)**

- **FR-006**: Every outbound fetch MUST allow only `http`/`https` on ports 80/443, on every hop.
- **FR-007**: Every target host MUST be resolved and refused if any resolved address, or a directly
  written address, falls in a blocked IPv4 or IPv6 range (private, loopback, link-local incl. cloud
  metadata, CGNAT, multicast, reserved, documentation, benchmarking, unspecified, and the
  IPv4-mapped, NAT64, 6to4 and Teredo forms, checked through their embedded IPv4 where they have
  one), as listed in `docs/IMPLEMENTATION_PLAN.md` §3 M3.
- **FR-008**: The connection MUST go only to the address that was checked (first IPv4, else IPv6;
  no retry across addresses), so a later DNS answer cannot change the target (A41).
- **FR-009**: Redirects MUST be followed manually, at most 3, each re-checked by FR-006–FR-008.
- **FR-010**: One 5-second deadline MUST cover the whole fetch including redirects; the body MUST be
  cut at 2 MB of decompressed data (A45).
- **FR-011**: A fetched page MUST have an allowed content type: web pages and images by default, or
  the list a provider adapter passes for its own fixed endpoint. A final status outside 2xx MUST end
  as `fetch_failed`.
- **FR-012**: Fetches MUST carry a fixed MarkMe user agent and MUST NOT send cookies, credentials or
  the user's token.

**Preview building (Story 2)**

- **FR-013**: The service MUST read sharing metadata, then social-card metadata, then the plain page
  title and description, plus the site name and icon, resolving relative links against the final
  page address and keeping only web links.
- **FR-014**: Image and icon links whose host is `localhost` or a directly written blocked address
  MUST be dropped (A42).
- **FR-015**: Page text MUST be decoded using the response header's charset, then a `<meta>`
  declaration in the first 1,024 bytes, then UTF-8 (A40).
- **FR-016**: Every returned text MUST be cleaned (markup and control characters removed, entities
  decoded, whitespace collapsed) and cut to the shared limits (M2 `LIMITS`).
- **FR-017**: YouTube, X and Instagram links MUST first use the provider's own preview service at a
  fixed address; any provider failure MUST fall back to the page path. Instagram MUST be asked
  without a token unless one is configured.
- **FR-018**: Embeds MUST be returned only for YouTube, as provider + a video id that passes the
  shared id rule; provider markup MUST never be returned (A6, A19, A26).
- **FR-019**: Media type MUST come from the shared media-type rule (M2). Direct image links MUST
  return the final link as the image and the decoded file name as the title (A39). A page with no
  metadata MUST still succeed with the link and media type (A45).

**Cache, limits and logs (Story 3)**

- **FR-020**: Previews MUST be stored for 24 hours, keyed by the canonical link and shared across
  users, in memory per instance; "force refresh" MUST skip the stored copy and replace it.
- **FR-021**: Requests MUST be limited to 60 per minute per address before the token check, 20 per
  minute and 300 per day per user after it, and 10 forced refreshes per user per hour; each refusal
  MUST say when to retry (A38).
- **FR-022**: The service MUST write one structured log line per request with method, status,
  duration, error code, cache hit and the target host only, never the full link, path, query, user
  id or token (A43).

**Packaging and deploy (Story 4)**

- **FR-023**: The service MUST build into a container image that runs as a non-root user with a
  health check, and CI MUST prove the image builds. The image is for local runs and portability;
  production does not use it (A52, A54).
- **FR-024** _(amended 2026-10-24, A51–A52)_: Deploys MUST run from CI on pushes to `main`
  touching the service and on manual dispatch from `main` or `NNN-*` branches only, ship the
  esbuild bundle as a prebuilt Vercel Function in region `fra1` on the free Hobby plan, and
  smoke-test the production URL. The Vercel token is the only GitHub secret; ids and URLs are
  repository variables. A later app secret goes in the Vercel project's environment variables.
- **FR-025** _(withdrawn 2026-10-24)_: The Cloud Run image-registry cleanup no longer applies;
  Vercel keeps its own deployment history.
- **FR-026** _(amended 2026-10-24)_: The README MUST list the one-time Vercel steps (account
  without a card, `vercel link`, token, `gh secret`/`gh variable` commands). The GCP wizard is
  archived in `scripts/archive/`.
- **FR-027**: `pnpm dev` MUST keep starting the service locally with the rest of the stack.

**Quality gate**

- **FR-028**: The SSRF suites MUST be written before the fetcher exists (constitution III) and land
  without breaking CI (pending tests, turned on when the fetcher lands).
- **FR-029**: Tests MUST cover every scenario in this spec using local test servers, a simulated
  resolver and simulated providers; an "allow everything" address policy MAY be injected only in
  tests and MUST never be settable from configuration.

### Key Entities

- **Preview request**: a link plus an optional "force refresh" flag, from the shared rules (M2).
- **Preview**: link, title, description, image, icon, site name, media type, provider and optional
  YouTube embed (provider + id), from the shared rules (M2).
- **Preview error**: one of the six shared error codes.
- **Caller**: the signed-in user identified by the token's subject; never sent by the client.
- **Address policy**: the blocked IPv4/IPv6 ranges a fetch target is checked against.
- **Stored preview**: a preview kept for 24 hours under its canonical link.
- **Rate-limit counter**: request counts per address, per user and per user's forced refreshes.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of the blocked-target cases in this spec (every range and encoded form, DNS
  rebinding, mixed answers, redirects to internal targets, non-web schemes and ports) are refused
  in CI, and every public-address case succeeds.
- **SC-002**: No fetch takes longer than 5 seconds in total or reads more than 2 MB of decompressed
  data, in every limits test.
- **SC-003**: Every parser fixture, provider case and cleaning case in Story 2 produces the expected
  preview, and no returned text exceeds its shared limit or contains markup.
- **SC-004**: A repeated request for a page previewed in the last 24 hours is answered without a new
  fetch in 100% of cache tests.
- **SC-005**: Every request over a limit gets `rate_limited` with a retry time, and no error body in
  any test contains internal details.
- **SC-006**: No log line in any test contains a link path, query, user id or token.
- **SC-007**: The image builds in CI on every change to the service; the deployed endpoint answers
  its health check, refuses an unsigned request, returns a preview for `https://example.com` and
  refuses `http://169.254.169.254/` for a signed-in user.
- **SC-008**: The cloud setup stays inside the free tier, with a budget alert at $1.
- **SC-009**: All five CI checks pass on the milestone branch, and `pnpm dev` still starts the whole
  stack.

## Assumptions

- M1 (PR #46) and M2 (PR #53) are merged: the shared link rules, media-type rule, YouTube id rule,
  limits and preview request/result/error rules are available from `@markme/domain`.
- Local and hosted sign-in both publish asymmetric (ES256) public keys (checked 2026-10-23, A37).
- The pinned extension origin `chrome-extension://dapmmcamlgmaopfaicfjifakodajigha` is the only
  browser caller in v1; extension pages with host permissions skip cross-origin checks anyway, so
  the origin list is defense in depth (A44).
- In-memory cache and counters per instance, lost when an instance stops, are accepted for v1.
  Vercel Hobby cannot cap instances, so limits apply per instance (A53).
- Writing the preview into the saved item is the client's job (M5); this service only returns it.
- Hosting changed on 2026-10-24: Cloud Run needs an active billing account and Google asked for a
  $30 prepayment, which Mostafa declined. The service deploys to Vercel Hobby (no card) instead
  (A51). Hobby is non-commercial only; Mostafa plans paid plans later and will not pay Vercel, so
  the service moves to another host before the first paid feature (A54).
- New dependencies (token verification, address parsing, HTTP client agent, HTML parser, cache,
  rate limiter) are justified in the plan, as the constitution requires.
- Delivery: one commit per task and one PR per user story into `004-m3-preview-api`, in order
  US1 → US2 → US3 → US4 (A50).
