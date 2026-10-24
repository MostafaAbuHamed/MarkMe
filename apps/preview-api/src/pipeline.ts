import {
  detectMediaType,
  detectProvider,
  LIMITS,
  normalizeUrl,
  previewResponse,
  type PreviewRequest,
  type PreviewResponse,
} from "@markme/domain";

import type { PreviewCache } from "./cache.js";
import type { OEmbedAdapter, OEmbedResult } from "./oembed/common.js";
import { parseHtmlMetadata, type PageMetadata } from "./parse/html-metadata.js";
import { sanitizeText } from "./parse/sanitize.js";
import type { SafeFetch, SafeFetchResult } from "./ssrf/safe-fetch.js";

type MergedMetadata = {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  faviconUrl?: string;
  ogType?: string;
  oembedType?: string;
  embed?: OEmbedResult["embed"];
};

type MediaTypeInput = Parameters<typeof detectMediaType>[0];

// Optional keys without `undefined` values, as exactOptionalPropertyTypes requires.
type DefinedFields<T extends object> = {
  [K in keyof T]?: Exclude<T[K], undefined>;
};

function withoutUndefined<T extends object>(fields: T): DefinedFields<T> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(fields) as (keyof T)[]) {
    const value = fields[key];
    if (value !== undefined) {
      result[key as string] = value;
    }
  }
  return result as DefinedFields<T>;
}

function findAdapter(adapters: readonly OEmbedAdapter[], pageUrl: URL): OEmbedAdapter | undefined {
  return adapters.find((adapter) => adapter.match(pageUrl));
}

function shouldFetchHtml(
  provider: ReturnType<typeof detectProvider>,
  oembed: OEmbedResult | null,
): boolean {
  if (provider === "x" || provider === "instagram") {
    return true;
  }
  if (provider === "youtube" && oembed !== null) {
    return false;
  }
  return true;
}

function mergeFields(html: PageMetadata, oembed: OEmbedResult | null): MergedMetadata {
  const adapter = oembed ?? {};
  return withoutUndefined({
    title: adapter.title ?? html.title,
    description: adapter.description ?? html.description,
    imageUrl: adapter.imageUrl ?? html.imageUrl,
    siteName: adapter.siteName ?? html.siteName,
    faviconUrl: html.faviconUrl,
    ogType: html.ogType,
    oembedType: adapter.oembedType,
    embed: adapter.embed,
  });
}

function validWebLink(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const result = normalizeUrl(value);
  return result.ok ? result.url : undefined;
}

function lastPathSegment(url: string): string {
  const segments = new URL(url).pathname.split("/").filter((part) => part.length > 0);
  return segments.at(-1) ?? "";
}

