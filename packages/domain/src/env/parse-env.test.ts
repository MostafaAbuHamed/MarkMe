import { describe, expect, it } from "vitest";
import { z } from "zod";

import { EnvError, parseEnv } from "./parse-env";

const schema = z.object({
  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(8787)
    .describe("a port number from 1 to 65535"),
  SUPABASE_URL: z
    .url({ protocol: /^https?$/ })
    .describe("an http(s) URL, e.g. http://127.0.0.1:54321"),
  API_TOKEN: z.string().min(10).describe("a token of at least 10 characters"),
});

const options = {
  app: "test-app",
  exampleFile: "apps/test-app/.env.example",
};

const validSource = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  API_TOKEN: "abcdefghij",
};

function captureEnvError(
  source: Record<string, string | undefined>,
  parseOptions: { app: string; exampleFile: string } = options,
): EnvError {
  try {
    parseEnv(schema, source, parseOptions);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof EnvError)) {
      throw error;
    }
    return error;
  }

  throw new Error("expected parseEnv to throw EnvError");
}

describe("parseEnv", () => {
  it("returns typed values and defaults an unset PORT to 8787", () => {
    const result = parseEnv(schema, validSource, options);

    expect(result).toEqual({
      PORT: 8787,
      SUPABASE_URL: "http://127.0.0.1:54321",
      API_TOKEN: "abcdefghij",
    });
  });

  it('coerces PORT "3000" to the number 3000', () => {
    const result = parseEnv(schema, { ...validSource, PORT: "3000" }, options);

    expect(result).toEqual({
      PORT: 3000,
      SUPABASE_URL: "http://127.0.0.1:54321",
      API_TOKEN: "abcdefghij",
    });
  });

  it("reports an undefined required key as missing with its description", () => {
    const error = captureEnvError({ ...validSource, SUPABASE_URL: undefined });

    expect(error.issues).toEqual([
      {
        key: "SUPABASE_URL",
        kind: "missing",
        expected: "an http(s) URL, e.g. http://127.0.0.1:54321",
      },
    ]);
  });

  it.each(["", "   "])("treats %j as missing for required strings", (blank) => {
    const error = captureEnvError({
      PORT: "8787",
      SUPABASE_URL: blank,
      API_TOKEN: blank,
    });

    expect(error.issues).toEqual([
      {
        key: "API_TOKEN",
        kind: "missing",
        expected: "a token of at least 10 characters",
      },
      {
        key: "SUPABASE_URL",
        kind: "missing",
        expected: "an http(s) URL, e.g. http://127.0.0.1:54321",
      },
    ]);
  });

  it('reports PORT "abc" as invalid with the field description', () => {
    const error = captureEnvError({ ...validSource, PORT: "abc" });

    expect(error.issues).toEqual([
      {
        key: "PORT",
        kind: "invalid",
        expected: "a port number from 1 to 65535",
      },
    ]);
  });

  it("reports every bad key in one EnvError, sorted by key", () => {
    const error = captureEnvError({
      SUPABASE_URL: "not-a-url",
      PORT: "abc",
    });

    expect(error.issues).toEqual([
      {
        key: "API_TOKEN",
        kind: "missing",
        expected: "a token of at least 10 characters",
      },
      {
        key: "PORT",
        kind: "invalid",
        expected: "a port number from 1 to 65535",
      },
      {
        key: "SUPABASE_URL",
        kind: "invalid",
        expected: "an http(s) URL, e.g. http://127.0.0.1:54321",
      },
    ]);
    expect(error.message).toBe(
      [
        "test-app: invalid configuration",
        "  - API_TOKEN: missing",
        "  - PORT: invalid, expected a port number from 1 to 65535",
        "  - SUPABASE_URL: invalid, expected an http(s) URL, e.g. http://127.0.0.1:54321",
        "Copy apps/test-app/.env.example to apps/test-app/.env and fill in the values.",
      ].join("\n"),
    );
  });

  it("formats a missing key and an invalid key in key order", () => {
    const error = captureEnvError({ ...validSource, PORT: "abc", SUPABASE_URL: undefined });

    expect(error.message).toBe(
      "test-app: invalid configuration\n  - PORT: invalid, expected a port number from 1 to 65535\n  - SUPABASE_URL: missing\nCopy apps/test-app/.env.example to apps/test-app/.env and fill in the values.",
    );
  });

  it("builds the footer from exampleFile, stripping only the trailing .example", () => {
    const error = captureEnvError(
      { ...validSource, PORT: "abc", SUPABASE_URL: undefined },
      { app: "test-app", exampleFile: "apps/foo.example/.env.example" },
    );

    expect(error.exampleFile).toBe("apps/foo.example/.env.example");
    expect(error.message).toBe(
      "test-app: invalid configuration\n  - PORT: invalid, expected a port number from 1 to 65535\n  - SUPABASE_URL: missing\nCopy apps/foo.example/.env.example to apps/foo.example/.env and fill in the values.",
    );
  });

  it("omits invalid source values from the error", () => {
    const error = captureEnvError({
      PORT: "SENTINEL-9f2c-secret",
      SUPABASE_URL: "https:SENTINEL-url",
      API_TOKEN: "abcdefghij",
    });

    expect(error.issues).toEqual([
      {
        key: "PORT",
        kind: "invalid",
        expected: "a port number from 1 to 65535",
      },
      {
        key: "SUPABASE_URL",
        kind: "invalid",
        expected: "an http(s) URL, e.g. http://127.0.0.1:54321",
      },
    ]);
    expect(error.message).not.toContain("SENTINEL");
    expect(JSON.stringify(error)).not.toContain("SENTINEL");
    expect(String(error)).not.toContain("SENTINEL");
  });

  it("ignores keys that are not in the schema", () => {
    const result = parseEnv(
      schema,
      {
        ...validSource,
        PORT: "3000",
        EXTRA_FLAG: "1",
        PATH: "/tmp",
      },
      options,
    );

    expect(result).toEqual({
      PORT: 3000,
      SUPABASE_URL: "http://127.0.0.1:54321",
      API_TOKEN: "abcdefghij",
    });
  });

  it("throws an EnvError that is an Error with app, exampleFile, and name", () => {
    const error = captureEnvError({ ...validSource, API_TOKEN: undefined });

    expect(error).toBeInstanceOf(EnvError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EnvError");
    expect(error.app).toBe("test-app");
    expect(error.exampleFile).toBe("apps/test-app/.env.example");
    expect(error.issues).toEqual([
      {
        key: "API_TOKEN",
        kind: "missing",
        expected: "a token of at least 10 characters",
      },
    ]);
  });
});
