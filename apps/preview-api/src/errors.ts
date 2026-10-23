import type { PreviewErrorCode } from "@markme/domain";
import type { Response } from "express";

export class PreviewFailure extends Error {
  constructor(readonly code: "blocked_target" | "fetch_failed" | "timeout") {
    super(code);
  }
}

export const ERROR_STATUS: Record<PreviewErrorCode, number> = {
  invalid_url: 400,
  unauthorized: 401,
  blocked_target: 422,
  rate_limited: 429,
  fetch_failed: 502,
  timeout: 504,
};

export function sendError(res: Response, code: PreviewErrorCode): void {
  res.status(ERROR_STATUS[code]).json({ error: code });
}
