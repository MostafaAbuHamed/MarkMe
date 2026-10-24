import type { PreviewApiEnv } from "../env.js";
import type { OEmbedAdapter } from "./common.js";
import { createInstagramAdapter } from "./instagram.js";
import { createXAdapter } from "./x.js";
import { createYouTubeAdapter } from "./youtube.js";

export type { OEmbedAdapter, OEmbedResult } from "./common.js";

export function createAdapters(env: PreviewApiEnv): readonly OEmbedAdapter[] {
  return [createYouTubeAdapter(), createXAdapter(), createInstagramAdapter(env)];
}
