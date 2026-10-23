import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { createCors } from "./cors.js";
import { sendError } from "./errors.js";
import type { PreviewApiEnv } from "./env.js";
import { createRequestLog, defaultLogWriter, type LogWriter } from "./log.js";

export type AppOptions = {
  env: PreviewApiEnv;
  jwks?: JWTVerifyGetKey;
  log?: LogWriter;
  routes?: (app: Express) => void;
};

export function createApp({ env, jwks, log, routes }: AppOptions): Express {
  const resolvedJwks =
    jwks ?? createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL));
  void resolvedJwks;

  const app = express();
  app.disable("x-powered-by");

  app.use(createCors(env.CORS_ORIGINS));
  app.use(createRequestLog(log ?? defaultLogWriter));
  // IP limiter (T013)

  app.use(express.json({ limit: "4kb" }));

  app.get("/healthz", (_request, response) => {
    response.json({ ok: true });
  });

  routes?.(app);

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const type = typeof err === "object" && err !== null && "type" in err ? err.type : undefined;
    if (type === "entity.too.large" || type === "entity.parse.failed") {
      sendError(res, "invalid_url");
      return;
    }

    if (err instanceof Error && err.stack !== undefined) {
      process.stderr.write(`${err.stack}\n`);
    }

    sendError(res, "fetch_failed");
  });

  return app;
}
