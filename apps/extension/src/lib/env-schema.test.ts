import { EnvError } from "@markme/domain";
import { describe, expect, it } from "vitest";

import { extensionEnvSchema, loadExtensionEnv } from "./env-schema";

const SUPABASE_URL = "http://127.0.0.1:54321";
const PUBLISHABLE_KEY = "sb_publishable_test_00000000000000000000";
const PREVIEW_API_URL = "http://127.0.0.1:8787";

const validSource = {
  WXT_SUPABASE_URL: SUPABASE_URL,
  WXT_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
  WXT_PREVIEW_API_URL: PREVIEW_API_URL,
};

const SUPABASE_URL_EXPECTED = "an http(s) URL, e.g. http://127.0.0.1:54321";
const PUBLISHABLE_KEY_EXPECTED =
  "a publishable key (sb_publishable_…) printed by `pnpm exec supabase status`";
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
      WXT_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      WXT_PREVIEW_API_URL: PREVIEW_API_URL,
    });
  });

  it("reports WXT_SUPABASE_PUBLISHABLE_KEY missing when only the old anon key is set", () => {
    const oldAnonValue = "SENTINEL-old-anon-e5";
    const error = captureEnvError({
      WXT_SUPABASE_URL: SUPABASE_URL,
      WXT_SUPABASE_ANON_KEY: oldAnonValue,
      WXT_PREVIEW_API_URL: PREVIEW_API_URL,
    });

    expect(error.issues).toEqual([
      {
        key: "WXT_SUPABASE_PUBLISHABLE_KEY",
        kind: "missing",
        expected: PUBLISHABLE_KEY_EXPECTED,
      },
    ]);
    expect(error.message).toMatch(
      /Copy apps\/extension\/\.env\.example to apps\/extension\/\.env and fill in the values\.$/,
    );
    expect(error.message).not.toContain(oldAnonValue);
    expect(String(error)).not.toContain(oldAnonValue);
    expect(JSON.stringify(error)).not.toContain(oldAnonValue);
  });

  it.each([
    ["WXT_SUPABASE_URL", SUPABASE_URL_EXPECTED],
    ["WXT_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY_EXPECTED],
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
    [
      "WXT_SUPABASE_PUBLISHABLE_KEY",
      "replace-with-local-publishable-key",
      PUBLISHABLE_KEY_EXPECTED,
    ],
    ["WXT_SUPABASE_PUBLISHABLE_KEY", "short", PUBLISHABLE_KEY_EXPECTED],
    [
      "WXT_SUPABASE_PUBLISHABLE_KEY",
      "eyJhbGciOiJIUzI1NiJ9.fake.fake-signature",
      PUBLISHABLE_KEY_EXPECTED,
    ],
    [
      "WXT_SUPABASE_PUBLISHABLE_KEY",
      "sb_secret_test_00000000000000000000",
      PUBLISHABLE_KEY_EXPECTED,
    ],
    ["WXT_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_short", PUBLISHABLE_KEY_EXPECTED],
    [
      "WXT_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_has spaces_000000000000",
      PUBLISHABLE_KEY_EXPECTED,
    ],
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
      WXT_SUPABASE_PUBLISHABLE_KEY: "short",
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
        key: "WXT_SUPABASE_PUBLISHABLE_KEY",
        kind: "invalid",
        expected: PUBLISHABLE_KEY_EXPECTED,
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
        "  - WXT_SUPABASE_PUBLISHABLE_KEY: invalid, expected a publishable key (sb_publishable_…) printed by `pnpm exec supabase status`",
        "  - WXT_SUPABASE_URL: invalid, expected an http(s) URL, e.g. http://127.0.0.1:54321",
        "Copy apps/extension/.env.example to apps/extension/.env and fill in the values.",
      ].join("\n"),
    );
  });

  it("omits a refused secret-shaped publishable key from the error", () => {
    const sentinelKey = "sb_secret_SENTINEL-key-d4-000000000000";
    const error = captureEnvError({
      ...validSource,
      WXT_SUPABASE_PUBLISHABLE_KEY: sentinelKey,
    });

    expect(error.issues).toEqual([
      {
        key: "WXT_SUPABASE_PUBLISHABLE_KEY",
        kind: "invalid",
        expected: PUBLISHABLE_KEY_EXPECTED,
      },
    ]);
    expect(error.message).not.toContain(sentinelKey);
    expect(String(error)).not.toContain(sentinelKey);
    expect(JSON.stringify(error)).not.toContain(sentinelKey);
  });

  it("omits invalid source values from the error", () => {
    const sentinelUrl = "SENTINEL-url-a1";
    const sentinelKey = "SENTINEL-key-b2";
    const sentinelApi = "SENTINEL-api-c3";
    const error = captureEnvError({
      WXT_SUPABASE_URL: sentinelUrl,
      WXT_SUPABASE_PUBLISHABLE_KEY: sentinelKey,
      WXT_PREVIEW_API_URL: sentinelApi,
    });

    expect(error.issues).toEqual([
      {
        key: "WXT_PREVIEW_API_URL",
        kind: "invalid",
        expected: PREVIEW_API_URL_EXPECTED,
      },
      {
        key: "WXT_SUPABASE_PUBLISHABLE_KEY",
        kind: "invalid",
        expected: PUBLISHABLE_KEY_EXPECTED,
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
      "WXT_SUPABASE_PUBLISHABLE_KEY",
      "WXT_SUPABASE_URL",
    ]);
    for (const key of Object.keys(extensionEnvSchema.shape)) {
      expect(key).not.toMatch(/SERVICE|SECRET|JWT|ANON/);
    }
  });
});
