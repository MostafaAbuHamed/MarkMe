import { z } from "zod";

import { normalizeUrl } from "../url/normalize";
import { PROVIDERS, YOUTUBE_ID_PATTERN } from "../url/provider";
import { embedProvider, mediaType } from "./enums";
import { httpUrl } from "./http-url";
import { LIMITS } from "./limits";

const webLink = z
  .string()
  .max(LIMITS.url)
  .refine((value) => normalizeUrl(value).ok);

const previewProvider = z.enum(PROVIDERS);

export const previewRequest = z.object({
  url: httpUrl,
  force: z.boolean().optional(),
});

export type PreviewRequestInput = z.input<typeof previewRequest>;
export type PreviewRequest = z.output<typeof previewRequest>;

export const previewResponse = z.object({
  url: webLink,
  title: z.string().max(LIMITS.title).optional(),
  description: z.string().max(LIMITS.description).optional(),
  imageUrl: webLink.optional(),
  faviconUrl: webLink.optional(),
  siteName: z.string().max(LIMITS.siteName).optional(),
  mediaType,
  embed: z
    .object({
      provider: embedProvider,
      id: z.string().regex(YOUTUBE_ID_PATTERN),
    })
    .optional(),
  provider: previewProvider.optional(),
});

export type PreviewResponse = z.output<typeof previewResponse>;

export const PREVIEW_ERROR_CODES = [
  "invalid_url",
  "unauthorized",
  "blocked_target",
  "rate_limited",
  "fetch_failed",
  "timeout",
] as const;

export type PreviewErrorCode = (typeof PREVIEW_ERROR_CODES)[number];

export const previewError = z.object({
  error: z.enum(PREVIEW_ERROR_CODES),
});

export type PreviewError = z.output<typeof previewError>;
