# Feature Specification: M0 Monorepo Foundation

**Feature Branch**: `001-m0-monorepo-foundation`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "M0: Monorepo foundation -> Set up the MarkMe monorepo so that a developer can clone it and run the whole local stack (database, auth, preview service, Chrome extension dev build) with one command. Every pull request is checked automatically for lint, types, unit tests, database tests and leaked secrets. Each app refuses to start with missing or invalid configuration and explains what is missing. No product features in this milestone."

## User Scenarios & Testing *(mandatory)*

The users of this milestone are **contributors**: the project owner and the AI coding agents that
implement later milestones. Reviewers of pull requests are a second audience. No end user of
MarkMe sees anything from this milestone.

### User Story 1 - One command runs the whole local stack (Priority: P1)

A contributor clones the repository onto a machine that has the documented prerequisites, follows
the README, installs dependencies and runs one command. The local database and auth service, the
preview service and the browser-extension development build all start. The contributor sees where
each part is running and can load the development extension into the browser.

**Why this priority**: Every later milestone (M1–M8) is built and checked on this local stack. The
constitution requires the one-command setup to keep working after every merge. Without it, no other
milestone can start.

**Independent Test**: On a fresh clone, follow the README steps exactly, run the start command, then
confirm that the preview service's health check answers, the local database accepts connections,
and the extension development build appears and loads in the browser.

**Acceptance Scenarios**:

1. **Given** a fresh clone on a machine with the documented prerequisites, **When** the
   contributor installs dependencies and runs the start command, **Then** the local database and
   auth service, the preview service and the extension development build are all running, and the
   command prints the local address of each service.
2. **Given** the stack is running, **When** the contributor requests the preview service's health
   check, **Then** it answers with a healthy status.
3. **Given** the stack is running, **When** the contributor loads the development build into the
   browser as an unpacked extension, **Then** the extension loads without errors and opens a
   placeholder popup.
4. **Given** the local database is already running from an earlier session, **When** the
   contributor runs the start command again, **Then** the command reuses the running database
   instead of failing or starting a second copy.
5. **Given** the stack is running, **When** the contributor stops the start command, **Then** the
   preview service and extension build stop, and a separate documented command stops the local
   database.

---

### User Story 2 - Every pull request is checked automatically (Priority: P2)

A contributor opens a pull request. Without anyone doing anything by hand, automated checks run for
lint, type errors, unit tests, database tests and leaked secrets. The pull request shows each
check's result. A failing check blocks the merge.

**Why this priority**: The workflow is one pull request per task, often written by AI agents. The
reviewer needs a trusted, automatic gate before any feature code lands. Database tests must work in
this gate now, so the access-policy tests in M1 run there from day one.

**Independent Test**: Open three throwaway pull requests: one clean, one with a deliberate type
error, and one that adds a realistic-looking fake secret. The first passes all checks. The second
fails the type check. The third fails the secret check.

**Acceptance Scenarios**:

1. **Given** a pull request with no problems, **When** it is opened or updated, **Then** the lint,
   type, unit-test, database-test and secret checks all run and pass.
2. **Given** a pull request with a lint violation, a type error or a failing unit test, **When** the
   checks run, **Then** the matching check fails and names the file and problem.
3. **Given** a pull request that adds a failing database test, **When** the checks run, **Then** the
   database-test check fails.
4. **Given** a pull request that adds a credential-like secret to any tracked file, **When** the
   checks run, **Then** the secret check fails and points to the file and line.
5. **Given** a pull request that only adds placeholder values to the committed example
   configuration files, **When** the checks run, **Then** the secret check does not report them.
6. **Given** checks ran before on unchanged parts of the repository, **When** a new pull request
   runs the checks, **Then** results for unchanged parts are reused, so the checks finish faster.

---

### User Story 3 - Apps refuse bad configuration and say what is wrong (Priority: P3)

A contributor starts or builds an app with a configuration value missing or malformed, for example a
missing database address or a URL that is not a URL. The app does not start. It prints a message
that names every missing or invalid setting, says what is expected, and points to the example
configuration file.

