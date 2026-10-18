import { EnvError } from "@markme/domain";
import { describe, expect, it } from "vitest";

import { extensionEnvSchema, loadExtensionEnv } from "./env-schema";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = "eyJhbGciOiJIUzI1NiJ9.fake.fake-signature";
const PREVIEW_API_URL = "http://127.0.0.1:8787";

const validSource = {
  WXT_SUPABASE_URL: SUPABASE_URL,
  WXT_SUPABASE_ANON_KEY: ANON_KEY,
  WXT_PREVIEW_API_URL: PREVIEW_API_URL,
};

const SUPABASE_URL_EXPECTED = "an http(s) URL, e.g. http://127.0.0.1:54321";
const ANON_KEY_EXPECTED = "the public anon key printed by `pnpm exec supabase status`";
const PREVIEW_API_URL_EXPECTED = "an http(s) URL, e.g. http://127.0.0.1:8787";

function captureEnvError(source: Record<string, string | undefined>): EnvError {
  try {
    loadExtensionEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof EnvError)) {
      throw error;
    }
    return error;
  }

  throw new Error("expected loadExtensionEnv to throw EnvError");
}

describe("loadExtensionEnv", () => {
  it("returns the three configured values", () => {
    const result = loadExtensionEnv(validSource);

    expect(result).toEqual({
      WXT_SUPABASE_URL: SUPABASE_URL,
      WXT_SUPABASE_ANON_KEY: ANON_KEY,
      WXT_PREVIEW_API_URL: PREVIEW_API_URL,
    });
  });

  it.each([
    ["WXT_SUPABASE_URL", SUPABASE_URL_EXPECTED],
    ["WXT_SUPABASE_ANON_KEY", ANON_KEY_EXPECTED],
    ["WXT_PREVIEW_API_URL", PREVIEW_API_URL_EXPECTED],
  ] as const)("reports a missing %s", (key, expected) => {
    const source: Record<string, string | undefined> = { ...validSource };
    delete source[key];

    const error = captureEnvError(source);

    expect(error.issues).toEqual([
      {
        key,
        kind: "missing",
        expected,
      },
    ]);
  });

  it.each([
    ["WXT_SUPABASE_URL", "not-a-url", SUPABASE_URL_EXPECTED],
    ["WXT_SUPABASE_URL", "ftp://x", SUPABASE_URL_EXPECTED],
    ["WXT_PREVIEW_API_URL", "not-a-url", PREVIEW_API_URL_EXPECTED],
    ["WXT_SUPABASE_ANON_KEY", "replace-with-local-anon-key", ANON_KEY_EXPECTED],
    ["WXT_SUPABASE_ANON_KEY", "short", ANON_KEY_EXPECTED],
  ] as const)("reports %s %j as invalid", (key, value, expected) => {
    const error = captureEnvError({ ...validSource, [key]: value });

    expect(error.issues).toEqual([
      {
        key,
        kind: "invalid",
        expected,
      },
    ]);
  });

  it("reports all three bad keys in one EnvError, sorted by key", () => {
    const error = captureEnvError({
      WXT_SUPABASE_URL: "ftp://x",
      WXT_SUPABASE_ANON_KEY: "short",
      WXT_PREVIEW_API_URL: "not-a-url",
    });

    expect(error).toBeInstanceOf(EnvError);
    expect(error.issues).toEqual([
      {
        key: "WXT_PREVIEW_API_URL",
        kind: "invalid",
        expected: PREVIEW_API_URL_EXPECTED,
      },
      {
        key: "WXT_SUPABASE_ANON_KEY",
        kind: "invalid",
        expected: ANON_KEY_EXPECTED,
      },
      {
        key: "WXT_SUPABASE_URL",
        kind: "invalid",
        expected: SUPABASE_URL_EXPECTED,
      },
    ]);
    expect(error.message).toBe(
      [
        "extension: invalid configuration",
        "  - WXT_PREVIEW_API_URL: invalid, expected an http(s) URL, e.g. http://127.0.0.1:8787",
        "  - WXT_SUPABASE_ANON_KEY: invalid, expected the public anon key printed by `pnpm exec supabase status`",
        "  - WXT_SUPABASE_URL: invalid, expected an http(s) URL, e.g. http://127.0.0.1:54321",
        "Copy apps/extension/.env.example to apps/extension/.env and fill in the values.",
      ].join("\n"),
    );
  });

  it("omits invalid source values from the error", () => {
    const sentinelUrl = "SENTINEL-url-a1";
    const sentinelKey = "SENTINEL-key-b2";
    const sentinelApi = "SENTINEL-api-c3";
    const error = captureEnvError({
      WXT_SUPABASE_URL: sentinelUrl,
      WXT_SUPABASE_ANON_KEY: sentinelKey,
      WXT_PREVIEW_API_URL: sentinelApi,
    });

    expect(error.issues).toEqual([
      {
        key: "WXT_PREVIEW_API_URL",
        kind: "invalid",
        expected: PREVIEW_API_URL_EXPECTED,
      },
      {
        key: "WXT_SUPABASE_ANON_KEY",
        kind: "invalid",
        expected: ANON_KEY_EXPECTED,
      },
      {
        key: "WXT_SUPABASE_URL",
        kind: "invalid",
        expected: SUPABASE_URL_EXPECTED,
      },
    ]);
    expect(error.message).not.toContain(sentinelUrl);
    expect(error.message).not.toContain(sentinelKey);
    expect(error.message).not.toContain(sentinelApi);
    expect(JSON.stringify(error)).not.toContain(sentinelUrl);
    expect(JSON.stringify(error)).not.toContain(sentinelKey);
    expect(JSON.stringify(error)).not.toContain(sentinelApi);
    expect(String(error)).not.toContain(sentinelUrl);
    expect(String(error)).not.toContain(sentinelKey);
    expect(String(error)).not.toContain(sentinelApi);
  });

  it("locks extensionEnvSchema to the three public keys", () => {
    expect(Object.keys(extensionEnvSchema.shape).sort()).toEqual([
      "WXT_PREVIEW_API_URL",
      "WXT_SUPABASE_ANON_KEY",
      "WXT_SUPABASE_URL",
    ]);
    for (const key of Object.keys(extensionEnvSchema.shape)) {
      expect(key).not.toMatch(/SERVICE|SECRET|JWT/);
    }
  });
});
