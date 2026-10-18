import { parseEnv } from "@markme/domain";
import { z } from "zod";

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
});

export type PreviewApiEnv = z.infer<typeof previewApiEnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): PreviewApiEnv {
  return parseEnv(previewApiEnvSchema, source, {
    app: "preview-api",
    exampleFile: "apps/preview-api/.env.example",
  });
}
