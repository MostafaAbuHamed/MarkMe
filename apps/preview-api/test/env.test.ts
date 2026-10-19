import { EnvError } from "@markme/domain";
import { describe, expect, it } from "vitest";

import { loadEnv, previewApiEnvSchema } from "../src/env";

const SUPABASE_URL = "http://127.0.0.1:54321";

function captureEnvError(source: Record<string, string | undefined>): EnvError {
  try {
    loadEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof EnvError)) {
      throw error;
    }
    return error;
  }

  throw new Error("expected loadEnv to throw EnvError");
}

describe("loadEnv", () => {
  it("returns typed values and defaults an unset PORT to 8787", () => {
    const result = loadEnv({ SUPABASE_URL });

    expect(result).toEqual({
      PORT: 8787,
      SUPABASE_URL,
    });
  });

  it('coerces PORT "3000" to the number 3000', () => {
    const result = loadEnv({ PORT: "3000", SUPABASE_URL });

    expect(result).toEqual({
      PORT: 3000,
      SUPABASE_URL,
    });
  });

  it("reports a missing SUPABASE_URL", () => {
    const error = captureEnvError({});

    expect(error.issues).toEqual([
      {
        key: "SUPABASE_URL",
        kind: "missing",
        expected: "an http(s) URL, e.g. http://127.0.0.1:54321",
      },
    ]);
    expect(error.message).toBe(
      "preview-api: invalid configuration\n  - SUPABASE_URL: missing\nCopy apps/preview-api/.env.example to apps/preview-api/.env and fill in the values.",
    );
  });

  it.each(["not-a-url", "ftp://x"])("reports SUPABASE_URL %j as invalid", (url) => {
    const error = captureEnvError({ SUPABASE_URL: url });

    expect(error.issues).toEqual([
      {
        key: "SUPABASE_URL",
        kind: "invalid",
        expected: "an http(s) URL, e.g. http://127.0.0.1:54321",
      },
    ]);
    expect(error.message).toBe(
      "preview-api: invalid configuration\n  - SUPABASE_URL: invalid, expected an http(s) URL, e.g. http://127.0.0.1:54321\nCopy apps/preview-api/.env.example to apps/preview-api/.env and fill in the values.",
    );
  });

  it.each(["abc", "0", "70000", "1.5"])("reports PORT %j as invalid", (port) => {
    const error = captureEnvError({ PORT: port, SUPABASE_URL });

    expect(error.issues).toEqual([
      {
        key: "PORT",
        kind: "invalid",
        expected: "a port number from 1 to 65535",
      },
    ]);
    expect(error.message).toBe(
      "preview-api: invalid configuration\n  - PORT: invalid, expected a port number from 1 to 65535\nCopy apps/preview-api/.env.example to apps/preview-api/.env and fill in the values.",
    );
  });

  it("reports PORT and a missing SUPABASE_URL in one EnvError", () => {
    const error = captureEnvError({ PORT: "abc" });

    expect(error.issues).toEqual([
      {
        key: "PORT",
        kind: "invalid",
        expected: "a port number from 1 to 65535",
      },
      {
        key: "SUPABASE_URL",
        kind: "missing",
        expected: "an http(s) URL, e.g. http://127.0.0.1:54321",
      },
    ]);
    expect(error.message).toBe(
      "preview-api: invalid configuration\n  - PORT: invalid, expected a port number from 1 to 65535\n  - SUPABASE_URL: missing\nCopy apps/preview-api/.env.example to apps/preview-api/.env and fill in the values.",
    );
  });

  it("omits invalid source values from the error", () => {
    const error = captureEnvError({
      PORT: "SENTINEL-7c1d",
      SUPABASE_URL: "SENTINEL-7c1d",
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
    expect(error.message).not.toContain("SENTINEL-7c1d");
    expect(JSON.stringify(error)).not.toContain("SENTINEL-7c1d");
    expect(String(error)).not.toContain("SENTINEL-7c1d");
  });

  it("covers every key of previewApiEnvSchema", () => {
    expect(Object.keys(previewApiEnvSchema.shape).sort()).toEqual(["PORT", "SUPABASE_URL"]);
  });
});
