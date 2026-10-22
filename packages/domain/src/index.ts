export const DOMAIN_PACKAGE = "@markme/domain";

export { EnvError, parseEnv, type EnvIssue } from "./env/parse-env";
export {
  MAX_URL_LENGTH,
  normalizeUrl,
  type NormalizeError,
  type NormalizeResult,
} from "./url/normalize";
export { parseUserUrl } from "./url/parse-user-url";
export {
  YOUTUBE_ID_PATTERN,
  detectProvider,
  extractYouTubeId,
  type Provider,
} from "./url/provider";
export { detectMediaType, type MediaType } from "./media-type";
export { embedProvider, mediaType, previewStatus } from "./schemas/enums";
export { LIMITS } from "./schemas/limits";
