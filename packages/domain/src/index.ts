export const DOMAIN_PACKAGE = "@markme/domain";

export { EnvError, parseEnv, type EnvIssue } from "./env/parse-env";
export {
  MAX_URL_LENGTH,
  normalizeUrl,
  type NormalizeError,
  type NormalizeResult,
} from "./url/normalize";
