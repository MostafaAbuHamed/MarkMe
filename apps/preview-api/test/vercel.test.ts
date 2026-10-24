import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE_URL = "http://127.0.0.1:54321";
const writerScript = path.join(import.meta.dirname, "../scripts/vercel-output.mjs");

describe("Vercel entry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // The cold import transforms the whole app, which can pass vitest's 5 s default on a busy runner.
  it("default-exports a request handler that serves /healthz", { timeout: 20_000 }, async () => {
    vi.stubEnv("SUPABASE_URL", SUPABASE_URL);

    const { default: handler } = await import("../src/vercel");
    const response = await request(handler).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

describe("vercel-output script", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "markme-vercel-output-"));
    await mkdir(path.join(root, "dist/vercel"), { recursive: true });
    await writeFile(path.join(root, "dist/vercel/index.mjs"), "export default () => {};\n");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function runWriter(env: Record<string, string>) {
    const base = { ...process.env };
    delete base.SUPABASE_URL;
    delete base.CORS_ORIGINS;
    return execFileSync(process.execPath, [writerScript, root], {
      env: { ...base, ...env },
      stdio: "pipe",
    });
  }

  async function readJson(relative: string): Promise<unknown> {
    return JSON.parse(await readFile(path.join(root, ".vercel/output", relative), "utf8"));
  }

  it("writes one fra1 Node 24 function that receives every path", async () => {
    runWriter({ SUPABASE_URL, CORS_ORIGINS: "chrome-extension://abc" });

    expect(await readJson("functions/index.func/.vc-config.json")).toEqual({
      runtime: "nodejs24.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      regions: ["fra1"],
      maxDuration: 30,
      environment: { SUPABASE_URL, CORS_ORIGINS: "chrome-extension://abc" },
    });
    expect(await readJson("config.json")).toEqual({
      version: 3,
      routes: [{ src: "/(.*)", dest: "/index" }],
    });
    expect(existsSync(path.join(root, ".vercel/output/functions/index.func/index.mjs"))).toBe(true);
  });

  it("leaves CORS_ORIGINS to the app default when unset", async () => {
    runWriter({ SUPABASE_URL });

    expect(await readJson("functions/index.func/.vc-config.json")).toMatchObject({
      environment: { SUPABASE_URL },
    });
  });

  it("fails without SUPABASE_URL and writes nothing", () => {
    expect(() => runWriter({})).toThrow(/SUPABASE_URL is required/);
    expect(existsSync(path.join(root, ".vercel"))).toBe(false);
  });
});