**Why this priority**: It prevents silent misconfiguration, where an app runs against the wrong
backend or with an empty key and fails later in confusing ways. It also keeps the secret-handling
rule clear: each app documents exactly which settings it needs.

**Independent Test**: For each app, remove one required setting and corrupt another. Start the app.
Confirm it exits without serving anything and that the message names both settings.

**Acceptance Scenarios**:

1. **Given** an app whose required setting is missing, **When** the contributor starts it,
   **Then** it stops before doing any work and the message names the missing setting.
2. **Given** an app with several bad settings, **When** the contributor starts it, **Then** the
   message lists all of them at once, not only the first.
3. **Given** a setting with the wrong format (for example, a non-URL where a URL is expected, or a
   non-number port), **When** the contributor starts the app, **Then** the message names the setting
   and the expected format.
4. **Given** a misconfigured app, **When** the message is printed, **Then** it never prints the
   value of any secret setting.
5. **Given** an app with valid configuration copied from its example file plus the local values the
   start command prints, **When** the contributor starts it, **Then** it starts normally.
6. **Given** the extension's development or production build, **When** a required setting is
   missing, **Then** the build fails with the same kind of message instead of producing an
   extension that fails at runtime.

---

### Edge Cases

- **Container runtime not running or not installed**: the start command stops with a message that
  names the missing prerequisite and how to start it. It does not hang or print a raw stack trace.
- **Wrong runtime or package-manager version**: install or start fails early with a message naming
  the required version.
- **A required local port is already in use**: the failing service is named in the output, with
  the port it tried to use.
- **One service crashes while the stack runs**: its error is visible in the combined output with
  the service's name; the contributor does not have to guess which part failed.
- **Missing environment file**: treated like missing settings. The message lists every required
  setting and points to the example file to copy.
- **A real environment file is created locally**: it is ignored by version control, so it cannot be
  committed by accident. Only the example files are tracked.
- **A secret appears in a pull request's history but not in the final diff**: the secret check
  still reports it, because a committed secret stays in history.
- **First run downloads large container images**: the start command shows progress, and the
  README warns that the first run is slower.
- **Pull request from a fork or without access to repository secrets**: the checks still run,
  because none of them need stored secrets.

## Requirements *(mandatory)*

### Functional Requirements

**Repository structure and shared standards**

- **FR-001**: The repository MUST be one workspace holding the v1 apps (browser extension, preview
  service) and the shared packages (database, domain, shared configuration), in the layout fixed by
  the constitution. The v2 web app and v3 mobile app MUST NOT be created yet.
- **FR-002**: All apps and packages MUST use one shared set of type-checking, lint and formatting
  rules, defined once in the shared configuration package. Type checking MUST use the strictest
  settings the constitution requires.
- **FR-003**: The repository MUST pin the required runtime and package-manager versions, and
  installs MUST reproduce the same dependency versions from a committed lock file.
- **FR-004**: Root-level commands MUST exist to start the stack, build, lint, type-check, run unit
  tests, format, and to start, stop, reset and test the local database.

**One-command local stack (US-1)**

- **FR-005**: A single documented command MUST start the local database and auth service, the
  preview service and the extension development build, from a fresh clone with only the documented
  prerequisites installed.
- **FR-006**: The start command MUST reuse an already-running local database instead of failing or
  starting a second copy.
- **FR-007**: The start command MUST print the local address of each service and tell the
  contributor where to find the local keys the apps need.
- **FR-008**: The preview service MUST expose a health check that reports a healthy status when it
  is running. It MUST have no other product endpoints in this milestone.
- **FR-009**: The extension development build MUST load in the browser as an unpacked extension and
  show a placeholder popup. It MUST have no product features in this milestone.
- **FR-010**: The README MUST list the prerequisites and the exact setup steps, and the steps MUST
  work verbatim on a fresh clone.

**Automated pull-request checks (US-2)**

- **FR-011**: Every pull request MUST automatically run five checks: lint, type check, unit tests,
  database tests and secret scanning. Each check MUST report pass or fail on the pull request.
