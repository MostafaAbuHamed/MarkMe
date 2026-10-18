import { z } from "zod";

export interface EnvIssue {
  key: string;
  kind: "missing" | "invalid";
  expected: string;
}

const FALLBACK_EXPECTED = "a valid value";
const EXAMPLE_SUFFIX = ".example";

export class EnvError extends Error {
  override readonly name = "EnvError";
  readonly app: string;
  readonly issues: readonly EnvIssue[];
  readonly exampleFile: string;

  constructor(app: string, issues: readonly EnvIssue[], exampleFile: string) {
    super(formatMessage(app, issues, exampleFile));
    this.app = app;
    this.issues = issues;
    this.exampleFile = exampleFile;
  }
}

export function parseEnv<S extends z.ZodObject>(
  schema: S,
  source: Record<string, string | undefined>,
  options: { app: string; exampleFile: string },
): z.infer<S> {
  const fields = schema.shape as Readonly<Record<string, z.ZodType>>;
  const input: Record<string, string | undefined> = {};

  for (const key of Object.keys(fields)) {
    input[key] = blankToUndefined(source[key]);
  }

  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const failedKeys = new Set<string>();
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && Object.hasOwn(fields, key)) {
      failedKeys.add(key);
    }
  }

  const issues: EnvIssue[] = [...failedKeys].sort().map((key) => {
    const field = fields[key];
    return {
      key,
      kind: input[key] === undefined ? "missing" : "invalid",
      expected: field === undefined ? FALLBACK_EXPECTED : expectedFor(field),
    };
  });

  throw new EnvError(options.app, issues, options.exampleFile);
}

function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value;
}

function formatMessage(app: string, issues: readonly EnvIssue[], exampleFile: string): string {
  const lines = [`${app}: invalid configuration`];
  for (const issue of issues) {
    lines.push(issue.kind === "missing" ? `  - ${issue.key}: missing` : invalidLine(issue));
  }
  lines.push(
    `Copy ${exampleFile} to ${withoutTrailingExample(exampleFile)} and fill in the values.`,
  );
  return lines.join("\n");
}

function invalidLine(issue: EnvIssue): string {
  return `  - ${issue.key}: invalid, expected ${issue.expected}`;
}

function withoutTrailingExample(exampleFile: string): string {
  if (!exampleFile.endsWith(EXAMPLE_SUFFIX)) {
    return exampleFile;
  }
  return exampleFile.slice(0, -EXAMPLE_SUFFIX.length);
}

/**
 * `.describe()` stores its text on that schema instance (`description` reads
 * `z.globalRegistry`, same as `.meta()?.description`). A later `.default()`
 * wraps a new schema that does not inherit the registry entry, so walk
 * `unwrap()` until a description is found.
 */
function expectedFor(field: z.ZodType): string {
  const seen = new Set<z.ZodType>();
  let current: z.ZodType | undefined = field;

  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const description = current.description ?? current.meta()?.description;
    if (description !== undefined && description !== "") {
      return description;
    }
    if (!isUnwrappable(current)) {
      break;
    }
    current = current.unwrap();
  }

  return FALLBACK_EXPECTED;
}

function isUnwrappable(field: z.ZodType): field is z.ZodType & { unwrap(): z.ZodType } {
  return "unwrap" in field && typeof field.unwrap === "function";
}
