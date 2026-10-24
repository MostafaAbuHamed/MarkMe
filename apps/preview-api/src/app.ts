import { previewRequest } from "@markme/domain";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { createAuth } from "./auth.js";
import { createPreviewCache } from "./cache.js";
import { createCors } from "./cors.js";
import { PreviewFailure, sendError } from "./errors.js";
import type { PreviewApiEnv } from "./env.js";
import { createRequestLog, defaultLogWriter, type LogWriter } from "./log.js";
import { createAdapters } from "./oembed/index.js";
import { createPipeline } from "./pipeline.js";
import { createLimiters } from "./ratelimit.js";
import { isBlockedAddress } from "./ssrf/ip-policy.js";
import { dnsResolve } from "./ssrf/resolve.js";
import { createSafeFetch, type SafeFetch } from "./ssrf/safe-fetch.js";

export type AppOptions = {
  env: PreviewApiEnv;
  jwks?: JWTVerifyGetKey;
  safeFetch?: SafeFetch;
  log?: LogWriter;
  routes?: (app: Express) => void;
};

export function createApp({ env, jwks, safeFetch, log, routes }: AppOptions): Express {
  const resolvedJwks =
    jwks ?? createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL));
  const resolvedSafeFetch =
    safeFetch ?? createSafeFetch({ resolve: dnsResolve, policy: isBlockedAddress });
  const adapters = createAdapters(env);
  const cache = createPreviewCache();
  const pipeline = createPipeline({
    safeFetch: resolvedSafeFetch,
    adapters,
    cache,
  });
  const auth = createAuth({ jwks: resolvedJwks, issuer: `${env.SUPABASE_URL}/auth/v1` });
  const limiters = createLimiters(env);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(createCors(env.CORS_ORIGINS));
  app.use(createRequestLog(log ?? defaultLogWriter));
  app.use("/v1/preview", limiters.ip);

  app.use(express.json({ limit: "4kb" }));

  app.get("/healthz", (_request, response) => {
    response.json({ ok: true });
  });

  routes?.(app);

  app.post(
    "/v1/preview",
    auth,
    limiters.userMinute,
    limiters.userDay,
    limiters.force,
    async (req, res, next) => {
      const parsed = previewRequest.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, "invalid_url");
        return;
      }

      res.locals.host = new URL(parsed.data.url.url).hostname;

      try {
        const result = await pipeline(parsed.data);
        res.locals.cacheHit = result.cacheHit;
        res.json(result.preview);
      } catch (error: unknown) {
        if (error instanceof PreviewFailure) {
          sendError(res, error.code);
          return;
        }
        next(error);
      }
    },
  );

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
