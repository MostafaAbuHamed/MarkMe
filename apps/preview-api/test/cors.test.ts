import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { loadEnv } from "../src/env";

const testEnv = loadEnv({
  SUPABASE_URL: "http://127.0.0.1:54321",
  CORS_ORIGINS: "chrome-extension://ok",
});

const allowedOrigin = "chrome-extension://ok";

function appWithPostRoute(routes?: (app: Express) => void) {
  return createApp({
    env: testEnv,
    routes: (app) => {
      app.post("/test", (_req, res) => {
        res.json({ ok: true });
      });
      routes?.(app);
    },
  });
}

describe("CORS allowlist", () => {
  it("reflects an allowed Origin with Vary: Origin", async () => {
    const response = await request(createApp({ env: testEnv }))
      .get("/healthz")
      .set("Origin", allowedOrigin);

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers.vary).toBe("Origin");
  });

  it("does not set Access-Control-Allow-Origin for an unknown Origin", async () => {
    const response = await request(createApp({ env: testEnv }))
      .get("/healthz")
      .set("Origin", "https://evil.example");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("OPTIONS /v1/preview from an allowed origin returns 204 with preflight headers", async () => {
    const response = await request(createApp({ env: testEnv }))
      .options("/v1/preview")
      .set("Origin", allowedOrigin);

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-methods"]).toBe("POST");
    expect(response.headers["access-control-allow-headers"]).toBe("authorization, content-type");
    expect(response.headers["access-control-max-age"]).toBe("600");
  });

  it("OPTIONS from an unknown origin returns 403", async () => {
    const response = await request(createApp({ env: testEnv }))
      .options("/v1/preview")
      .set("Origin", "https://evil.example");

    expect(response.status).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("passes through when there is no Origin header", async () => {
    const response = await request(createApp({ env: testEnv })).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers.vary).toBeUndefined();
  });
});

describe("JSON body limit", () => {
  it("rejects a body over 4 KB with invalid_url", async () => {
    const big = "x".repeat(5 * 1024);
    const response = await request(appWithPostRoute())
      .post("/test")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ data: big }));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_url" });
  });

  it("rejects malformed JSON with invalid_url", async () => {
    const response = await request(appWithPostRoute())
      .post("/test")
      .set("Content-Type", "application/json")
      .send("{ not json");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_url" });
  });
});
