export type Provider = "youtube" | "x" | "instagram";

/** Same rule as M1 `items_embed_youtube_chk` in item_rules migration. */
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

const X_HOSTS = new Set([
  "x.com",
  "twitter.com",
  "www.x.com",
  "www.twitter.com",
  "mobile.x.com",
  "mobile.twitter.com",
]);

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);

const INSTAGRAM_PATH_PREFIXES = ["/p/", "/reel/", "/tv/"];

const YOUTUBE_EMBED_PATH_PREFIXES = ["/shorts/", "/embed/", "/live/"] as const;

function isYouTubePath(pathname: string): boolean {
  if (pathname === "/watch") {
    return true;
  }
  return YOUTUBE_EMBED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isInstagramPath(pathname: string): boolean {
  return INSTAGRAM_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function detectProviderFromParsed(parsed: URL): Provider | null {
  const hostname = parsed.hostname;
  const pathname = parsed.pathname;

  if (hostname === "youtu.be") {
    return "youtube";
  }

  if (YOUTUBE_HOSTS.has(hostname) && isYouTubePath(pathname)) {
    return "youtube";
  }

  if (X_HOSTS.has(hostname)) {
    return "x";
  }

  if (INSTAGRAM_HOSTS.has(hostname) && isInstagramPath(pathname)) {
    return "instagram";
  }

  return null;
}

export function detectProvider(url: string): Provider | null {
  const parsed = URL.parse(url);
  if (parsed === null) {
    return null;
  }
  return detectProviderFromParsed(parsed);
}

function firstPathSegment(pathname: string, prefix: string): string | null {
  const rest = pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  const segment = slash === -1 ? rest : rest.slice(0, slash);
  return segment === "" ? null : segment;
}

export function extractYouTubeId(url: string): string | null {
  const parsed = URL.parse(url);
  if (parsed === null) {
    return null;
  }
  if (detectProviderFromParsed(parsed) !== "youtube") {
    return null;
  }

  const { hostname, pathname } = parsed;
  let candidate: string | null = null;

  if (hostname === "youtu.be") {
    candidate = firstPathSegment(pathname, "/");
  } else if (pathname === "/watch") {
    candidate = parsed.searchParams.get("v");
  } else {
    for (const prefix of YOUTUBE_EMBED_PATH_PREFIXES) {
      if (pathname.startsWith(prefix)) {
        candidate = firstPathSegment(pathname, prefix);
        break;
      }
    }
  }

  if (candidate === null) {
    return null;
  }

  return YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
}
