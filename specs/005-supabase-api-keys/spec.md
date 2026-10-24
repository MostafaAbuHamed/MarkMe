# Feature Specification: Move to Supabase publishable and secret API keys

**Feature Branch**: `005-supabase-api-keys`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "now in our system we are using anon key from Supabase .. but this type of keys become legacy. So, we need to go forward to the new one. Make your research to know more before making the spec."

## Background (research summary)

Supabase now has two kinds of project API keys:

| Kind            | Format                               | Privilege                                                               | Replaces                  | Where it may live                                                   |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| Publishable key | `sb_publishable_…`, short, not a JWT | Low: RLS applies (`anon` role without a user, `authenticated` with one) | legacy `anon` JWT         | Anywhere public: extension bundle, source, docs                     |
| Secret key      | `sb_secret_…`, short, not a JWT      | Elevated: bypasses RLS (`service_role`)                                 | legacy `service_role` JWT | Backend only. A secret key used from a browser always gets HTTP 401 |

What matters for MarkMe:

- **Timeline.** Legacy `anon` / `service_role` keys are removed in **late 2026 (date TBC)**; apps that still use them then break. Since 1 November 2025, a project that is **restored after a pause** comes back **without** legacy keys. The hosted `markme` project is on the free plan, which pauses inactive projects, so one restore is enough to break a legacy-key build.
- **Drop-in for clients.** The publishable key is passed to the Supabase client exactly where the anon key went; the client library needs no other change. Data access and RLS behave the same.
- **Not a JWT.** A new key only goes in the `apikey` header, never as `Authorization: Bearer` (the client library already handles this). Any check or tool that expects a key to start with `eyJ` or decodes it as a JWT stops working.
- **Coexistence.** Creating new keys does not revoke legacy ones. Legacy keys stay valid until they are disabled in the dashboard. Disabling them can be undone; deleting a secret key cannot.
- **Local stack.** The pinned Supabase CLI already prints `PUBLISHABLE_KEY` and `SECRET_KEY` next to `ANON_KEY` and `SERVICE_ROLE_KEY` in `supabase status`. Local keys never work against the hosted project.
- **User tokens are separate.** A signed-in user's access token is still a JWT. The preview API verifies it against the project's public signing keys (ES256), which M3 already does. It never uses a project API key, so the key change does not touch it.

Today the anon key appears in: the extension's env variable and its validation, the `pnpm dev` env generator, the client factory option name, `.env.example`, the preview-api README's manual test steps, and the technical plan's env table and release-bundle check.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Local development runs on the publishable key (Priority: P1)

As the developer, I run `pnpm dev` on a fresh checkout and the extension is configured with the local publishable key, not the legacy anon key. Signing in, reading and writing my own data work exactly as before.

**Why this priority**: Every later milestone builds on this configuration. If the default setup still uses the anon key, each new feature adds legacy-key code that has to be migrated later.

**Independent Test**: On a clean checkout with no `.env` files, run `pnpm dev`. Check that the generated extension config holds a value starting with `sb_publishable_`, that no generated file contains the anon, service-role or secret key, and that a test user can sign in and run an owned query through the factory-built client.

**Acceptance Scenarios**:

1. **Given** a checkout with no app `.env` files and the local stack running, **When** the developer runs `pnpm dev`, **Then** the extension config contains the local publishable key under a variable whose name says "publishable", and contains no other Supabase key.
2. **Given** that config, **When** a signed-in test user saves and reads their own data through the shared client factory, **Then** it succeeds, and another user's data is still denied by RLS.
3. **Given** the local status output lacks a publishable key (for example, an outdated CLI), **When** `pnpm dev` generates config, **Then** it stops with a message that names the missing publishable key and prints no key values.

---

### User Story 2 - Wrong keys are rejected before they ship (Priority: P1)

As the developer, if I paste the wrong key into the extension config (a legacy anon JWT, a secret key, a service-role key or a placeholder), the build or dev start fails at once. The message names the variable and says what kind of value is expected. A release bundle that contains any elevated or legacy key fails its check.

**Why this priority**: The publishable key is the only key allowed in the extension. A legacy key works today but breaks silently later. A secret key is a security incident. Both mistakes must be caught by tooling, not by memory.

