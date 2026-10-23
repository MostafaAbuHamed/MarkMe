import type { RequestHandler } from "express";

export function createCors(origins: readonly string[]): RequestHandler {
  const allowed = new Set(origins);

  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin === undefined) {
      next();
      return;
    }

    if (!allowed.has(origin)) {
      if (req.method === "OPTIONS") {
        res.status(403).end();
        return;
      }
      next();
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
      res.setHeader("Access-Control-Max-Age", "600");
      res.status(204).end();
      return;
    }

    next();
  };
}
