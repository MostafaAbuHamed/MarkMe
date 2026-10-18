# Contract: Pull-request checks (`.github/workflows/ci.yml`)

```yaml
on:
  pull_request: # every base branch: main and milestone branches (FR-012)
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

No job reads any `secrets.*` value (FR-016). Fork PRs run unchanged. Third-party actions are pinned
by full commit SHA, with the version tag in a comment.

| Job id (= required check) | Setup                                                                                                                | Command                                                                                                                                                                                                         | Fails when                                                                               | Cache                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| `lint`                    | checkout, pnpm (from `packageManager`), Node from `.nvmrc`, `pnpm install --frozen-lockfile`                         | `pnpm turbo run lint` (ESLint) **and** `pnpm format:check` (Prettier `--check`)                                                                                                                                 | any ESLint error or unformatted file; output names `file:line rule`                      | pnpm store, `.turbo/cache`           |
| `typecheck`               | same                                                                                                                 | `pnpm turbo run typecheck`                                                                                                                                                                                      | any `tsc` error; output names `file(line,col): TSxxxx`                                   | pnpm store, `.turbo/cache`           |
| `test`                    | same                                                                                                                 | `pnpm test` (Turbo package tests + root `scripts` tests)                                                                                                                                                        | any failing Vitest test, or no test files found in a package that declares `test`        | pnpm store, `.turbo/cache`           |
| `db`                      | same (Docker is on the runner)                                                                                       | `pnpm exec supabase start --workdir packages/database -x studio,imgproxy,edge-runtime,logflare,vector,supavisor` → `pnpm db:test` → `pnpm db:types` → `git diff --exit-code packages/database/src/types.gen.ts` | any pgTAP failure, or generated types differ from the committed file                     | pnpm store only (Turbo not involved) |
| `secrets`                 | checkout `fetch-depth: 0`; download gitleaks v8.30.1 linux_x64 tarball; `sha256sum -c` against the release checksums | `gitleaks git --config .gitleaks.toml --log-opts="${BASE_SHA}..${HEAD_SHA}" --redact --verbose --exit-code 1` (on `push`: `${{ github.event.before }}..${{ github.sha }}`)                                      | any finding in any commit of the PR; log shows file, line, commit, rule (value redacted) | none                                 |

- `BASE_SHA` = `github.event.pull_request.base.sha`. `HEAD_SHA` =
  `github.event.pull_request.head.sha`.
- The Turbo cache key is `turbo-${{ github.job }}-${{ runner.os }}-${{ github.sha }}`, with restore
  key `turbo-${{ github.job }}-${{ runner.os }}-`.

## Merge blocking (repository ruleset, research R13)

- **Target**: `refs/heads/main` and `refs/heads/[0-9][0-9][0-9]-*`.
- **Rules**: `pull_request`; `required_status_checks` = the five job ids above, with
  `strict_required_status_checks_policy: false`; `non_fast_forward`; `deletion`.
- **Bypass**: none.

## SC-007 guarantee

`supabase test db` runs every `packages/database/supabase/tests/*.test.sql`. M1 adds files there and
the `db` job picks them up with no workflow change.

## Deliberate-fault proofs (SC-003, run once on throwaway PRs)

| Fault                                                                                                                              | Expected failing job |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `const x: number = "a"` in `packages/domain/src/index.ts`                                                                          | `typecheck`          |
| unused variable / `no-floating-promises` violation                                                                                 | `lint`               |
| `expect(1).toBe(2)` in a domain test                                                                                               | `test`               |
| `select ok(false, 'fault');` in a new `.test.sql`                                                                                  | `db`                 |
| a fake but realistic AWS key or `sb_secret_…`-shaped string in a new file, committed then removed in a later commit of the same PR | `secrets`            |
