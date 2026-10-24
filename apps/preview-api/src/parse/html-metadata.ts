import * as cheerio from "cheerio";

import { isBlockedAddress } from "../ssrf/ip-policy.js";

const CHARSET_SNIFF_BYTES = 1024;
const IPV4_LITERAL = /^\d+\.\d+\.\d+\.\d+$/;

const META_CHARSET_RE = /<meta\s+charset\s*=\s*["']?([^"'\s>]+)/i;
const HTTP_EQUIV_CHARSET_RE =
  /<meta[^>]*http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([^"'\s;]+)/i;
const CONTENT_HTTP_EQUIV_CHARSET_RE =
  /<meta[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([^"'\s;]+)[^"']*["'][^>]*http-equiv\s*=\s*["']?content-type["']?/i;

export interface PageMetadata {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  faviconUrl?: string;
  ogType?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function sniffCharset(body: Uint8Array): string | undefined {
  const slice = body.subarray(0, Math.min(body.length, CHARSET_SNIFF_BYTES));
  const head = new TextDecoder("latin1").decode(slice);
  const direct = META_CHARSET_RE.exec(head);
  if (direct) {
    return direct[1];
  }
  const httpEquiv = HTTP_EQUIV_CHARSET_RE.exec(head) ?? CONTENT_HTTP_EQUIV_CHARSET_RE.exec(head);
  if (httpEquiv) {
    return httpEquiv[1];
  }
  return undefined;
}

function decodeBody(body: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(body);
  } catch (error) {
    if (error instanceof RangeError) {
      return new TextDecoder("utf-8").decode(body);
    }
    throw error;
  }
}

// WHATWG URL brackets IPv6 hosts and normalizes IPv4 forms to four-part decimal.
function isPrivateHost(hostname: string): boolean {
  const host = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  const isIpLiteral = host.startsWith("[") || IPV4_LITERAL.test(host);
  return (
    host === "localhost" || host.endsWith(".localhost") || (isIpLiteral && isBlockedAddress(host))
  );
}

function resolveHttpUrl(value: string | undefined, finalUrl: string): string | undefined {
  const raw = nonEmpty(value);
  if (raw === undefined) {
    return undefined;
  }
  const resolved = URL.parse(raw, finalUrl);
  if (resolved === null) {
    return undefined;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return undefined;
  }
  return isPrivateHost(resolved.hostname) ? undefined : resolved.href;
}

function defaultFaviconUrl(finalUrl: string): string {
  return new URL("/favicon.ico", new URL(finalUrl).origin).href;
}

function metaContent($: cheerio.CheerioAPI, selector: string): string | undefined {
  return nonEmpty($(selector).first().attr("content"));
}

export function parseHtmlMetadata(
  body: Uint8Array,
  charset: string | undefined,
  finalUrl: string,
): PageMetadata {
  const label = charset ?? sniffCharset(body) ?? "utf-8";
  const html = decodeBody(body, label);
  const $ = cheerio.load(html);

  const title =
    metaContent($, 'meta[property="og:title"]') ??
    metaContent($, 'meta[name="twitter:title"]') ??
    nonEmpty($("title").first().text());

  const description =
    metaContent($, 'meta[property="og:description"]') ??
    metaContent($, 'meta[name="twitter:description"]') ??
    metaContent($, 'meta[name="description"]');

  const imageRaw =
    metaContent($, 'meta[property="og:image"]') ??
    metaContent($, 'meta[property="og:image:url"]') ??
    metaContent($, 'meta[name="twitter:image"]');
  const imageUrl = resolveHttpUrl(imageRaw, finalUrl);

  const siteName = metaContent($, 'meta[property="og:site_name"]');
  const ogType = metaContent($, 'meta[property="og:type"]');

  const iconHref = nonEmpty($('link[rel~="icon"]').first().attr("href"));
  const faviconUrl = resolveHttpUrl(iconHref, finalUrl) ?? defaultFaviconUrl(finalUrl);

  const metadata: PageMetadata = { faviconUrl };
  if (title !== undefined) {
    metadata.title = title;
  }
  if (description !== undefined) {
    metadata.description = description;
  }
  if (imageUrl !== undefined) {
    metadata.imageUrl = imageUrl;
  }
  if (siteName !== undefined) {
    metadata.siteName = siteName;
  }
  if (ogType !== undefined) {
    metadata.ogType = ogType;
  }
  return metadata;
}
