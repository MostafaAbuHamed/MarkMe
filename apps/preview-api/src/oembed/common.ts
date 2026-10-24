import * as cheerio from "cheerio";
import { z } from "zod";

import { PreviewFailure } from "../errors.js";
import type { SafeFetch } from "../ssrf/safe-fetch.js";

export interface OEmbedResult {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  oembedType?: string;
  embed?: { provider: "youtube"; id: string };
}

export interface OEmbedAdapter {
  match(url: URL): boolean;
  fetch(url: URL, safeFetch: SafeFetch): Promise<OEmbedResult | null>;
}

export function blockquoteTextFromHtml(html: string): string | undefined {
  const text = cheerio.load(html)("blockquote").text().replace(/\s+/g, " ").trim();
  return text === "" ? undefined : text;
}

export async function fetchProviderJson<T>(
  endpoint: URL,
  safeFetch: SafeFetch,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    const { body } = await safeFetch(endpoint.href, {
      allowedTypes: ["application/json"],
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(body));
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        return null;
      }
      throw error;
    }
    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      return null;
    }
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch (error: unknown) {
    if (error instanceof PreviewFailure) {
      return null;
    }
    throw error;
  }
}

// X and Instagram return only a blockquote; its text is the description (A19).
export const blockquoteOembedSchema = z.object({
  provider_name: z.string(),
  type: z.string(),
  html: z.string(),
  thumbnail_url: z.string().optional(),
});

export function fromBlockquoteOembed(data: z.infer<typeof blockquoteOembedSchema>): OEmbedResult {
  const result: OEmbedResult = { siteName: data.provider_name, oembedType: data.type };
  const description = blockquoteTextFromHtml(data.html);
  if (description !== undefined) {
    result.description = description;
  }
  if (data.thumbnail_url !== undefined) {
    result.imageUrl = data.thumbnail_url;
  }
  return result;
}
