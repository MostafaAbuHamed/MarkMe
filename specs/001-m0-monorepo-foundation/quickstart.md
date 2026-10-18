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
