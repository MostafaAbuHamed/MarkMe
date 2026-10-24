import type { ServerResponse } from "node:http";
import { previewResponse } from "@markme/domain";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";
import type { LogLine } from "../src/log.js";
import { createSafeFetch } from "../src/ssrf/safe-fetch.js";
import { allowAll, testFetchDeps } from "./helpers/policy.js";
import { scriptedResolver } from "./helpers/resolver.js";
import { startServer, type ServerHandler } from "./helpers/servers.js";
import { jwks, signToken } from "./helpers/tokens.js";

const testEnv = loadEnv({
  SUPABASE_URL: "http://127.0.0.1:54321",
  CORS_ORIGINS: "chrome-extension://ok",
});

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

function page(body: string, contentType = "text/html"): ServerHandler {
  return (_req, res) => {
    res.writeHead(200, { "content-type": contentType });
    res.end(body);
  };
}

function delay(ms: number, res: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    res.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function okTargetServer(handler: ServerHandler = page("<!doctype html><title>OK</title>")) {
  const server = await startServer(handler, "127.0.0.1");
  closers.push(server.close);
  const resolver = scriptedResolver({
    "ok.test": [[{ address: "127.0.0.1", family: 4 }]],
  });
  const fetchDeps = testFetchDeps(server, resolver, allowAll);
  const safeFetch = createSafeFetch(fetchDeps);
  const baseUrl = `http://ok.test:${server.port}/`;
  return { server, safeFetch, fetchDeps, baseUrl };
}

function captureLog(safeFetch: ReturnType<typeof createSafeFetch>) {
  const lines: LogLine[] = [];
  const app = createApp({
    env: testEnv,
    jwks,
    safeFetch,
    log: (line) => {
      lines.push(line);
    },
  });
  return { app, lines };
}

async function authedPost(
  app: ReturnType<typeof createApp>,
  body: string | object,
  headers: Record<string, string> = {},
) {
  let call = request(app)
    .post("/v1/preview")
    .set("Content-Type", "application/json")
    .set("Authorization", `Bearer ${await signToken()}`);
  for (const [key, value] of Object.entries(headers)) {
    call = call.set(key, value);
  }
  return call.send(body);
}

function assertSafeErrorBody(body: unknown, serialized: string): void {
  expect(body).toEqual({ error: expect.stringMatching(/.+/) as string });
  expect(Object.keys(body as object)).toEqual(["error"]);
  expect(serialized).not.toMatch(/stack/i);
  expect(serialized).not.toMatch(/at /);
  expect(serialized).not.toMatch(/\/src\//);
}

describe("POST /v1/preview", () => {
  it("returns 401 without a token", async () => {
    const { safeFetch, baseUrl } = await okTargetServer();
    const app = createApp({ env: testEnv, jwks, safeFetch });

    const response = await request(app)
      .post("/v1/preview")
      .set("Content-Type", "application/json")
      .send({ url: baseUrl });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized" });
    assertSafeErrorBody(response.body, JSON.stringify(response.body));
  });

  it("returns 200 with a previewResponse body for a valid token and URL", async () => {
    const { safeFetch, baseUrl } = await okTargetServer(
      page("<!doctype html><html><head><title>Page</title></head></html>"),
    );
    const app = createApp({ env: testEnv, jwks, safeFetch });

    const response = await authedPost(app, { url: baseUrl });

    expect(response.status).toBe(200);
    expect(previewResponse.parse(response.body)).toEqual(response.body);
  });

  it.each([
    { name: "ftp scheme", body: { url: "ftp://a.com" } },
    { name: "not a URL", body: { url: "not a url" } },
    { name: "credentials in URL", body: { url: "https://u:p@a.com" } },
    { name: "URL over 2,048 chars", body: { url: `https://a.com/${"x".repeat(2100)}` } },
    { name: "missing url", body: {} },
    { name: "non-string url", body: { url: 1 } },
    { name: "array body", body: [] },
  ])("$name → 400 invalid_url", async ({ body }) => {
    const { safeFetch } = await okTargetServer();
    const app = createApp({ env: testEnv, jwks, safeFetch });

    const response = await authedPost(app, body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_url" });
    assertSafeErrorBody(response.body, JSON.stringify(response.body));
  });

  it("blocks link-local metadata IP with production policy", async () => {
    const app = createApp({ env: testEnv, jwks });

    const response = await authedPost(app, { url: "http://169.254.169.254/" });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: "blocked_target" });
    assertSafeErrorBody(response.body, JSON.stringify(response.body));
  });

  it("returns 502 fetch_failed when the target responds with 500", async () => {
    const { safeFetch, baseUrl } = await okTargetServer((_req, res) => {
      res.writeHead(500);
      res.end("error");
    });
    const app = createApp({ env: testEnv, jwks, safeFetch });

    const response = await authedPost(app, { url: baseUrl });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "fetch_failed" });
    assertSafeErrorBody(response.body, JSON.stringify(response.body));
  });

  it("returns 504 timeout when the target is slow", async () => {
    const { safeFetch, baseUrl } = await okTargetServer(async (_req, res) => {
      await delay(6_000, res);
      if (!res.writableEnded) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("late");
      }
    });
    const app = createApp({ env: testEnv, jwks, safeFetch });

    const response = await authedPost(app, { url: baseUrl });

    expect(response.status).toBe(504);
    expect(response.body).toEqual({ error: "timeout" });
    assertSafeErrorBody(response.body, JSON.stringify(response.body));
  }, 15_000);

  it("fetches the target once for the same URL and logs cacheHit on the second request", async () => {
    const { server, safeFetch, baseUrl } = await okTargetServer();
    const { app, lines } = captureLog(safeFetch);

    const first = await authedPost(app, { url: baseUrl });
    const second = await authedPost(app, { url: baseUrl });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(server.requests).toHaveLength(1);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.cacheHit).not.toBe(true);
    expect(lines[1]!.cacheHit).toBe(true);
  });

  it("logs host only (no path, query or user id)", async () => {
    const { safeFetch, baseUrl } = await okTargetServer();
    const { app, lines } = captureLog(safeFetch);

    await authedPost(app, { url: `${baseUrl}path?q=1` });

    expect(lines).toHaveLength(1);
    expect(lines[0]!.host).toBe("ok.test");
    const serialized = JSON.stringify(lines[0]!);
    expect(serialized).not.toMatch(/\/path/);
    expect(serialized).not.toMatch(/\?q=/);
    expect(serialized).not.toMatch(/user-1/);
  });

  it("returns imageUrl and a file-name title for a direct image link", async () => {
    const { safeFetch, baseUrl } = await okTargetServer(page("", "image/png"));
    const imageUrl = `${baseUrl}photos/My%20Cat.png`;
    const app = createApp({ env: testEnv, jwks, safeFetch });

    const response = await authedPost(app, { url: imageUrl });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      url: imageUrl,
      imageUrl,
      mediaType: "image",
      title: "My Cat.png",
    });
  });

  it("does not set CORS allow header for an unknown origin", async () => {
    const { safeFetch, baseUrl } = await okTargetServer();
    const app = createApp({ env: testEnv, jwks, safeFetch });

    const response = await authedPost(
      app,
      { url: baseUrl },
      {
        Origin: "https://evil.example",
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("returns 200 without an Origin header", async () => {
    const { safeFetch, baseUrl } = await okTargetServer();
    const app = createApp({ env: testEnv, jwks, safeFetch });

    const response = await request(app)
      .post("/v1/preview")
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${await signToken()}`)
      .send({ url: baseUrl });

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

const rateLimitEnv = loadEnv({
  SUPABASE_URL: "http://127.0.0.1:54321",
  CORS_ORIGINS: "chrome-extension://ok",
  RATE_LIMIT_IP_PER_MIN: "5",
  RATE_LIMIT_USER_PER_MIN: "3",
  RATE_LIMIT_USER_PER_DAY: "4",
  RATE_LIMIT_FORCE_PER_HOUR: "2",
});

function assertRateLimitHeaders(headers: Record<string, unknown>): void {
  expect(headers.ratelimit).toBeTypeOf("string");
  expect(headers["ratelimit-policy"]).toBeTypeOf("string");
}

function assertRetryAfter(headers: Record<string, unknown>): void {
  const seconds = Number(headers["retry-after"]);
  expect(Number.isInteger(seconds)).toBe(true);
  expect(seconds).toBeGreaterThan(0);
}

describe("rate limits", () => {
  it("returns 429 on the 6th request from one IP without a token", async () => {
    const { safeFetch, baseUrl } = await okTargetServer();
    const app = createApp({ env: rateLimitEnv, jwks, safeFetch });

    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post("/v1/preview")
        .set("Content-Type", "application/json")
        .send({ url: baseUrl });
      expect(response.status).toBe(401);
      assertRateLimitHeaders(response.headers);
    }

    const limited = await request(app)
      .post("/v1/preview")
      .set("Content-Type", "application/json")
      .send({ url: baseUrl });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: "rate_limited" });
    assertRetryAfter(limited.headers);
    assertRateLimitHeaders(limited.headers);
  });

  it("returns 429 on the 4th request per user per minute; a second user is still served", async () => {
    const { safeFetch, baseUrl } = await okTargetServer();
    const app = createApp({ env: rateLimitEnv, jwks, safeFetch });

    for (let i = 0; i < 3; i++) {
      const response = await authedPost(app, { url: baseUrl });
      expect(response.status).toBe(200);
      assertRateLimitHeaders(response.headers);
    }

    const limited = await authedPost(app, { url: baseUrl });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: "rate_limited" });
    assertRetryAfter(limited.headers);
    assertRateLimitHeaders(limited.headers);

    const otherUser = await request(app)
      .post("/v1/preview")
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${await signToken({ sub: "user-2" })}`)
      .send({ url: baseUrl });

    expect(otherUser.status).toBe(200);
    assertRateLimitHeaders(otherUser.headers);
  });

  it("enforces the per-user daily limit even when the per-minute limit is high", async () => {
    const dayEnv = loadEnv({
      SUPABASE_URL: "http://127.0.0.1:54321",
      CORS_ORIGINS: "chrome-extension://ok",
      RATE_LIMIT_IP_PER_MIN: "100",
      RATE_LIMIT_USER_PER_MIN: "100",
      RATE_LIMIT_USER_PER_DAY: "4",
      RATE_LIMIT_FORCE_PER_HOUR: "100",
    });
    const { safeFetch, baseUrl } = await okTargetServer();
    const app = createApp({ env: dayEnv, jwks, safeFetch });

    for (let i = 0; i < 4; i++) {
      const response = await authedPost(app, { url: baseUrl });
      expect(response.status).toBe(200);
      assertRateLimitHeaders(response.headers);
    }

    const limited = await authedPost(app, { url: baseUrl });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: "rate_limited" });
    assertRetryAfter(limited.headers);
    assertRateLimitHeaders(limited.headers);
  });

  it("counts only force === true toward the force limit", async () => {
    const forceEnv = loadEnv({
      SUPABASE_URL: "http://127.0.0.1:54321",
      CORS_ORIGINS: "chrome-extension://ok",
      RATE_LIMIT_IP_PER_MIN: "100",
      RATE_LIMIT_USER_PER_MIN: "100",
      RATE_LIMIT_USER_PER_DAY: "100",
      RATE_LIMIT_FORCE_PER_HOUR: "2",
    });
    const { safeFetch, baseUrl } = await okTargetServer();
    const app = createApp({ env: forceEnv, jwks, safeFetch });

    for (let i = 0; i < 2; i++) {
      const response = await authedPost(app, { url: baseUrl, force: true });
      expect(response.status).toBe(200);
      assertRateLimitHeaders(response.headers);
    }

    const limited = await authedPost(app, { url: baseUrl, force: true });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: "rate_limited" });
    assertRetryAfter(limited.headers);

    const notForce = await authedPost(app, { url: baseUrl, force: false });
    expect(notForce.status).toBe(200);
    assertRateLimitHeaders(notForce.headers);

    const badForce = await authedPost(app, { url: baseUrl, force: "yes" });
    expect(badForce.status).toBe(400);
    expect(badForce.body).toEqual({ error: "invalid_url" });
    assertRateLimitHeaders(badForce.headers);
  });

  it("keys IP limits on the last X-Forwarded-For hop when trust proxy is 1", async () => {
    const { safeFetch, baseUrl } = await okTargetServer();
    const app = createApp({ env: rateLimitEnv, jwks, safeFetch });

    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post("/v1/preview")
        .set("Content-Type", "application/json")
        .set("X-Forwarded-For", "1.2.3.4, 5.6.7.8")
        .send({ url: baseUrl });
      expect(response.status).toBe(401);
      assertRateLimitHeaders(response.headers);
    }

    const limited = await request(app)
      .post("/v1/preview")
      .set("Content-Type", "application/json")
      .set("X-Forwarded-For", "9.9.9.9, 5.6.7.8")
      .send({ url: baseUrl });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: "rate_limited" });
    assertRetryAfter(limited.headers);
  });

  it("does not share counters between separate createApp instances", async () => {
    const { safeFetch, baseUrl } = await okTargetServer();
    const appA = createApp({ env: rateLimitEnv, jwks, safeFetch });
    const appB = createApp({ env: rateLimitEnv, jwks, safeFetch });

    for (let i = 0; i < 5; i++) {
      await request(appA)
        .post("/v1/preview")
        .set("Content-Type", "application/json")
        .send({ url: baseUrl });
    }

    const stillAllowed = await request(appB)
      .post("/v1/preview")
      .set("Content-Type", "application/json")
      .send({ url: baseUrl });

    expect(stillAllowed.status).toBe(401);
    assertRateLimitHeaders(stillAllowed.headers);
  });

  it("does not rate limit GET /healthz or spend the preview IP budget", async () => {
    const { safeFetch, baseUrl } = await okTargetServer();
    const app = createApp({ env: rateLimitEnv, jwks, safeFetch });

    for (let i = 0; i < 8; i++) {
      const response = await request(app).get("/healthz");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(response.headers.ratelimit).toBeUndefined();
      expect(response.headers["ratelimit-policy"]).toBeUndefined();
    }

    const preview = await request(app)
      .post("/v1/preview")
      .set("Content-Type", "application/json")
      .send({ url: baseUrl });

    expect(preview.status).toBe(401);
    expect(preview.body).toEqual({ error: "unauthorized" });
  });
});
