import { z } from "zod";

import { NORMALIZE_ERRORS, normalizeUrl, type NormalizeError } from "../url/normalize";

function isNormalizeError(value: unknown): value is NormalizeError {
  return typeof value === "string" && (NORMALIZE_ERRORS as readonly string[]).includes(value);
}

export const httpUrl = z.string().transform((value, ctx) => {
  const result = normalizeUrl(value);
  if (!result.ok) {
    ctx.addIssue({
      code: "custom",
      message: result.error,
      params: { code: result.error },
    });
    return z.NEVER;
  }
  return { url: result.url, normalizedUrl: result.normalizedUrl };
});

export function urlErrorCode(error: z.ZodError): NormalizeError | null {
  for (const issue of error.issues) {
    if (issue.code !== "custom") {
      continue;
    }
    const code: unknown = issue.params?.["code"];
    if (isNormalizeError(code)) {
      return code;
    }
  }
  return null;
}
