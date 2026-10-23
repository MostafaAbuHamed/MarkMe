import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import express, { type Express } from "express";

import type { PreviewApiEnv } from "./env.js";

export type AppOptions = {
  env: PreviewApiEnv;
  jwks?: JWTVerifyGetKey;
};

export function createApp({ env, jwks }: AppOptions): Express {
  const resolvedJwks =
    jwks ?? createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL));
  void resolvedJwks;

  const app = express();
  app.disable("x-powered-by");

  app.get("/healthz", (_request, response) => {
    response.json({ ok: true });
  });

  return app;
}
