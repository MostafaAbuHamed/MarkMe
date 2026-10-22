import { normalizeUrl, type NormalizeResult } from "./normalize";

const SCHEME_WITH_AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\//i;
const SCHEME_WITHOUT_AUTHORITY = /^(https?|mailto|javascript|data|tel|sms|about|blob|vbscript):/i;

export function parseUserUrl(input: string): NormalizeResult {
  const trimmed = input.trim();

  if (SCHEME_WITH_AUTHORITY.test(trimmed) || SCHEME_WITHOUT_AUTHORITY.test(trimmed)) {
    return normalizeUrl(trimmed);
  }

  if (!/\s/.test(trimmed)) {
    const delim = trimmed.search(/[/?#]/);
    const before = delim === -1 ? trimmed : trimmed.slice(0, delim);
    if (before.includes(".")) {
      return normalizeUrl("https://" + trimmed);
    }
  }

  return { ok: false, error: "invalid" };
}
