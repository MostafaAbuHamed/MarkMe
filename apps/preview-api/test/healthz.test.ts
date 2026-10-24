import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { loadEnv } from "../src/env";

const testEnv = loadEnv({ SUPABASE_URL: "http://127.0.0.1:54321" });

describe("preview API health check", () => {
  it("GET /healthz returns 200 application/json { ok: true }", async () => {
    const response = await request(createApp({ env: testEnv })).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual({ ok: true });
  });

  it("GET /does-not-exist returns 404", async () => {
    const response = await request(createApp({ env: testEnv })).get("/does-not-exist");

    expect(response.status).toBe(404);
  });

  it("POST /healthz is not 200", async () => {
    const response = await request(createApp({ env: testEnv })).post("/healthz");

    expect(response.status).not.toBe(200);
  });
});
