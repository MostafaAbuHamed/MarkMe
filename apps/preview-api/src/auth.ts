import { jwtVerify, type JWTVerifyGetKey } from "jose";
import type { RequestHandler } from "express";

import { sendError } from "./errors.js";

/* eslint-disable @typescript-eslint/no-namespace -- Express Request augmentation */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export type AuthOptions = {
  jwks: JWTVerifyGetKey;
  issuer: string;
};

export function createAuth({ jwks, issuer }: AuthOptions): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1];
      if (token === undefined) {
        sendError(res, "unauthorized");
        return;
      }
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: "authenticated",
        algorithms: ["ES256"],
      });
      if (typeof payload.sub !== "string" || payload.sub === "") {
        sendError(res, "unauthorized");
        return;
      }
      req.userId = payload.sub;
      next();
    } catch {
      sendError(res, "unauthorized");
    }
  };
}
