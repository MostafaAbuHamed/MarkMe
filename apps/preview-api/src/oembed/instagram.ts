import { detectProvider } from "@markme/domain";

import type { PreviewApiEnv } from "../env.js";
import type { OEmbedAdapter } from "./common.js";
import { blockquoteOembedSchema, fetchProviderJson, fromBlockquoteOembed } from "./common.js";

const INSTAGRAM_OEMBED_BASE = "https://graph.facebook.com/v25.0/instagram_oembed";

function buildEndpoint(pageUrl: URL, env: PreviewApiEnv): URL {
  const endpoint = new URL(INSTAGRAM_OEMBED_BASE);
  endpoint.searchParams.set("url", pageUrl.href);
  if (env.META_OEMBED_TOKEN !== undefined) {
    endpoint.searchParams.set("access_token", env.META_OEMBED_TOKEN);
  }
  return endpoint;
}

export function createInstagramAdapter(env: PreviewApiEnv): OEmbedAdapter {
  return {
    match(url) {
      return detectProvider(url.href) === "instagram";
    },
    async fetch(pageUrl, safeFetch) {
      const endpoint = buildEndpoint(pageUrl, env);
      const data = await fetchProviderJson(endpoint, safeFetch, blockquoteOembedSchema);
      return data === null ? null : fromBlockquoteOembed(data);
    },
  };
}
