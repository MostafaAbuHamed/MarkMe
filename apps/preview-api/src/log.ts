import type { PreviewErrorCode } from "@markme/domain";
import type { RequestHandler } from "express";

export type LogLine = {
  method: string;
  status: number;
  durationMs: number;
  error?: PreviewErrorCode;
  cacheHit?: boolean;
  host?: string;
};

export type LogWriter = (line: LogLine) => void;

export const defaultLogWriter: LogWriter = (line) => {
  process.stdout.write(`${JSON.stringify(line)}\n`);
};

export function createRequestLog(write: LogWriter): RequestHandler {
  return (req, res, next) => {
    if (req.path === "/healthz") {
      next();
      return;
    }

    const start = performance.now();
    res.on("finish", () => {
      const line: LogLine = {
        method: req.method,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - start),
      };

      const error = res.locals.error as PreviewErrorCode | undefined;
      if (error !== undefined) {
        line.error = error;
      }

      const cacheHit = res.locals.cacheHit as boolean | undefined;
      if (cacheHit !== undefined) {
        line.cacheHit = cacheHit;
      }

      const host = res.locals.host as string | undefined;
      if (host !== undefined) {
        line.host = host;
      }

      write(line);
    });

    next();
  };
}
