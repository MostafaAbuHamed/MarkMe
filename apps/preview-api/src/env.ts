import { parseEnv } from "@markme/domain";
import { z } from "zod";

const DEFAULT_CORS_ORIGIN = "chrome-extension://dapmmcamlgmaopfaicfjifakodajigha";

function parseCorsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export const previewApiEnvSchema = z.object({
  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(8787)
    .describe("a port number from 1 to 65535"),
  SUPABASE_URL: z
    .url({ protocol: /^https?$/ })
    .describe("an http(s) URL, e.g. http://127.0.0.1:54321"),
  CORS_ORIGINS: z
    .string()
    .default(DEFAULT_CORS_ORIGIN)
    .describe("comma-separated browser origins allowed for CORS")
    .transform(parseCorsOrigins),
  RATE_LIMIT_IP_PER_MIN: z.coerce
    .number()
    .int()
    .positive()
    .default(60)
    .describe("a positive integer, max preview requests per IP per minute"),
  RATE_LIMIT_USER_PER_MIN: z.coerce
    .number()
    .int()
    .positive()
    .default(20)
    .describe("a positive integer, max preview requests per user per minute"),
  RATE_LIMIT_USER_PER_DAY: z.coerce
    .number()
    .int()
    .positive()
    .default(300)
    .describe("a positive integer, max preview requests per user per day"),
  RATE_LIMIT_FORCE_PER_HOUR: z.coerce
    .number()
    .int()
    .positive()
    .default(10)
    .describe("a positive integer, max force-refresh preview requests per user per hour"),
  META_OEMBED_TOKEN: z
    .string()
    .min(1)
    .optional()
    .describe("a non-empty Meta oEmbed access token when set"),
});

export type PreviewApiEnv = z.infer<typeof previewApiEnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): PreviewApiEnv {
  return parseEnv(previewApiEnvSchema, source, {
    app: "preview-api",
    exampleFile: "apps/preview-api/.env.example",
  });
}
