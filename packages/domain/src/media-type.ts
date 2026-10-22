import type { Enums } from "@markme/database";

import type { Provider } from "./url/provider";

export type MediaType = Enums<"media_type">;

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"] as const;
const VIDEO_EXTENSIONS = [".mp4", ".webm"] as const;

type DetectMediaTypeInput = {
  url: string;
  contentType?: string;
  ogType?: string;
  oembedType?: string;
  provider?: Provider | null;
};

function normalizeText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.toLowerCase();
}

function normalizeContentType(value: string | undefined): string | null {
  const normalized = normalizeText(value);
  if (normalized === null) {
    return null;
  }
  const semicolon = normalized.indexOf(";");
  return semicolon === -1 ? normalized : normalized.slice(0, semicolon).trim();
}

function fromVideoSignal(
  provider: Provider | null | undefined,
  oembedType: string | null,
): MediaType | null {
  if (provider === "youtube") {
    return "video";
  }
  if (oembedType === "video") {
    return "video";
  }
  return null;
}

function fromSocialProvider(provider: Provider | null | undefined): MediaType | null {
  if (provider === "x" || provider === "instagram") {
    return "post";
  }
  return null;
}

function fromImageSignal(oembedType: string | null, contentType: string | null): MediaType | null {
  if (oembedType === "photo") {
    return "image";
  }
  if (contentType !== null && contentType.startsWith("image/")) {
    return "image";
  }
  return null;
}

function fromOgType(ogType: string | null): MediaType | null {
  if (ogType === null) {
    return null;
  }
  if (ogType.startsWith("video.")) {
    return "video";
  }
  if (ogType === "article") {
    return "article";
  }
  return null;
}

function fromUrlExtension(url: string): MediaType | null {
  const parsed = URL.parse(url);
  if (parsed === null) {
    return null;
  }
  const pathname = parsed.pathname.toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
    return "video";
  }
  return null;
}

export function detectMediaType(input: DetectMediaTypeInput): MediaType {
  const oembedType = normalizeText(input.oembedType);
  const contentType = normalizeContentType(input.contentType);
  const ogType = normalizeText(input.ogType);

  return (
    fromVideoSignal(input.provider, oembedType) ??
    fromSocialProvider(input.provider) ??
    fromImageSignal(oembedType, contentType) ??
    fromOgType(ogType) ??
    fromUrlExtension(input.url) ??
    "link"
  );
}
