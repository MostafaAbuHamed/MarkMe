import type { PreviewResponse } from "@markme/domain";
import { LRUCache } from "lru-cache";

const CACHE_MAX = 5000;
const CACHE_TTL_MS = 86_400_000;

export interface PreviewCache {
  get(key: string): PreviewResponse | undefined;
  set(key: string, value: PreviewResponse): void;
}

export function createPreviewCache(deps?: { now?: () => number }): PreviewCache {
  const cache = new LRUCache<string, PreviewResponse>({
    max: CACHE_MAX,
    ttl: CACHE_TTL_MS,
    ...(deps?.now === undefined ? {} : { perf: { now: deps.now } }),
  });

  return {
    get: (key) => cache.get(key),
    set: (key, value) => {
      cache.set(key, value);
    },
  };
}
