import rateLimit, {
  type RateLimitExceededEventHandler,
  type RateLimitRequestHandler,
} from "express-rate-limit";
import type { Request } from "express";

import type { PreviewApiEnv } from "./env.js";
import { sendError } from "./errors.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

type PreviewRateLimitInfo = {
  resetTime?: Date;
};

function rateLimitInfo(req: Request): PreviewRateLimitInfo | undefined {
  return (req as Request & { rateLimit?: PreviewRateLimitInfo }).rateLimit;
}

function createHandler(): RateLimitExceededEventHandler {
  return (req, res) => {
    const resetTime = rateLimitInfo(req)?.resetTime;
    if (resetTime !== undefined) {
      const seconds = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
      res.setHeader("Retry-After", String(seconds));
    }
    sendError(res, "rate_limited");
  };
}

function isForceRefresh(body: unknown): boolean {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  return Reflect.get(body, "force") === true;
}

function sharedOptions(handler: RateLimitExceededEventHandler) {
  return {
    standardHeaders: "draft-8" as const,
    legacyHeaders: false,
    handler,
  };
}

export type PreviewLimiters = {
  ip: RateLimitRequestHandler;
  userMinute: RateLimitRequestHandler;
  userDay: RateLimitRequestHandler;
  force: RateLimitRequestHandler;
};

export function createLimiters(env: PreviewApiEnv): PreviewLimiters {
  const handler = createHandler();
  const shared = sharedOptions(handler);

  const ip = rateLimit({
    ...shared,
    windowMs: MINUTE_MS,
    limit: env.RATE_LIMIT_IP_PER_MIN,
  });

  const userMinute = rateLimit({
    ...shared,
    windowMs: MINUTE_MS,
    limit: env.RATE_LIMIT_USER_PER_MIN,
    keyGenerator: (req) => req.userId ?? "",
  });

  const userDay = rateLimit({
    ...shared,
    windowMs: DAY_MS,
    limit: env.RATE_LIMIT_USER_PER_DAY,
    keyGenerator: (req) => req.userId ?? "",
  });

  const force = rateLimit({
    ...shared,
    windowMs: HOUR_MS,
    limit: env.RATE_LIMIT_FORCE_PER_HOUR,
    keyGenerator: (req) => req.userId ?? "",
    skip: (req) => !isForceRefresh(req.body),
  });

  return { ip, userMinute, userDay, force };
}
