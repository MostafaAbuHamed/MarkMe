import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";

describe("preview API health check", () => {
  it("GET /healthz returns 200 application/json { ok: true }", async () => {
    const response = await request(createApp()).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual({ ok: true });
  });

  it("GET /does-not-exist returns 404", async () => {
    const response = await request(createApp()).get("/does-not-exist");

    expect(response.status).toBe(404);
  });

  it("POST /healthz is not 200", async () => {
    const response = await request(createApp()).post("/healthz");

    expect(response.status).not.toBe(200);
  });
});
