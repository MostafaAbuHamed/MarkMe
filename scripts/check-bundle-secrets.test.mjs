import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { scanDirectory, scanText } from "./check-bundle-secrets.mjs";

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "check-bundle-secrets.mjs");

/**
 * Build a JWT-shaped string from a JSON payload (no real keys committed).
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
function jwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8")
    .toString("base64url")
    .replace(/=+$/, "");
  const body = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64url")
    .replace(/=+$/, "");
  return `${header}.${body}.fake-signature`;
}

const plantedSecretKey = "sb_secret_" + "a".repeat(24);

function runCli(dir) {
  return spawnSync(process.execPath, [scriptPath, dir], {
    encoding: "utf8",
  });
}

describe("scanText", () => {
  it("flags a full sb_secret_ key", () => {
    const text = "const k='sb_secret_" + "a".repeat(24) + "'";
    const findings = scanText(text);

    expect(findings).toEqual([{ kind: "secret-key" }]);
    expect(JSON.stringify(findings)).not.toContain(plantedSecretKey);
  });

  it("flags SERVICE_ROLE in an env var name", () => {
    const findings = scanText("process.env.SUPABASE_SERVICE_ROLE_KEY");

    expect(findings).toEqual([{ kind: "service-role-name" }]);
  });

  it("flags a legacy anon JWT", () => {
    const token = jwt({ role: "anon" });
    const findings = scanText(`const k='${token}'`);

    expect(findings).toEqual([{ kind: "legacy-jwt-anon" }]);
    expect(JSON.stringify(findings)).not.toContain(token);
  });

  it("flags a legacy service_role JWT", () => {
    const token = jwt({ role: "service_role" });
    const findings = scanText(`const k='${token}'`);

    expect(findings).toEqual([{ kind: "legacy-jwt-service_role" }]);
    expect(JSON.stringify(findings)).not.toContain(token);
  });

  it("does not flag supabase-js isNewApiKey prefix check", () => {
    expect(scanText('key.startsWith("sb_secret_")')).toEqual([]);
  });

  it("does not flag sb_secret_ with fewer than 20 key characters", () => {
    expect(scanText("sb_secret_" + "a".repeat(10))).toEqual([]);
  });

  it("does not flag publishable keys", () => {
    expect(scanText("sb_publishable_" + "a".repeat(30))).toEqual([]);
  });

  it("does not flag JWTs with role authenticated", () => {
    expect(scanText(jwt({ role: "authenticated" }))).toEqual([]);
  });

  it("does not flag a JWT-shaped triple with a non-JSON payload", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.eyJub3Rqc29u.fake-signature";
    expect(scanText(token)).toEqual([]);
  });
});

describe("scanDirectory", () => {
  let directory;

  afterEach(async () => {
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it("returns findings with relative paths sorted by file then kind", async () => {
    directory = await mkdtemp(join(tmpdir(), "markme-bundle-check-"));
    await writeFile(join(directory, "a.js"), "// clean\n", "utf8");
    await mkdir(join(directory, "nested"), { recursive: true });
    const planted = "const k='sb_secret_" + "a".repeat(24) + "'\n";
    await writeFile(join(directory, "nested", "b.js"), planted, "utf8");

    const findings = await scanDirectory(directory);

    expect(findings).toEqual([{ file: "nested/b.js", kind: "secret-key" }]);
    expect(JSON.stringify(findings)).not.toContain(plantedSecretKey);
  });
});

describe("CLI", () => {
  let directory;

  afterEach(async () => {
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it("exits 0 with no findings message for a clean directory", async () => {
    directory = await mkdtemp(join(tmpdir(), "markme-bundle-check-"));
    await writeFile(join(directory, "clean.js"), "// ok\n", "utf8");

    const result = runCli(directory);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(`bundle-secrets: no findings in ${directory}`);
    expect(result.stderr).toBe("");
  });

  it("exits 1 with one line per finding and no key text", async () => {
    directory = await mkdtemp(join(tmpdir(), "markme-bundle-check-"));
    await mkdir(join(directory, "nested"), { recursive: true });
    const planted = "const k='sb_secret_" + "a".repeat(24) + "'\n";
    await writeFile(join(directory, "nested", "b.js"), planted, "utf8");

    const result = runCli(directory);

    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe("bundle-secrets: secret-key in nested/b.js");
    expect(result.stdout + result.stderr).not.toContain(plantedSecretKey);
  });

  it("exits 2 when the directory is missing", () => {
    const missing = join(tmpdir(), `markme-bundle-check-missing-${Date.now()}`);
    const result = runCli(missing);

    expect(result.status).toBe(2);
    expect(result.stderr + result.stdout).toMatch(/build/i);
    expect(result.stderr + result.stdout).toMatch(/extension/i);
  });
});
