import { detectProvider } from "@markme/domain";

import type { OEmbedAdapter } from "./common.js";
import { blockquoteOembedSchema, fetchProviderJson, fromBlockquoteOembed } from "./common.js";

const X_OEMBED_BASE = "https://publish.x.com/oembed";

function buildEndpoint(pageUrl: URL): URL {
  const endpoint = new URL(X_OEMBED_BASE);
  endpoint.searchParams.set("omit_script", "true");
  endpoint.searchParams.set("url", pageUrl.href);
  return endpoint;
}

const xAdapter: OEmbedAdapter = {
  match(url) {
    return detectProvider(url.href) === "x";
  },
  async fetch(pageUrl, safeFetch) {
    const data = await fetchProviderJson(buildEndpoint(pageUrl), safeFetch, blockquoteOembedSchema);
    return data === null ? null : fromBlockquoteOembed(data);
  },
};

export function createXAdapter(): OEmbedAdapter {
  return xAdapter;
}
