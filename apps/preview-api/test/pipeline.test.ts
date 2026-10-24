import { LIMITS, previewRequest, previewResponse, type PreviewRequest } from "@markme/domain";
import { describe, expect, it } from "vitest";

import { createPreviewCache } from "../src/cache.js";
import { PreviewFailure } from "../src/errors.js";
import type { OEmbedAdapter } from "../src/oembed/common.js";
import { createPipeline } from "../src/pipeline.js";
import type { SafeFetch, SafeFetchOptions, SafeFetchResult } from "../src/ssrf/safe-fetch.js";

type FetchCall = { url: string; options?: SafeFetchOptions | undefined };

function parseRequest(url: string, force?: boolean): PreviewRequest {
  const input: { url: string; force?: boolean } = { url };
  if (force !== undefined) {
    input.force = force;
  }
  return previewRequest.parse(input);
}

function fakeSafeFetch(
  handler: (url: string, options?: SafeFetchOptions) => SafeFetchResult | never,
): { safeFetch: SafeFetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const safeFetch: SafeFetch = (url, options) => {
    calls.push({ url, options });
    const result = handler(url, options);
    return Promise.resolve(result);
  };
  return { safeFetch, calls };
}

function htmlResult(pageUrl: string, html: string): SafeFetchResult {
  return {
    finalUrl: pageUrl,
    status: 200,
    contentType: "text/html",
    charset: undefined,
    body: new TextEncoder().encode(html),
  };
}

function noMatchAdapter(): OEmbedAdapter {
  return {
    match: () => false,
    fetch: () => Promise.resolve(null),
  };
}

