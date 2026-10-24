import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { appEnvValues, ensureEnvFile, fillExample, parseStatusEnv } from "./dev-env.mjs";

const API_URL = "http://127.0.0.1:54321";
const ANON_KEY = "fake-anon-key";
const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const JWT_SECRET = "fake-jwt-secret-SENTINEL";
const MAILPIT_URL = "http://127.0.0.1:54324";
const PUBLISHABLE_KEY = "sb_publishable_fake";
const S3_PROTOCOL_ACCESS_KEY_ID = "fake-s3-access-id";
const S3_PROTOCOL_ACCESS_KEY_SECRET = "fake-s3-secret-SENTINEL";
const SECRET_KEY = "fake-secret-key-SENTINEL";
const SERVICE_ROLE_KEY = "fake-service-role-SENTINEL";
const STUDIO_URL = "http://127.0.0.1:54323";

const privilegedValues = [
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SECRET_KEY,
  JWT_SECRET,
  S3_PROTOCOL_ACCESS_KEY_SECRET,
];

const statusPairs = [
  ["ANON_KEY", ANON_KEY],
  ["API_URL", API_URL],
  ["DB_URL", DB_URL],
  ["JWT_SECRET", JWT_SECRET],
  ["MAILPIT_URL", MAILPIT_URL],
  ["PUBLISHABLE_KEY", PUBLISHABLE_KEY],
  ["S3_PROTOCOL_ACCESS_KEY_ID", S3_PROTOCOL_ACCESS_KEY_ID],
  ["S3_PROTOCOL_ACCESS_KEY_SECRET", S3_PROTOCOL_ACCESS_KEY_SECRET],
  ["SECRET_KEY", SECRET_KEY],
  ["SERVICE_ROLE_KEY", SERVICE_ROLE_KEY],
  ["STUDIO_URL", STUDIO_URL],
];

function quotedStatus(pairs) {
  return `${pairs.map(([key, value]) => `${key}="${value}"`).join("\n")}\n`;
}

function captureError(run) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw error;
    }
    return error;
  }

  throw new Error("expected parseStatusEnv to throw");
}

function expectMessageOmits(message, values) {
  for (const value of values) {
    expect(message).not.toContain(value);
  }
}

const previewExample = [
  "# Preview API local config.",
  "# SUPABASE_URL=http://127.0.0.1:54321",
  "",
  "PORT=8787",
  "SUPABASE_URL=http://127.0.0.1:54321",
  "",
].join("\n");

const extensionExample = [
  "# Extension local config. Public keys only.",
  "WXT_SUPABASE_URL=http://127.0.0.1:54321",
  "WXT_SUPABASE_PUBLISHABLE_KEY=replace-with-local-publishable-key",
  "WXT_PREVIEW_API_URL=http://127.0.0.1:8787",
  "",
].join("\n");

describe("parseStatusEnv", () => {
  it("returns only API_URL and PUBLISHABLE_KEY from a status env fixture", () => {
    const result = parseStatusEnv(quotedStatus(statusPairs));

    expect(result).toEqual({
      API_URL: "http://127.0.0.1:54321",
      PUBLISHABLE_KEY: "sb_publishable_fake",
    });
  });

  it("parses unquoted values", () => {
    const text = [
      "API_URL=http://127.0.0.1:54321",
      "PUBLISHABLE_KEY=unquoted-publishable-key",
      "ANON_KEY=fake-anon-key",
      "SERVICE_ROLE_KEY=fake-service-role-SENTINEL",
      "JWT_SECRET=fake-jwt-secret-SENTINEL",
      "",
    ].join("\n");

    expect(parseStatusEnv(text)).toEqual({
      API_URL: "http://127.0.0.1:54321",
      PUBLISHABLE_KEY: "unquoted-publishable-key",
    });
  });

  it("names PUBLISHABLE_KEY and omits every status value when PUBLISHABLE_KEY is missing", () => {
    const text = quotedStatus(statusPairs.filter(([key]) => key !== "PUBLISHABLE_KEY"));
    const error = captureError(() => parseStatusEnv(text));

    expect(error.message).toContain("PUBLISHABLE_KEY");
    expectMessageOmits(
      error.message,
      statusPairs.filter(([key]) => key !== "PUBLISHABLE_KEY").map(([, value]) => value),
    );
  });

  it("names API_URL and omits every status value when API_URL is missing", () => {
    const text = quotedStatus(statusPairs.filter(([key]) => key !== "API_URL"));
    const error = captureError(() => parseStatusEnv(text));

    expect(error.message).toContain("API_URL");
    expectMessageOmits(
      error.message,
      statusPairs.filter(([key]) => key !== "API_URL").map(([, value]) => value),
    );
  });
});