**Independent Test**: Feed the extension config validation each wrong kind of value and check each is refused with the expected message. Run the release-bundle check on a build that has a planted secret key and on one with a planted legacy JWT; both must fail.

**Acceptance Scenarios**:

1. **Given** the extension config holds a legacy JWT key (starts with `eyJ`), **When** the extension starts or builds, **Then** validation fails, naming the variable and saying a publishable key (`sb_publishable_…`) is expected.
2. **Given** the extension config holds a value starting with `sb_secret_`, **When** validation runs, **Then** it fails, and the message does not echo the value.
3. **Given** the developer's existing `.env` still uses the old anon-key variable name, **When** the extension starts, **Then** validation fails with a message that names the new variable and points to `.env.example`. `pnpm dev` still never overwrites an existing `.env`.
4. **Given** a built extension bundle, **When** the release check runs, **Then** it fails if it finds any `sb_secret_` value, any JWT whose role is `service_role` or `anon`, or the service-role variable name.

---

### User Story 3 - The hosted project drops legacy keys (Priority: P2)

As the project owner, the production configuration uses the hosted project's publishable key. Once nothing depends on the legacy keys, I disable them on the hosted project. Then a pause and restore, or Supabase's final removal, cannot break MarkMe.

**Why this priority**: No production client exists yet (the extension ships in a later milestone), so nothing breaks today. But the free-plan pause/restore rule makes legacy keys a live risk, and switching before the first release is the cheapest moment.

**Independent Test**: With legacy keys disabled on the hosted project, sign in to the hosted project with the publishable key and call the deployed preview API with the resulting user token. Both succeed. A request made with the old anon key is refused.

**Acceptance Scenarios**:

1. **Given** the hosted project has a publishable key, **When** the production extension config is prepared, **Then** it uses that key and the release check from Story 2 passes.
2. **Given** every MarkMe component and doc uses the publishable key, **When** the owner disables the legacy keys in the hosted dashboard, **Then** hosted sign-in and the deployed preview API keep working (the M3 V6 check, with a token obtained through the publishable key).
3. **Given** legacy keys are disabled, **When** a request uses the old anon key, **Then** the hosted project rejects it.

---

### User Story 4 - Docs and project guidance describe the new keys (Priority: P3)

As a future contributor (or agent), every doc and instruction that mentions a Supabase key names the publishable key for clients and the secret key for backend or test-only use. No doc tells me to copy `ANON_KEY` or `SERVICE_ROLE_KEY`.

**Why this priority**: Docs drive the next milestone's work. Stale instructions bring the legacy key back.

**Independent Test**: Search the repository (excluding finished milestone specs and the dependency lockfile) for anon-key and service-role-key wording. Every hit is either historical or an explicit "legacy, do not use" note.

**Acceptance Scenarios**:

1. **Given** the preview-api README's manual test steps, **When** a developer follows them, **Then** they get a user token using the publishable key, and the steps work against the local stack.
2. **Given** the technical plan's env table, release section and decision log, **When** read, **Then** they name the publishable key for the extension and the secret key for test setup only, and record why the switch happened.

---

### Edge Cases