describe("createPipeline", () => {
  it("parses HTML metadata with sanitized, length-limited title", async () => {
    const pageUrl = "https://example.com/page";
    const longTitle = `${"T".repeat(LIMITS.title + 50)} end`;
    const html = `<!doctype html><html><head><title><script>x</script>${longTitle}</title></head></html>`;
    const { safeFetch } = fakeSafeFetch(() => htmlResult(pageUrl, html));
    const cache = createPreviewCache();
    const run = createPipeline({ safeFetch, adapters: [noMatchAdapter()], cache });

    const { preview, cacheHit } = await run(parseRequest(pageUrl));

    expect(cacheHit).toBe(false);
    expect(previewResponse.parse(preview)).toEqual(preview);
    expect(preview.title).toBe("T".repeat(LIMITS.title));
    expect(preview.mediaType).toBe("link");
  });

  it("truncates a long description to LIMITS.description", async () => {
    const pageUrl = "https://example.com/long";
    const html = `<!doctype html><html><head><meta name="description" content="${"d".repeat(5000)}"></head></html>`;
    const { safeFetch } = fakeSafeFetch(() => htmlResult(pageUrl, html));
    const run = createPipeline({
      safeFetch,
      adapters: [noMatchAdapter()],
      cache: createPreviewCache(),
    });

    const { preview } = await run(parseRequest(pageUrl));

    expect(preview.description).toBe("d".repeat(LIMITS.description));
  });

  it.each([
    {
      name: "encoded file name",
      url: "https://a.com/img/My%20Cat.png",
      expectedTitle: "My Cat.png",
    },
    {
      name: "bad percent sequence",
      url: "https://a.com/img/bad%ZZ.png",
      expectedTitle: "bad%ZZ.png",
    },
  ])("direct image $name", async ({ url, expectedTitle }) => {
    const { safeFetch, calls } = fakeSafeFetch((fetchUrl) => ({
      finalUrl: fetchUrl,
      status: 200,
      contentType: "image/png",
      charset: undefined,
      body: new Uint8Array(),
    }));
    const run = createPipeline({
      safeFetch,
      adapters: [noMatchAdapter()],
      cache: createPreviewCache(),
    });

    const { preview } = await run(parseRequest(url));

    expect(calls).toHaveLength(1);
    expect(preview).toEqual({
      url,
      imageUrl: url,
      mediaType: "image",
      title: expectedTitle,
    });
  });

  it("returns only url and mediaType for an empty HTML page", async () => {
    const pageUrl = "https://example.com/empty";
    const html = "<!doctype html><html><head></head><body></body></html>";
    const { safeFetch } = fakeSafeFetch(() => htmlResult(pageUrl, html));
    const run = createPipeline({
      safeFetch,
      adapters: [noMatchAdapter()],
      cache: createPreviewCache(),
    });

    const { preview } = await run(parseRequest(pageUrl));

    expect(preview).toStrictEqual({ url: pageUrl, mediaType: "link" });
  });

  it("uses a successful YouTube adapter without fetching HTML", async () => {
    const pageUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const youtubeAdapter: OEmbedAdapter = {
      match: (url) => url.hostname === "www.youtube.com",
      fetch: () =>
        Promise.resolve({
          title: "Video Title",
          imageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
          siteName: "YouTube",
          oembedType: "video",
          embed: { provider: "youtube", id: "dQw4w9WgXcQ" },
        }),
    };
    const { safeFetch, calls } = fakeSafeFetch(() => {
      throw new PreviewFailure("fetch_failed");
    });
    const run = createPipeline({
      safeFetch,
      adapters: [youtubeAdapter],
      cache: createPreviewCache(),
    });

    const { preview } = await run(parseRequest(pageUrl));

    expect(calls).toEqual([]);
    expect(preview.provider).toBe("youtube");
    expect(preview.embed).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
    expect(preview.mediaType).toBe("video");
  });

  it("merges X oEmbed with HTML, preferring adapter description", async () => {
    const pageUrl = "https://x.com/user/status/1";
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="HTML Title">
      <meta property="og:image" content="https://cdn.example/card.jpg">
    </head></html>`;
    const xAdapter: OEmbedAdapter = {
      match: (url) => url.hostname === "x.com",
      fetch: () =>
        Promise.resolve({
          description: "From oEmbed",
          siteName: "Twitter",
          oembedType: "rich",
        }),
    };
    const { safeFetch, calls } = fakeSafeFetch(() => htmlResult(pageUrl, html));
    const run = createPipeline({
      safeFetch,
      adapters: [xAdapter],
      cache: createPreviewCache(),
    });

    const { preview } = await run(parseRequest(pageUrl));

    expect(calls).toHaveLength(1);
    expect(preview.description).toBe("From oEmbed");
    expect(preview.title).toBe("HTML Title");
    expect(preview.imageUrl).toBe("https://cdn.example/card.jpg");
    expect(preview.mediaType).toBe("post");
  });

  it("falls back to HTML when the adapter returns null", async () => {
    const pageUrl = "https://example.com/article";
    const html = `<!doctype html><html><head><title>Only HTML</title></head></html>`;
    const adapter: OEmbedAdapter = {
      match: () => true,
      fetch: () => Promise.resolve(null),
    };
    const { safeFetch } = fakeSafeFetch(() => htmlResult(pageUrl, html));
    const run = createPipeline({ safeFetch, adapters: [adapter], cache: createPreviewCache() });

    const { preview } = await run(parseRequest(pageUrl));

    expect(preview.title).toBe("Only HTML");
  });

  describe("cache", () => {
    const pageUrl = "https://a.com/cached";
    const html = "<!doctype html><html><head><title>Cached</title></head></html>";

    it("reuses the entry for the same normalized URL", async () => {
      const clock = { t: 0 };
      const cache = createPreviewCache({ now: () => clock.t });
      const { safeFetch, calls } = fakeSafeFetch(() => htmlResult(pageUrl, html));
      const run = createPipeline({ safeFetch, adapters: [noMatchAdapter()], cache });

      const first = await run(parseRequest(pageUrl));
      const second = await run(parseRequest(pageUrl));

      expect(first.cacheHit).toBe(false);
      expect(second.cacheHit).toBe(true);
      expect(calls).toHaveLength(1);
      expect(second.preview).toEqual(first.preview);
    });

    it("shares one entry for URLs that normalize to the same key", async () => {
      const cache = createPreviewCache();
      const { safeFetch, calls } = fakeSafeFetch(() => htmlResult("https://a.com/x", html));
      const run = createPipeline({ safeFetch, adapters: [noMatchAdapter()], cache });

      await run(parseRequest("https://a.com/x"));
      const second = await run(parseRequest("https://a.com/x?utm_source=y"));

      expect(second.cacheHit).toBe(true);
      expect(calls).toHaveLength(1);
    });

    it("refetches and replaces the entry when force is true", async () => {
      const cache = createPreviewCache();
      let version = 1;
      const { safeFetch, calls } = fakeSafeFetch(() =>
        htmlResult(pageUrl, `<!doctype html><html><head><title>v${version}</title></head></html>`),
      );
      const run = createPipeline({ safeFetch, adapters: [noMatchAdapter()], cache });

      await run(parseRequest(pageUrl));
      version = 2;
      const forced = await run(parseRequest(pageUrl, true));

      expect(forced.cacheHit).toBe(false);
      expect(calls).toHaveLength(2);
      expect(forced.preview.title).toBe("v2");

      const after = await run(parseRequest(pageUrl));
      expect(after).toMatchObject({ cacheHit: true, preview: { title: "v2" } });
    });

    it("does not cache PreviewFailure", async () => {
      const cache = createPreviewCache();
      let fail = true;
      const { safeFetch, calls } = fakeSafeFetch(() => {
        if (fail) {
          throw new PreviewFailure("timeout");
        }
        return htmlResult(pageUrl, html);
      });
      const run = createPipeline({ safeFetch, adapters: [noMatchAdapter()], cache });

      await expect(run(parseRequest(pageUrl))).rejects.toThrow(PreviewFailure);
      fail = false;
      const second = await run(parseRequest(pageUrl));

      expect(second.cacheHit).toBe(false);
      expect(calls).toHaveLength(2);
    });

    it("expires entries after 24 hours", async () => {
      const clock = { t: 1_000_000 };
      const cache = createPreviewCache({ now: () => clock.t });
      const { safeFetch, calls } = fakeSafeFetch(() => htmlResult(pageUrl, html));
      const run = createPipeline({ safeFetch, adapters: [noMatchAdapter()], cache });

      await run(parseRequest(pageUrl));
      clock.t += 86_400_000 + 1;
      const second = await run(parseRequest(pageUrl));

      expect(second.cacheHit).toBe(false);
      expect(calls).toHaveLength(2);
    });
  });

  it.each([
    { code: "blocked_target" as const },
    { code: "fetch_failed" as const },
    { code: "timeout" as const },
  ])("propagates PreviewFailure code $code", async ({ code }) => {
    const { safeFetch } = fakeSafeFetch(() => {
      throw new PreviewFailure(code);
    });
    const run = createPipeline({
      safeFetch,
      adapters: [noMatchAdapter()],
      cache: createPreviewCache(),
    });

    await expect(run(parseRequest("https://example.com/fail"))).rejects.toMatchObject({ code });
  });
});
