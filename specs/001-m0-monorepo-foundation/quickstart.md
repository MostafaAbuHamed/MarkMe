# Quickstart: validate M0

This is a runbook that proves each user story and success criterion. Contracts:
[root commands](contracts/root-commands.md), [app config](contracts/app-config.md),
[CI checks](contracts/ci-checks.md), [health check](contracts/preview-api.openapi.yaml).

## Prerequisites (Linux)

| Tool                   | Version                                                                   | Check                 |
| ---------------------- | ------------------------------------------------------------------------- | --------------------- |
| Node.js                | 24 LTS (`.nvmrc`); use `fnm` or `nvm`                                     | `node -v` → `v24.*`   |
| pnpm                   | from `packageManager` (enable with `corepack enable`, or install pnpm 12) | `pnpm -v` → `12.14.0` |
| Docker Engine          | running                                                                   | `docker info` exits 0 |
| Git                    | any recent                                                                |                       |
| Chromium-based browser | for loading the unpacked extension                                        |                       |

No global Supabase CLI is needed. It is a pinned dev dependency (research R8).

## V1: one command runs the stack (US-1, SC-001)

```bash
git clone <repo> MarkMe && cd MarkMe
pnpm install
time pnpm dev                       # first run pulls images; target < 15 min total
```

Expected:

- The `[dev]` summary from [root-commands.md](contracts/root-commands.md).
- `created apps/preview-api/.env` and `created apps/extension/.env`.

In a second terminal:

```bash
curl -s http://127.0.0.1:8787/healthz            # → {"ok":true}
pnpm exec supabase status --workdir packages/database   # → services running
```

Then:

- In the browser, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and
  pick `apps/extension/.output/chrome-mv3-dev`. The extension shows no errors.
