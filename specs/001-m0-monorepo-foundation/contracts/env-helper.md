# Contract: `parseEnv` helper (`@markme/domain`)

Exported from `packages/domain/src/index.ts`. It is the only env-validation code path in the repo
(research R11).

```ts
import type { z } from "zod";

export interface EnvIssue {
  key: string;
  kind: "missing" | "invalid";
  expected: string; // from the schema field's .describe(); "a valid value" if none
}

export class EnvError extends Error {
  readonly app: string;
  readonly issues: readonly EnvIssue[]; // sorted by key, one per key
  readonly exampleFile: string;
}

export function parseEnv<S extends z.ZodObject>(
  schema: S,
  source: Record<string, string | undefined>,
  options: { app: string; exampleFile: string },
): z.infer<S>;
```

## Behaviour

| Input | Result |
| --- | --- |
| All keys valid | Returns the parsed, typed object (defaults applied, coerced numbers) |
| A required key `undefined` or `""` | Issue `{ kind: "missing" }`. An empty string counts as missing |
| A key present but failing its format | Issue `{ kind: "invalid", expected: <description> }` |
| Several bad keys | One `EnvError` with every issue (never throws on the first) |
| Keys not in the schema | Ignored. `process.env` holds many unrelated keys |

## Message format (exact)

```text
<app>: invalid configuration
  - SUPABASE_URL: missing
  - PORT: invalid, expected a port number from 1 to 65535
Copy apps/<app>/.env.example to apps/<app>/.env and fill in the values.
```

## Guarantees (each has a unit test in `packages/domain`)

1. The message never contains any value from `source`. Tested by feeding unique sentinel strings
   as invalid values and asserting none appear in `message` or `JSON.stringify(error)` (FR-019).
2. Every issue is reported, not only the first (US-3 #2).
3. `"   "` and `""` are treated as missing for required strings.
4. `kind` is `missing` versus `invalid` correctly for a coerced number field (`PORT=abc` is
   invalid; `PORT` unset uses the default).
