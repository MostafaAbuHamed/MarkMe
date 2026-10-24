# Contract: bundle secret check (`scripts/check-bundle-secrets.mjs`)

Covers FR-006; US2 scenario 4. Replaces the M8 design in `docs/IMPLEMENTATION_PLAN.md` (same file
name), adding the `anon` JWT rule.

## Pure API

```js
/** @returns {Array<{ kind: FindingKind }>} */
export function scanText(text);

/** Walks `dir` recursively, reads every file as UTF-8, returns findings with relative paths. */
export async function scanDirectory(dir); // Promise<Array<{ file: string, kind: FindingKind }>>
```

## Rules

| Kind                      | Match                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `secret-key`              | `/sb_secret_[A-Za-z0-9_-]{20,}/`                                                                                       |
| `service-role-name`       | `/SERVICE_ROLE/`                                                                                                       |
| `legacy-jwt-anon`         | `/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/` whose base64url payload parses to JSON with `role === "anon"` |
| `legacy-jwt-service_role` | same JWT match, `role === "service_role"`                                                                              |

Not findings: the bare string `"sb_secret_"` (shipped by `supabase-js`), `sb_publishable_…` keys,
JWTs with any other role or an undecodable payload.

## CLI

```bash
node scripts/check-bundle-secrets.mjs [dir]   # default: apps/extension/.output/chrome-mv3
```

- Exit 0, prints `bundle-secrets: no findings in <dir>`.
- Exit 1 on any finding, one line each: `bundle-secrets: <kind> in <file>`. Never prints the
  matched text.
- Exit 2 if `dir` does not exist (with a message to build first).

## Tests (`scripts/check-bundle-secrets.test.mjs`, written first)

One case per rule (positive), the negatives above, value never in output, and a temp-dir
`scanDirectory` case with a nested file. JWT fixtures are built in the test from JSON payloads
(no real keys committed; avoids gitleaks hits).

CI wiring (a `bundle-secrets` job that builds the extension) stays in M8 with the release
workflow (research R6).