- **Old local `.env`**: an existing extension `.env` with the old variable name or an anon JWT is never rewritten. Validation refuses it with a fix-it message (delete it and rerun `pnpm dev`, or copy the publishable key from `supabase status`).
- **CLI without publishable key**: the env generator fails clearly instead of falling back to the anon key.
- **Test seed or E2E setup that needs elevated access**: it uses the secret key, only in test code and never in an app bundle. A secret key used from browser-like code fails with HTTP 401 by design.
- **Something still sends a key as `Authorization: Bearer`**: it is refused once legacy keys are off. Only user tokens go in that header.
- **Hosted project restored after a pause**: it comes back without legacy keys. MarkMe keeps working because it no longer uses them.
- **Rollback**: if something breaks after the hosted legacy keys are disabled, they can be re-enabled from the dashboard. This is a two-way step until Supabase removes legacy keys for good.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The extension MUST be configured with exactly one Supabase project key, the publishable key, under a variable named for it. The env schema stays locked to three public keys.
- **FR-002**: Extension config validation MUST accept only values shaped like a publishable key (`sb_publishable_` prefix). It MUST reject legacy JWT keys, secret keys and placeholders, naming the variable and the expected kind, and never echoing the rejected value.
- **FR-003**: The `pnpm dev` env generator MUST read only the API URL and the publishable key from the local status output, and MUST fail with a named-key message when the publishable key is missing. It MUST NOT fall back to the anon key, and MUST NOT write any other key to any file.
- **FR-004**: The shared client factory MUST take the project key under a name that does not say "anon". Its behavior (PKCE, session persistence, auto refresh, storage adapter) MUST stay unchanged.
- **FR-005**: Sign-in, owned reads and writes, and RLS cross-user denial MUST behave the same with the publishable key as with the anon key, verified against the local stack.
- **FR-006**: The release-bundle check MUST fail on any `sb_secret_` value, any embedded JWT whose role is `service_role` or `anon`, and the service-role variable name.
- **FR-007**: Test-only code that needs elevated access MUST use the secret key, read from the environment, and never from any app's config or bundle.
- **FR-008**: The preview API MUST keep verifying user access tokens through the project's public signing keys and MUST NOT require any project API key.
- **FR-009**: All docs, examples and project guidance (`.env.example`, READMEs, technical plan, `CLAUDE.md`) MUST refer to the publishable key for clients and the secret key for backend or test use. The technical plan MUST record the decision and its reason.
- **FR-010**: The production extension config MUST use the hosted project's publishable key.
- **FR-011**: After FR-001 to FR-010 are merged and verified, the hosted project's legacy keys MUST be disabled, with a recorded check that hosted sign-in and the deployed preview API still work.

### Key Entities

- **Publishable key**: the low-privilege project key, safe to ship in the extension. One per environment (local, hosted).
- **Secret key**: the elevated project key that bypasses RLS. Never in an app. Used only by test setup or future backend jobs.
- **Legacy keys (`anon`, `service_role`)**: JWT-based predecessors. Being removed. MarkMe must not depend on them.
- **User access token**: the signed-in user's JWT. Unchanged by this feature; verified by the preview API.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On a clean checkout, `pnpm dev` produces a working extension config in one run with no manual key copying, and sign-in plus an owned query succeed on the first try.
- **SC-002**: 100% of wrong-key cases (legacy JWT, secret key, placeholder, old variable name) are refused before the extension runs, each with a message that names the variable and the expected kind.
- **SC-003**: A repository search finds zero live references telling anyone to use the anon or service-role key. Finished milestone specs and explicit "legacy" notes are excluded.
- **SC-004**: With legacy keys disabled on the hosted project, hosted sign-in and the deployed preview API pass the same four checks as the M3 exit verification (401 / 200 / 422 / 200).
- **SC-005**: A pause and restore of the hosted project, or Supabase's final removal of legacy keys, requires zero code or config changes in MarkMe.

## Assumptions

- This runs as its own feature between M3 (merged) and M4. M4's extension work then starts on the publishable key. It lands through the usual milestone branch, one PR per user story.
- No production users or released builds exist yet, so renaming the env variable and factory option needs no compatibility period.
- The hosted `markme` project already offers a publishable key (the API Keys page shows the new keys tab) and already signs user tokens with asymmetric keys (M3 V6 verified ES256 tokens).
- The pinned Supabase CLI (2.121.0) prints `PUBLISHABLE_KEY` in `supabase status -o env`, confirmed locally. No CLI upgrade is needed.
- The client library version in use accepts publishable keys without changes (Supabase states any client version works).
- Disabling hosted legacy keys is a manual dashboard step done by the owner, like `pnpm db:push`. It is not done by CI.
- Edge Functions and Realtime limits of the new keys do not apply: MarkMe v1 uses neither.

## Sources

- [Supabase docs: Understanding API keys](https://supabase.com/docs/guides/api/api-keys)
- [Supabase discussion 29260: Upcoming changes to Supabase API keys](https://github.com/orgs/supabase/discussions/29260)
- [Supabase blog: security 2025 retro](https://supabase.com/blog/supabase-security-2025-retro)