describe("appEnvValues", () => {
  const status = {
    API_URL: "http://10.1.2.3:54321",
    PUBLISHABLE_KEY: "publishable-from-status",
  };

  it("maps preview-api to SUPABASE_URL from API_URL", () => {
    expect(appEnvValues("preview-api", status)).toEqual({
      SUPABASE_URL: "http://10.1.2.3:54321",
    });
  });

  it("maps the extension to the public Supabase keys and the local preview URL", () => {
    expect(appEnvValues("extension", status)).toEqual({
      WXT_SUPABASE_URL: "http://10.1.2.3:54321",
      WXT_SUPABASE_PUBLISHABLE_KEY: "publishable-from-status",
      WXT_PREVIEW_API_URL: "http://127.0.0.1:8787",
    });
  });
});

describe("fillExample", () => {
  it("replaces mapped keys and keeps comments, blank lines, and other keys", () => {
    const filled = fillExample(previewExample, {
      SUPABASE_URL: "http://127.0.0.1:59999",
      NOT_IN_EXAMPLE: "must-not-be-appended",
    });

    expect(filled).toBe(
      [
        "# Preview API local config.",
        "# SUPABASE_URL=http://127.0.0.1:54321",
        "",
        "PORT=8787",
        "SUPABASE_URL=http://127.0.0.1:59999",
        "",
      ].join("\n"),
    );
    expect(filled).not.toContain("NOT_IN_EXAMPLE");
    expect(filled).not.toContain("must-not-be-appended");
  });

  it("fills the preview-api example without privileged status values", () => {
    const filled = fillExample(
      previewExample,
      appEnvValues("preview-api", parseStatusEnv(quotedStatus(statusPairs))),
    );

    expect(filled).toBe(
      [
        "# Preview API local config.",
        "# SUPABASE_URL=http://127.0.0.1:54321",
        "",
        "PORT=8787",
        "SUPABASE_URL=http://127.0.0.1:54321",
        "",
      ].join("\n"),
    );
    for (const secret of privilegedValues) {
      expect(filled).not.toContain(secret);
    }
  });

  it("fills the extension example without privileged status values", () => {
    const filled = fillExample(
      extensionExample,
      appEnvValues("extension", parseStatusEnv(quotedStatus(statusPairs))),
    );

    expect(filled).toBe(
      [
        "# Extension local config. Public keys only.",
        "WXT_SUPABASE_URL=http://127.0.0.1:54321",
        "WXT_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fake",
        "WXT_PREVIEW_API_URL=http://127.0.0.1:8787",
        "",
      ].join("\n"),
    );
    for (const secret of privilegedValues) {
      expect(filled).not.toContain(secret);
    }
    expect(filled).not.toContain("ANON_KEY");
    expect(filled).not.toContain("SERVICE_ROLE_KEY");
    expect(filled).not.toContain("SECRET_KEY");
  });
});

describe("ensureEnvFile", () => {
  let directory;

  afterEach(async () => {
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it("creates a missing file and returns created", async () => {
    directory = await mkdtemp(join(tmpdir(), "markme-dev-env-"));
    const envPath = join(directory, ".env");
    const content = "PORT=8787\nSUPABASE_URL=http://127.0.0.1:54321\n";

    await expect(ensureEnvFile(envPath, content)).resolves.toBe("created");
    await expect(readFile(envPath)).resolves.toEqual(Buffer.from(content));
  });

  it("returns found and leaves an existing file byte-identical", async () => {
    directory = await mkdtemp(join(tmpdir(), "markme-dev-env-"));
    const envPath = join(directory, ".env");
    const existing = Buffer.from("SUPABASE_URL=http://example.test/keep-me\n# comment\n");
    await writeFile(envPath, existing);

    await expect(ensureEnvFile(envPath, "SUPABASE_URL=http://127.0.0.1:54321\n")).resolves.toBe(
      "found",
    );
    await expect(readFile(envPath)).resolves.toEqual(existing);
  });
});
