import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHtmlMetadata, type PageMetadata } from "../src/parse/html-metadata.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function fixture(name: string): Uint8Array {
  let text = readFileSync(join(fixturesDir, name), "utf8");
  if (name === "huge-description.html") {
    text = text.replace("DESC_PLACEHOLDER", "d".repeat(5000));
  }
  return new TextEncoder().encode(text);
}

// "مرحبا" encoded as windows-1256.
const WIN1256_TITLE_BYTES = [0xe3, 0xd1, 0xcd, 0xc8, 0xc7];
const WIN1256_TITLE = "مرحبا";

function win1256Doc(head: string): Uint8Array {
  return Buffer.concat([
    Buffer.from(`<!DOCTYPE html><html><head>${head}<title>`, "latin1"),
    Buffer.from(WIN1256_TITLE_BYTES),
    Buffer.from("</title></head><body></body></html>", "latin1"),
  ]);
}

function html(head: string): Uint8Array {
  return new TextEncoder().encode(`<!doctype html><html><head>${head}</head></html>`);
}

describe("parseHtmlMetadata", () => {
  it.each([
    [
      "og-complete.html",
      "https://example.com/page",
      undefined,
      {
        title: "OG Title",
        description: "OG Description",
        imageUrl: "https://cdn.example.com/photo.jpg",
        siteName: "Example Site",
        faviconUrl: "https://example.com/favicon.ico",
        ogType: "article",
      },
    ],
    [
      "twitter-only.html",
      "https://example.com/page",
      undefined,
      {
        title: "Twitter Title",
        description: "Twitter Description",
        imageUrl: "https://pbs.twimg.com/card.jpg",
        faviconUrl: "https://example.com/favicon.ico",
      },
    ],
    [
      "bare-title.html",
      "https://example.org/article",
      undefined,
      {
        title: "Plain Page Title",
        description: "A plain meta description.",
        faviconUrl: "https://example.org/favicon.ico",
      },
    ],
    [
      "relative-urls.html",
      "https://a.com/blog/post",
      undefined,
      {
        imageUrl: "https://a.com/img/a.png",
        faviconUrl: "https://a.com/blog/ico.png",
      },
    ],
    [
      "script-title.html",
      "https://example.com/",
      undefined,
      {
        title: "<script>x</script>Real",
        faviconUrl: "https://example.com/favicon.ico",
      },
    ],
    [
      "huge-description.html",
      "https://example.com/",
      undefined,
      {
        description: "d".repeat(5000),
        faviconUrl: "https://example.com/favicon.ico",
      },
    ],
    [
      "empty.html",
      "https://example.com/path",
      undefined,
      {
        faviconUrl: "https://example.com/favicon.ico",
      },
    ],
    [
      "unknown-charset.html",
      "https://example.com/",
      "x-made-up",
      {
        title: "UTF-8 title: مرحبا",
        faviconUrl: "https://example.com/favicon.ico",
      },
    ],
    [
      "private-image.html",
      "https://public.example/page",
      undefined,
      {
        title: "Private hosts",
        faviconUrl: "https://public.example/favicon.ico",
      },
    ],
  ] satisfies [string, string, string | undefined, PageMetadata][])(
    "%s",
    (fixtureName, finalUrl, charset, expected) => {
      const result = parseHtmlMetadata(fixture(fixtureName), charset, finalUrl);
      expect(result).toEqual(expected);
    },
  );

  it("win1256-header decodes with the Content-Type charset", () => {
    const result = parseHtmlMetadata(win1256Doc(""), "windows-1256", "https://example.com/");
    expect(result.title).toBe(WIN1256_TITLE);
  });

  it("win1256-meta decodes from the meta charset in the first 1,024 bytes", () => {
    const doc = win1256Doc('<meta charset="windows-1256">');
    const result = parseHtmlMetadata(doc, undefined, "https://example.com/");
    expect(result.title).toBe(WIN1256_TITLE);
  });

  it.each([
    ["og:image on 127.0.0.1", '<meta property="og:image" content="http://127.0.0.1/a.png">'],
    ["twitter:image on localhost", '<meta name="twitter:image" content="http://localhost/x.png">'],
    ["og:image with javascript:", '<meta property="og:image" content="javascript:alert(1)">'],
    ["og:image on localhost.", '<meta property="og:image" content="http://localhost./x.png">'],
    [
      "twitter:image on a.localhost",
      '<meta name="twitter:image" content="http://a.localhost/x.png">',
    ],
  ])("drops an image URL: %s", (_name, head) => {
    const result = parseHtmlMetadata(html(head), undefined, "https://public.example/");
    expect(result.imageUrl).toBeUndefined();
  });

  it("drops an icon on [::1] and falls back to /favicon.ico", () => {
    const head = '<link rel="icon" href="http://[::1]/f.ico">';
    const result = parseHtmlMetadata(html(head), undefined, "https://public.example/");
    expect(result.faviconUrl).toBe("https://public.example/favicon.ico");
  });

  it("keeps an image URL on a public IP literal", () => {
    const head = '<meta property="og:image" content="http://93.184.216.34/a.png">';
    const result = parseHtmlMetadata(html(head), undefined, "https://public.example/");
    expect(result.imageUrl).toBe("http://93.184.216.34/a.png");
  });
});