function titleFromImageUrl(finalUrl: string): string | undefined {
  const segment = lastPathSegment(finalUrl);
  if (segment === "") {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch (error: unknown) {
    if (error instanceof URIError) {
      decoded = segment;
    } else {
      throw error;
    }
  }
  return sanitizeText(decoded, LIMITS.title);
}

function cleanFields(merged: MergedMetadata) {
  return withoutUndefined({
    title: sanitizeText(merged.title, LIMITS.title),
    description: sanitizeText(merged.description, LIMITS.description),
    imageUrl: validWebLink(merged.imageUrl),
    siteName: sanitizeText(merged.siteName, LIMITS.siteName),
    faviconUrl: validWebLink(merged.faviconUrl),
  });
}

function applyDirectImage(url: string, cleaned: ReturnType<typeof cleanFields>) {
  return withoutUndefined({
    ...cleaned,
    imageUrl: validWebLink(url),
    title: titleFromImageUrl(url) ?? cleaned.title,
  });
}

function mediaTypeInput(
  url: string,
  contentType: string,
  merged: MergedMetadata,
  provider: ReturnType<typeof detectProvider>,
): MediaTypeInput {
  return {
    url,
    provider,
    ...withoutUndefined({
      contentType: contentType === "" ? undefined : contentType,
      oembedType: merged.oembedType,
      ogType: merged.ogType,
    }),
  };
}

function displayFields(cleaned: ReturnType<typeof cleanFields>, merged: MergedMetadata) {
  return withoutUndefined({
    title: cleaned.title,
    description: cleaned.description,
    imageUrl: cleaned.imageUrl,
    siteName: cleaned.siteName,
    embed: merged.embed,
  });
}

function buildPreview(input: {
  url: string;
  contentType: string;
  merged: MergedMetadata;
  directImage: boolean;
}): PreviewResponse {
  const provider = detectProvider(input.url);
  const cleaned = input.directImage
    ? applyDirectImage(input.url, cleanFields(input.merged))
    : cleanFields(input.merged);
  const mediaType = detectMediaType(
    mediaTypeInput(input.url, input.contentType, input.merged, provider),
  );
  if (Object.keys(displayFields(cleaned, input.merged)).length === 0) {
    return previewResponse.parse({ url: input.url, mediaType });
  }
  return previewResponse.parse(
    withoutUndefined({
      url: input.url,
      mediaType,
      ...cleaned,
      provider: provider ?? undefined,
      embed: input.merged.embed,
    }),
  );
}

async function loadPage(
  safeFetch: SafeFetch,
  url: string,
): Promise<{ fetch: SafeFetchResult; metadata: PageMetadata }> {
  const fetch = await safeFetch(url);
  if (fetch.contentType.startsWith("image/")) {
    return { fetch, metadata: {} };
  }
  const metadata = parseHtmlMetadata(fetch.body, fetch.charset, fetch.finalUrl);
  return { fetch, metadata };
}

async function fetchPageIfNeeded(
  safeFetch: SafeFetch,
  url: string,
  provider: ReturnType<typeof detectProvider>,
  oembed: OEmbedResult | null,
): Promise<{ fetch: SafeFetchResult; metadata: PageMetadata } | undefined> {
  if (!shouldFetchHtml(provider, oembed)) {
    return undefined;
  }
  return loadPage(safeFetch, url);
}

type PipelineDeps = {
  safeFetch: SafeFetch;
  adapters: readonly OEmbedAdapter[];
  cache: PreviewCache;
};

function previewFromPage(
  page: { fetch: SafeFetchResult; metadata: PageMetadata } | undefined,
  requestUrl: string,
  oembed: OEmbedResult | null,
): PreviewResponse {
  const finalUrl = page?.fetch.finalUrl ?? requestUrl;
  const contentType = page?.fetch.contentType ?? "";
  return buildPreview({
    url: finalUrl,
    contentType,
    merged: mergeFields(page?.metadata ?? {}, oembed),
    directImage: contentType.startsWith("image/"),
  });
}

async function runPipeline(
  deps: PipelineDeps,
  request: PreviewRequest,
): Promise<{ preview: PreviewResponse; cacheHit: boolean }> {
  const cacheKey = request.url.normalizedUrl;
  if (!request.force) {
    const cached = deps.cache.get(cacheKey);
    if (cached !== undefined) {
      return { preview: cached, cacheHit: true };
    }
  }

  const pageUrl = new URL(request.url.url);
  const adapter = findAdapter(deps.adapters, pageUrl);
  const oembed = adapter === undefined ? null : await adapter.fetch(pageUrl, deps.safeFetch);
  const provider = detectProvider(request.url.url);
  const page = await fetchPageIfNeeded(deps.safeFetch, request.url.url, provider, oembed);
  const preview = previewFromPage(page, request.url.url, oembed);

  deps.cache.set(cacheKey, preview);
  return { preview, cacheHit: false };
}

export function createPipeline(
  deps: PipelineDeps,
): (request: PreviewRequest) => Promise<{ preview: PreviewResponse; cacheHit: boolean }> {
  return (request) => runPipeline(deps, request);
}
