import { parseEnv } from "@markme/domain";
import { z } from "zod";

export const extensionEnvSchema = z.object({
  WXT_SUPABASE_URL: z
    .url({ protocol: /^https?$/ })
    .describe("an http(s) URL, e.g. http://127.0.0.1:54321"),
  WXT_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20)
    .refine((value) => !value.startsWith("replace-with-"))
    .describe("a publishable key (sb_publishable_…) printed by `pnpm exec supabase status`"),
  WXT_PREVIEW_API_URL: z
    .url({ protocol: /^https?$/ })
    .describe("an http(s) URL, e.g. http://127.0.0.1:8787"),
});

export function loadExtensionEnv(source: Record<string, string | undefined>) {
  return parseEnv(extensionEnvSchema, source, {
    app: "extension",
    exampleFile: "apps/extension/.env.example",
  });
}