- **FR-012**: A failing check MUST block merging.
- **FR-013**: The unit-test check MUST run at least one real passing unit test in this milestone,
  so the test runner is proven to work.
- **FR-014**: The database-test check MUST start a real local database in the check environment and
  run at least one real passing database test, so later access-policy tests can be added without
  more setup.
- **FR-015**: The secret check MUST scan the changes in the pull request (including every commit,
  not only the final diff) and MUST fail when a credential-like value is found. Documented
  placeholder values in example configuration files MUST NOT trigger it.
- **FR-016**: The checks MUST NOT need any stored repository secret, and MUST reuse results for
  unchanged parts of the repository between runs.

**Configuration validation (US-3)**

- **FR-017**: Each app MUST declare every setting it needs, with its expected format, in one place,
  and MUST validate all settings before it does any other work.
- **FR-018**: On invalid configuration, an app MUST exit (or the extension build MUST fail) with one
  message that lists every missing or invalid setting, the expected format of each, and the example
  file to copy.
- **FR-019**: Error messages MUST name settings but MUST NOT print the value of any secret setting.
- **FR-020**: Each app MUST have a committed example configuration file listing every setting, with
  placeholder or local-development values only.
- **FR-021**: Real configuration files MUST be ignored by version control; only example files are
  tracked.
- **FR-022**: The extension's configuration MUST contain only values that are safe to ship in a
  public client (public addresses and the public database key). It MUST NOT define any setting for
  privileged keys.
- **FR-023**: Configuration validation MUST have unit tests: for each app, a missing setting and an
  invalid setting each produce an error that names the setting.

**Scope**

- **FR-024**: This milestone MUST NOT add product features: no data tables, sign-in screens, saving,
  previews or search.

### Key Entities

- **App configuration**: the named settings one app needs (for example its database address,
  public key, service address, port). Each setting has a name, an expected format, whether it is
  required, a default if any, and whether it is secret. Each app has its own set and its own example
  file.
- **Pull-request check**: one automated gate (lint, types, unit tests, database tests, secrets) with
  a pass or fail result shown on the pull request.
- **Local stack**: the set of services the start command runs together: database and auth, preview
  service, extension development build.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor with the documented prerequisites goes from a fresh clone to a fully
  running local stack by following the README alone, with no undocumented step, in under 15 minutes
  on the first run (including downloads) and under 2 minutes on later runs.
- **SC-002**: 100% of pull requests show all five check results without manual action.
- **SC-003**: Each of these deliberate faults fails the matching check on a throwaway pull request:
  a lint violation, a type error, a failing unit test, a failing database test, a fake secret. Five
  of five are caught.
- **SC-004**: A clean pull request passes all checks in under 10 minutes.
- **SC-005**: For every required setting of every app, removing it or giving it an invalid value
  stops the app with a message that names that setting. 100% of settings are covered by a test.
- **SC-006**: No secret value appears in any configuration error message or in any tracked file.
- **SC-007**: After this milestone merges, the next milestone (M1) can add its first database test
  and see it run in the pull-request checks with no change to the check setup.

## Assumptions

- Contributors work on Linux or macOS with a container runtime, the pinned runtime version, the
  package manager and the database command-line tool installed. Installing them is a documented
  prerequisite, not automated by this milestone.
- The automated checks run on the repository's hosted continuous-integration service on its free
  tier. No remote result cache or paid service is used; reusing results inside the free service is
  enough.
- The local database stays running after the start command stops, because restarting it is slow.
  A separate documented command stops it.
- Merge blocking on failed checks is a repository setting turned on by the owner once the checks
  exist. The milestone documents the setting and confirms it is on.
- Detecting a privileged key that was wrongly put into the extension's final bundle is M8's job
  (bundle secret check). This milestone keeps such settings out of the extension's declared
  configuration.
- Deploying the preview service and creating the cloud database project happen in M3 and M1. This
  milestone is local plus pull-request checks only.
- The technical choices already approved in `docs/IMPLEMENTATION_PLAN.md` (§1, M0) are inputs to
  `/speckit-plan`. Its open items (validation-library major version, remote cache) are settled
  there, not in this spec.
