import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp, type AppOptions } from "../src/app";
import { sendError } from "../src/errors";
import { loadEnv } from "../src/env";
import type { LogLine } from "../src/log";

const testEnv = loadEnv({
  SUPABASE_URL: "http://127.0.0.1:54321",
  CORS_ORIGINS: "chrome-extension://ok",
});

function captureLog(options: Omit<AppOptions, "log"> = { env: testEnv }) {
  const lines: LogLine[] = [];
  const app = createApp({
    ...options,
    log: (line) => {
      lines.push(line);
    },
  });
  return { app, lines };
}

function withRoutes(routes: (app: Express) => void) {
  return captureLog({ env: testEnv, routes });
}

describe("request log", () => {
  it("writes one line per request with the expected keys", async () => {
    const { app, lines } = withRoutes((app) => {
      app.post("/v1/preview", (_req, res) => {
        res.locals.cacheHit = true;
        res.locals.host = "example.com";
        sendError(res, "invalid_url");
      });
    });

    await request(app)
      .post("/v1/preview")
      .set("Authorization", "Bearer secret-token")
      .send({ url: "https://example.com/path?q=1" });

    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.method).toBe("POST");
    expect(line.status).toBe(400);
    expect(typeof line.durationMs).toBe("number");
    expect(line.error).toBe("invalid_url");
    expect(line.cacheHit).toBe(true);
    expect(line.host).toBe("example.com");
    expect(Object.keys(line).sort()).toEqual(
      ["cacheHit", "durationMs", "error", "host", "method", "status"].sort(),
    );
  });

  it("never logs path, query, user id or bearer token text", async () => {
    const { app, lines } = withRoutes((app) => {
      app.post("/v1/preview/secret/path", (_req, res) => {
        res.locals.host = "a.com";
        res.status(200).json({ userId: "user-1" });
      });
    });

    await request(app)
      .post("/v1/preview/secret/path?q=leak")
      .set("Authorization", "Bearer user-1-token")
      .send({ url: "https://a.com/path?q=hide" });

    expect(lines).toHaveLength(1);
    const serialized = JSON.stringify(lines[0]!);
    expect(serialized).not.toMatch(/\/path/);
    expect(serialized).not.toMatch(/\?q=/);
    expect(serialized).not.toMatch(/user-1/);
    expect(serialized).not.toMatch(/Bearer/);
  });

  it("does not log GET /healthz", async () => {
    const { app, lines } = captureLog();

    await request(app).get("/healthz");

    expect(lines).toHaveLength(0);
  });
});