- The toolbar popup shows the placeholder (US-1 #5).
- Stop with Ctrl-C. `curl` now fails and `supabase status` still shows running (US-1 #7).
- Run `pnpm dev` again. Expected: `supabase: already running (reused)` and both `.env` files
  `found … (left unchanged)`. The stack is up in < 2 min (US-1 #3, #6, SC-001).
- Edit a value in `apps/extension/.env` and rerun `pnpm dev`. The file is unchanged (US-1 #3).
- `pnpm db:stop` stops the database.

## V2: edge cases

| Do                                          | Expect                                     |
| ------------------------------------------- | ------------------------------------------ |
| `sudo systemctl stop docker`; `pnpm dev`    | the Docker message, exit 1, no stack trace |
| `fnm use 26`; `pnpm install`                | engine error naming Node 24                |
| `python3 -m http.server 8787 &`; `pnpm dev` | `preview-api: port 8787 is already in use` |
| `git status` after `pnpm dev`               | no `.env` files listed (FR-021)            |

## V3: configuration validation (US-3, SC-005)

```bash
pnpm test                          # includes env tests for every key of both apps
```

Then, by hand:

- Delete `SUPABASE_URL` from `apps/preview-api/.env` and set `PORT=abc`. Run
  `pnpm --filter @markme/preview-api dev`. Expected: exit 1, a message listing both keys, and the
  example-file hint.
- Set `WXT_PREVIEW_API_URL=not-a-url` in `apps/extension/.env`. Run
  `pnpm --filter @markme/extension build`. Expected: the build fails with the same kind of message,
  and no `.output/chrome-mv3` is produced (US-3 #6).
- Restore the files (delete them and rerun `pnpm dev`).

## V4: full local gate (exit verification)

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm db:start && pnpm db:test
pnpm db:types && git diff --exit-code packages/database/src/types.gen.ts
pnpm build                         # .output/chrome-mv3 and apps/preview-api/dist exist
```

## V5: CI and merge blocking (US-2, SC-002–SC-004)

1. Push the milestone branch and open a PR. The five checks `lint`, `typecheck`, `test`, `db` and
   `secrets` appear and pass in < 10 min (SC-004).
2. Apply the ruleset (owner, once; the repo must be public):

   ```bash
   gh api -X POST repos/{owner}/{repo}/rulesets --input - <<'JSON'
   {
     "name": "ci-gate",
     "target": "branch",
     "enforcement": "active",
     "conditions": { "ref_name": { "include": ["refs/heads/main", "refs/heads/[0-9][0-9][0-9]-*"], "exclude": [] } },
     "rules": [
       { "type": "deletion" },
       { "type": "non_fast_forward" },
       { "type": "pull_request", "parameters": { "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false, "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": false } },
       { "type": "required_status_checks", "parameters": { "strict_required_status_checks_policy": false,
         "required_status_checks": [ {"context":"lint"}, {"context":"typecheck"}, {"context":"test"}, {"context":"db"}, {"context":"secrets"} ] } }
     ]
   }
   JSON
   gh api repos/{owner}/{repo}/rulesets      # confirm "ci-gate" is active
   ```

3. Open five throwaway PRs from [ci-checks.md § deliberate faults](contracts/ci-checks.md). Each
   fails exactly its matching check, and the merge button is blocked (SC-003, FR-012). Close them
   without merging.
4. Open a PR that only edits a placeholder in an `.env.example`. `secrets` passes (US-2 #5).
5. Re-run CI on an unchanged PR. The `lint`/`typecheck`/`test` logs show Turbo `cache hit`
   (US-2 #6).
6. Once M1 adds a `.test.sql`, it runs in `db` with no workflow change (SC-007).

## Validation log

Recorded 2026-10-18. Fresh clone of `m0/t018-validate-us1` (`6150ffcd`) into a temp directory.
Setup followed the README: `nvm use`, `corepack enable`, `pnpm install`, `pnpm dev`. Before the
first `pnpm dev`, `pnpm db:stop` stopped the already-running local stack so that start was not a
reuse. No README step failed, so `README.md` was not changed.

Measured times (SC-001: first run under 15 min, later runs under 2 min):

| Step                              | Time   |
| --------------------------------- | ------ |
| `pnpm install`                    | 5.61 s |
| First `pnpm dev` until `/healthz` | 34.1 s |
| Later `pnpm dev` until `/healthz` | 3.4 s  |

| Check                         | Result | Evidence                                                                                                                                                                 |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V1 US-1 #1 addresses          | pass   | `[dev]` summary printed Supabase API `:54321`, Studio `:54323`, Mailpit `:54324`, Preview API `:8787/healthz`, and the unpacked extension path.                          |
| V1 US-1 #2 env created        | pass   | `created` both `.env` files from the examples; URLs match stack `API_URL`; anon key matches status; no service-role key written.                                         |
| V1 US-1 #3 file untouched     | pass   | Rerun printed `found … (left unchanged)` with identical checksums. After editing `WXT_PREVIEW_API_URL`, the next run left that file byte-identical.                      |
| V1 US-1 #4 `/healthz`         | pass   | `curl` returned `{"ok":true}`.                                                                                                                                           |
| V1 US-1 #5 unpacked extension | manual | `apps/extension/.output/chrome-mv3-dev/manifest.json` is Manifest V3 with `action.default_popup` `popup.html`. Needs a manual browser check by the owner.                |
| V1 US-1 #6 reuse running DB   | pass   | Later `pnpm dev` printed `supabase: already running (reused)`.                                                                                                           |
| V1 US-1 #7 Ctrl-C then stop   | pass   | SIGINT (exit 130) took `/healthz` down and stopped the extension build; port 54321 stayed up (`supabase status` exit 0). `pnpm db:stop` then stopped it (status exit 1). |
| V2 Docker missing             | pass   | `scripts/dev.mjs` on a PATH with node and no `docker`: exit 1, the one-line Docker message, no stack trace. The Docker daemon was not stopped.                           |
| V2 wrong Node, `pnpm dev`     | pass   | Node 26.11.1: exit 1, `[dev] Node 24 is required (found 26.11.1)…`, no stack trace.                                                                                      |
| V2 wrong Node, `pnpm install` | pass   | Exit 1, `ERR_PNPM_UNSUPPORTED_ENGINE`, wanted `{"node":">=24 <25"}`, current `26.11.1`.                                                                                  |
| V2 port 8787 busy             | pass   | `python3 -m http.server 8787`, then `pnpm dev`, printed `@markme/preview-api:dev: preview-api: port 8787 is already in use`.                                             |
| V2 `git status` after dev     | pass   | `git status --short` listed no `.env` files. Both are ignored by `.gitignore`.                                                                                           |

Caveats:

- Docker images were already cached. Image download time was not re-measured. The 34.1 s first
  `pnpm dev` is a start after `pnpm db:stop` with cached images, not a cold image pull.
- US-1 #5 (load unpacked, no errors, placeholder popup) was not done in a browser. The owner still
  needs to load `apps/extension/.output/chrome-mv3-dev`.
- In this non-interactive shell, `nvm use` needed `source ~/.nvm/nvm.sh` first. That is shell
  setup, not a README gap. An interactive shell that already loads nvm follows the README as written.

### V5 CI checks (T023, 2026-10-18)

PR [#22](https://github.com/MostafaAbuHamed/MarkMe/pull/22) (`m0/t022-ci-secrets`, the first branch with all
five jobs), workflow run `39110291727`.

| Check                          | Result | Evidence                                                                               |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| Five checks appear on the PR   | pass   | `lint` 28 s, `typecheck` 18 s, `test` 17 s, `db` 2 m 1 s, `secrets` 9 s, all `success` |
| Clean PR under 10 min (SC-004) | pass   | Whole run 2 m 3 s (08:08:20 → 08:10:23 UTC); jobs run in parallel                      |
| No stored secrets (FR-016)     | pass   | `ci.yml` has no `secrets.*` reference; permissions are `contents: read`                |
| Results reused (US-2 #6)       | pass   | Re-run (attempt 2): Turbo `5/5`, `4/4`, `2/2` cached, `FULL TURBO` in all three jobs   |

### Merge blocking (T024, 2026-10-18)

Ruleset `ci-gate` applied with the command in V5 step 2. Ruleset id **25337047**, enforcement
`active`, no bypass actors. `gh api repos/MostafaAbuHamed/MarkMe/rules/branches/<branch>` returns
`deletion, non_fast_forward, pull_request, required_status_checks` for both `main` and
`001-m0-monorepo-foundation`. It returns nothing for the per-task branches (`m0/t0NN-*`), which are
not milestone branches.

### Deliberate-fault proofs (T025, 2026-10-18)

Six throwaway draft PRs into `001-m0-monorepo-foundation` (protected by `ci-gate`), each holding the
whole M0 stack plus one change. All were closed unmerged and their branches deleted.

| PR  | Fault                                                                                | Failing check | Other checks | Merge state | Evidence                                                                                                 |
| --- | ------------------------------------------------------------------------------------ | ------------- | ------------ | ----------- | -------------------------------------------------------------------------------------------------------- |
| #25 | un-awaited promise in `packages/domain/src/fault.ts`                                 | `lint`        | 4 pass       | BLOCKED     | `fault.ts 2:3 @typescript-eslint/no-floating-promises` (and `1:8 require-await`)                         |
| #26 | `const fault: number = "a"`                                                          | `typecheck`   | 4 pass       | BLOCKED     | tsc type error in `fault.ts`                                                                             |
| #27 | `expect(1).toBe(2)` in a domain test                                                 | `test`        | 4 pass       | BLOCKED     | Vitest failure                                                                                           |
| #28 | `select ok(false, …)` in `supabase/tests/001-fault.test.sql`                         | `db`          | 4 pass       | BLOCKED     | pgTAP failure                                                                                            |
| #29 | generic high-entropy API key added in one commit, removed in the next                | `secrets`     | 4 pass       | BLOCKED     | `generic-api-key`, `scripts/fault-config.txt:1`, commit `0ba4ab07`; the final diff no longer has the key |
| #30 | placeholder-only `.env.example` change (`replace-with-your-local-anon-key`), US-2 #5 | none          | 5 pass       | CLEAN       | `secrets` passes                                                                                         |

SC-003: five of five faults caught. FR-012: merging is blocked while a required check fails.
