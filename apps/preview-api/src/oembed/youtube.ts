import { detectProvider, extractYouTubeId } from "@markme/domain";
import { z } from "zod";

import type { OEmbedAdapter, OEmbedResult } from "./common.js";
import { fetchProviderJson } from "./common.js";

const YOUTUBE_OEMBED_BASE = "https://www.youtube.com/oembed";

const youtubeOembedSchema = z.object({
  title: z.string(),
  thumbnail_url: z.string(),
  provider_name: z.string(),
  type: z.string(),
});

function buildEndpoint(pageUrl: URL): URL {
  const endpoint = new URL(YOUTUBE_OEMBED_BASE);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("url", pageUrl.href);
  return endpoint;
}

const youtubeAdapter: OEmbedAdapter = {
  match(url) {
    return detectProvider(url.href) === "youtube";
  },
  async fetch(pageUrl, safeFetch) {
    const data = await fetchProviderJson(buildEndpoint(pageUrl), safeFetch, youtubeOembedSchema);
    if (data === null) {
      return null;
    }

    const result: OEmbedResult = {
      title: data.title,
      imageUrl: data.thumbnail_url,
      siteName: data.provider_name,
      oembedType: data.type,
    };

    const id = extractYouTubeId(pageUrl.href);
    if (id !== null) {
      result.embed = { provider: "youtube", id };
    }

    return result;
  },
};

export function createYouTubeAdapter(): OEmbedAdapter {
  return youtubeAdapter;
}
