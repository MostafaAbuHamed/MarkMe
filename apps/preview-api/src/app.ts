import express, { type Express } from "express";

import type { PreviewApiEnv } from "./env.js";

export type AppOptions = { env: PreviewApiEnv };

export function createApp({ env }: AppOptions): Express {
  void env;
  const app = express();
  app.disable("x-powered-by");

  app.get("/healthz", (_request, response) => {
    response.json({ ok: true });
  });

  return app;
}
