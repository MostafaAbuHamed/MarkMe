export const MAX_URL_LENGTH = 2048;

export type NormalizeError = "invalid" | "unsupported_scheme" | "has_credentials" | "too_long";

export type NormalizeResult =
  { ok: true; url: string; normalizedUrl: string } | { ok: false; error: NormalizeError };

const TRACKING_KEYS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "igsh",
  "igshid",
  "mc_cid",
  "mc_eid",
]);

function isYoutubeHost(hostname: string): boolean {
  return hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be";
}

function isTrackingParam(key: string, hostname: string): boolean {
  const lower = key.toLowerCase();
  if (lower.startsWith("utm_")) {
    return true;
  }
  if (TRACKING_KEYS.has(lower)) {
    return true;
  }
  if (lower === "si" && isYoutubeHost(hostname)) {
    return true;
  }
  return false;
}

function normalizeQuery(search: string, hostname: string): string {
  if (search === "") {
    return "";
  }
  const raw = search.slice(1);
  const kept: string[] = [];
  for (const segment of raw.split("&")) {
    if (segment === "") {
      continue;
    }
    const eq = segment.indexOf("=");
    const key = eq === -1 ? segment : segment.slice(0, eq);
    if (!isTrackingParam(key, hostname)) {
      kept.push(segment);
    }
  }
  return kept.join("&");
}

export function normalizeUrl(input: string): NormalizeResult {
  const trimmed = input.trim();
  const url = URL.parse(trimmed);
  if (url === null) {
    return { ok: false, error: "invalid" };
  }

  const protocol = url.protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    return { ok: false, error: "unsupported_scheme" };
  }

  if (url.username !== "" || url.password !== "") {
    return { ok: false, error: "has_credentials" };
  }

  const path = url.pathname.replace(/\/+$/, "");
  const query = normalizeQuery(url.search, url.hostname);
  const normalizedUrl = protocol + "//" + url.host + path + (query ? "?" + query : "");

  if (url.href.length > MAX_URL_LENGTH) {
    return { ok: false, error: "too_long" };
  }

  return { ok: true, url: url.href, normalizedUrl };
}
