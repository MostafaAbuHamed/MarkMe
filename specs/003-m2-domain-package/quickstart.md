# Quickstart: Validate M2

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Runbook that proves the M2 exit criteria. Rules and tables are in the [data model](data-model.md)
and the [contract](contracts/domain-package.md); this file does not repeat them.

## Prerequisites

- M0 prerequisites (Node 24 via `.nvmrc`, pnpm through corepack). Non-interactive shells:
  `source ~/.nvm/nvm.sh && nvm use`.
- `pnpm install` done. No `.env`, Docker or Supabase is needed for V1–V5: every M2 test is a
  unit test with no network.

## V1. All rules pass and the coverage gate holds (SC-001–SC-004, FR-019, FR-020)

```bash
pnpm --filter @markme/domain test
```

Expected: every test file passes, and the coverage table shows 100% lines and branches for
`src/url/normalize.ts`, `src/url/parse-user-url.ts` and `src/url/provider.ts`. The command exits 0.
This is the milestone's exit verification.

Gate check (do not commit): comment out one `it.each` row that covers a branch in
`src/url/normalize.ts` and rerun. Expected: `ERROR: Coverage for branches (…) does not meet
"src/url/**" threshold (100 %)` and exit code 1. Restore the row.

## V2. Enums follow the database (SC-004)

```bash
pnpm --filter @markme/domain exec vitest run src/schemas/enums.test.ts
```

Expected: pass. The test compares each schema's `options` with `Constants.public.Enums` and the
inferred types with `Enums<…>`. Because the schemas are built from `Constants`, a migration that
changes an enum changes them too after `pnpm db:types`; no domain file needs an edit.

## V3. The rules entry point does not load the client library (SC-005, FR-018)

```bash
pnpm --filter @markme/domain exec vitest run src/index.test.ts
pnpm --filter @markme/domain lint
```

Expected: both pass. The first imports `@markme/domain` with `@supabase/supabase-js` mocked to
throw. The second fails if any file outside `src/client/` imports `@supabase/supabase-js`.

## V4. Factory behavior (SC-005, FR-015–FR-017)

```bash
pnpm --filter @markme/domain exec vitest run src/client/factory.test.ts
```

Expected: pass. The test covers the session read and remove through the passed storage, the exact
fixed `auth` options, the `detectSessionInUrl` default and override, the dropped `lock`, and two
calls returning two clients. No network request is made.

## V5. Whole repo still green (SC-006)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all pass. `pnpm typecheck` includes the `@ts-expect-error` line that proves `lock` is
not an accepted option.

## V6. One-command setup still works (SC-006, constitution)

```bash
pnpm dev
```

Expected: local Supabase, the preview API (`http://127.0.0.1:8787/healthz` → 200) and the
extension dev build start as before. M2 changes no app, so nothing new appears.

## V7. Spot check in a REPL (optional)

```bash
pnpm --filter @markme/domain exec node --experimental-strip-types -e \
  "import('./src/url/normalize.ts').then(m => console.log(m.normalizeUrl(' HTTPS://Ex.COM:443/A/?utm_source=x&id=2#top ')))"
```

Expected: `{ ok: true, url: 'https://ex.com/A/?utm_source=x&id=2#top', normalizedUrl: 'https://ex.com/A?id=2' }`.

## CI

The existing five required checks cover M2 with no workflow change: `lint` (import guard),
`typecheck`, `test` (runs the domain `test` script, so the coverage gate), `db` (unchanged),
`secrets`.
