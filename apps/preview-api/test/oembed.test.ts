import { describe, expect, it } from "vitest";

import { PreviewFailure } from "../src/errors.js";
import { loadEnv } from "../src/env.js";
import { createAdapters } from "../src/oembed/index.js";
import { createInstagramAdapter } from "../src/oembed/instagram.js";
import { createXAdapter } from "../src/oembed/x.js";
import { createYouTubeAdapter } from "../src/oembed/youtube.js";
import type { SafeFetch, SafeFetchOptions } from "../src/ssrf/safe-fetch.js";

type FetchCall = { url: string; options?: SafeFetchOptions | undefined };

function fakeSafeFetch(handler: (url: string, options?: SafeFetchOptions) => Uint8Array | never): {
  safeFetch: SafeFetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const safeFetch: SafeFetch = (url, options) => {
    calls.push({ url, options });
    const body = handler(url, options);
    return Promise.resolve({
      finalUrl: url,
      status: 200,
      contentType: "application/json",
      charset: undefined,
      body,
    });
  };
  return { safeFetch, calls };
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

const youtubePageUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const youtubeOembedBody = {
  title: "Never Gonna Give You Up",
  author_name: "Rick Astley",
  thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  provider_name: "YouTube",
  type: "video",
  html: '<iframe width="200" height="113"></iframe>',
};

describe("YouTube oEmbed adapter", () => {
  const adapter = createYouTubeAdapter();

  it("fetches oEmbed and maps fields without html", async () => {
    const { safeFetch, calls } = fakeSafeFetch(() => jsonBytes(youtubeOembedBody));
    const result = await adapter.fetch(new URL(youtubePageUrl), safeFetch);

    expect(calls).toEqual([
      {
        url: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubePageUrl)}`,
        options: { allowedTypes: ["application/json"] },
      },
    ]);
    expect(result).toEqual({
      title: "Never Gonna Give You Up",
      imageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      siteName: "YouTube",
      oembedType: "video",
      embed: { provider: "youtube", id: "dQw4w9WgXcQ" },
    });
    expect(result).not.toHaveProperty("html");
  });

  it("omits embed when the video id fails YOUTUBE_ID_PATTERN", async () => {
    const pageUrl = "https://www.youtube.com/watch?v=short";
    const { safeFetch } = fakeSafeFetch(() =>
      jsonBytes({
        ...youtubeOembedBody,
        thumbnail_url: "https://i.ytimg.com/vi/short/hqdefault.jpg",
      }),
    );
    const result = await adapter.fetch(new URL(pageUrl), safeFetch);

    expect(result).toEqual({
      title: "Never Gonna Give You Up",
      imageUrl: "https://i.ytimg.com/vi/short/hqdefault.jpg",
      siteName: "YouTube",
      oembedType: "video",
    });
    expect(result).not.toHaveProperty("embed");
  });
});

describe("X oEmbed adapter", () => {
  const adapter = createXAdapter();
  const pageUrl = "https://x.com/a/status/1";

  it("fetches oEmbed and maps blockquote text to description", async () => {
    const { safeFetch, calls } = fakeSafeFetch(() =>
      jsonBytes({
        author_name: "A",
        provider_name: "Twitter",
        type: "rich",
        html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Hello <b>world</b></p></blockquote>',
      }),
    );
    const result = await adapter.fetch(new URL(pageUrl), safeFetch);

    expect(calls).toEqual([
      {
        url: `https://publish.x.com/oembed?omit_script=true&url=${encodeURIComponent(pageUrl)}`,
        options: { allowedTypes: ["application/json"] },
      },
    ]);
    expect(result).toEqual({
      description: "Hello world",
      siteName: "Twitter",
      oembedType: "rich",
    });
    expect(result).not.toHaveProperty("embed");
    expect(result).not.toHaveProperty("html");
  });
});

describe("Instagram oEmbed adapter", () => {
  const pageUrl = "https://www.instagram.com/p/abc/";

  it("calls Graph oEmbed without access_token when unset", async () => {
    const env = loadEnv({ SUPABASE_URL: "http://127.0.0.1:54321" });
    const adapter = createInstagramAdapter(env);
    const { safeFetch, calls } = fakeSafeFetch(() =>
      jsonBytes({
        provider_name: "Instagram",
        type: "rich",
        html: "<blockquote>Caption here</blockquote>",
      }),
    );
    await adapter.fetch(new URL(pageUrl), safeFetch);

    expect(calls).toEqual([
      {
        url: `https://graph.facebook.com/v25.0/instagram_oembed?url=${encodeURIComponent(pageUrl)}`,
        options: { allowedTypes: ["application/json"] },
      },
    ]);
  });

  it("adds access_token when META_OEMBED_TOKEN is set", async () => {
    const env = loadEnv({
      SUPABASE_URL: "http://127.0.0.1:54321",
      META_OEMBED_TOKEN: "t",
    });
    const adapter = createInstagramAdapter(env);
    const { safeFetch, calls } = fakeSafeFetch(() =>
      jsonBytes({
        provider_name: "Instagram",
        type: "rich",
        html: "<blockquote>Caption</blockquote>",
      }),
    );
    await adapter.fetch(new URL(pageUrl), safeFetch);

    const called = new URL(calls[0]!.url);
    expect(called.searchParams.get("access_token")).toBe("t");
    expect(called.searchParams.get("url")).toBe(pageUrl);
  });
});

describe("oEmbed adapter failures", () => {
  const adapter = createYouTubeAdapter();
  const pageUrl = new URL(youtubePageUrl);

  it.each([
    [
      "PreviewFailure fetch_failed",
      { kind: "throw" as const, error: new PreviewFailure("fetch_failed") },
    ],
    [
      "PreviewFailure blocked_target",
      { kind: "throw" as const, error: new PreviewFailure("blocked_target") },
    ],
    ["Meta error body", { kind: "body" as const, body: jsonBytes({ error: { code: 24 } }) }],
    ["wrong JSON shape", { kind: "body" as const, body: jsonBytes({ title: "only title" }) }],
    ["non-JSON body", { kind: "body" as const, body: new TextEncoder().encode("not json") }],
  ])("%s → null", async (_name, scenario) => {
    const safeFetch: SafeFetch = () => {
      if (scenario.kind === "throw") {
        return Promise.reject(scenario.error);
      }
      return Promise.resolve({
        finalUrl: "https://www.youtube.com/oembed",
        status: 200,
        contentType: "application/json",
        charset: undefined,
        body: scenario.body,
      });
    };

    await expect(adapter.fetch(pageUrl, safeFetch)).resolves.toBeNull();
  });
});

describe("createAdapters", () => {
  const env = loadEnv({ SUPABASE_URL: "http://127.0.0.1:54321" });
  const adapters = createAdapters(env);

  // One row per host; the position of `true` proves the order youtube, x, instagram.
  it.each([
    ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", [true, false, false]],
    ["x", "https://x.com/a/status/1", [false, true, false]],
    ["instagram", "https://www.instagram.com/p/abc/", [false, false, true]],
    ["other", "https://example.com/", [false, false, false]],
  ] as const)("match for %s host", (_label, href, expected) => {
    const url = new URL(href);
    expect(adapters.map((a) => a.match(url))).toEqual([...expected]);
  });
});
