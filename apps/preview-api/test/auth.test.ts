import express from "express";
import { generateKeyPair, importJWK, SignJWT, type JWTVerifyGetKey } from "jose";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createAuth } from "../src/auth";
import { issuer, jwks, signToken } from "./helpers/tokens";

function testApp(authJwks: JWTVerifyGetKey = jwks) {
  const app = express();
  app.get("/protected", createAuth({ jwks: authJwks, issuer }), (req, res) => {
    res.json({ userId: req.userId });
  });
  return app;
}

function get(authorization: string | undefined, authJwks?: JWTVerifyGetKey) {
  const call = request(testApp(authJwks)).get("/protected");
  return authorization === undefined ? call : call.set("authorization", authorization);
}

function validClaims() {
  return new SignJWT({})
    .setIssuer(issuer)
    .setAudience("authenticated")
    .setSubject("user-1")
    .setExpirationTime("1h");
}

async function foreignKeyToken() {
  const { privateKey } = await generateKeyPair("ES256");
  return validClaims().setProtectedHeader({ alg: "ES256", kid: "foreign" }).sign(privateKey);
}

async function hs256Token() {
  const key = await importJWK({ kty: "oct", k: "c2VjcmV0", alg: "HS256" }, "HS256");
  return validClaims().setProtectedHeader({ alg: "HS256" }).sign(key);
}

describe("JWT auth middleware", () => {
  it.each<[string, () => string | undefined | Promise<string>]>([
    ["no Authorization", () => undefined],
    ["Basic abc", () => "Basic abc"],
    ["Bearer garbage", () => "Bearer garbage"],
    [
      "expired",
      async () => `Bearer ${await signToken({ exp: Math.floor(Date.now() / 1000) - 60 })}`,
    ],
    ["wrong iss", async () => `Bearer ${await signToken({ iss: "http://evil.example/auth/v1" })}`],
    ['aud "anon"', async () => `Bearer ${await signToken({ aud: "anon" })}`],
    ["no sub", async () => `Bearer ${await signToken({ sub: false })}`],
    ["a key not in the JWKS", async () => `Bearer ${await foreignKeyToken()}`],
    ["HS256", async () => `Bearer ${await hs256Token()}`],
  ])("%s → 401 unauthorized", async (_name, header) => {
    const response = await get(await header());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized" });
  });

  it("valid token → 200 with req.userId", async () => {
    const response = await get(`Bearer ${await signToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: "user-1" });
  });

  it("a JWKS getter that throws → 401, not 500", async () => {
    const unreachable: JWTVerifyGetKey = () => {
      throw new Error("keys unreachable");
    };

    const response = await get(`Bearer ${await signToken()}`, unreachable);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized" });
  });
});
