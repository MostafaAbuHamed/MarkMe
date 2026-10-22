import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import type { Provider } from "../url/provider";
import { urlErrorCode } from "./http-url";
import { LIMITS } from "./limits";
import { PREVIEW_ERROR_CODES, previewError, previewRequest, previewResponse } from "./preview";

const imageUrl2049 = "https://a.com/" + "a".repeat(2049 - "https://a.com/".length);

describe("previewRequest", () => {
  it("accepts url and exposes normalizedUrl", () => {
    const result = previewRequest.safeParse({ url: "https://a.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url.normalizedUrl).toBe("https://a.com");
    }
  });

  it("accepts force: true", () => {
    const result = previewRequest.safeParse({ url: "https://a.com", force: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.force).toBe(true);
    }
  });

  it("rejects bare hostname", () => {
    const result = previewRequest.safeParse({ url: "example.com" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(urlErrorCode(result.error)).toBe("invalid");
    }
  });

  it('rejects force: "yes"', () => {
    expect(previewRequest.safeParse({ url: "https://a.com", force: "yes" }).success).toBe(false);
  });
});

describe("previewResponse", () => {
  it("accepts minimal shape", () => {
    const result = previewResponse.safeParse({ url: "https://a.com", mediaType: "link" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ url: "https://a.com", mediaType: "link" });
    }
  });

  it("accepts full shape unchanged", () => {
    const input = {
      url: "https://a.com",
      title: "Title",
      description: "Desc",
      imageUrl: "https://img.a.com/i.png",
      faviconUrl: "https://a.com/f.ico",
      siteName: "A",
      mediaType: "link" as const,
      embed: { provider: "youtube" as const, id: "dQw4w9WgXcQ" },
      provider: "youtube" as const,
    };
    const result = previewResponse.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it.each([
    ["title", { title: "a".repeat(LIMITS.title) }],
    ["description", { description: "a".repeat(LIMITS.description) }],
    ["siteName", { siteName: "a".repeat(LIMITS.siteName) }],
  ])("at-limit %s passes", (_field, extra) => {
    const result = previewResponse.safeParse({
      url: "https://a.com",
      mediaType: "link",
      ...extra,
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["title", { title: "a".repeat(LIMITS.title + 1) }],
    ["description", { description: "a".repeat(LIMITS.description + 1) }],
    ["siteName", { siteName: "a".repeat(LIMITS.siteName + 1) }],
  ])("one over %s fails", (_field, extra) => {
    const result = previewResponse.safeParse({
      url: "https://a.com",
      mediaType: "link",
      ...extra,
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["javascript:x", { imageUrl: "javascript:x" }],
    ["imageUrl length 2049", { imageUrl: imageUrl2049 }],
    ["credentials in faviconUrl", { faviconUrl: "https://u:p@a.com" }],
  ])("bad link %s fails", (_label, extra) => {
    const result = previewResponse.safeParse({
      url: "https://a.com",
      mediaType: "link",
      ...extra,
    });
    expect(result.success).toBe(false);
  });

  it("keeps imageUrl as given without normalizing", () => {
    const imageUrl = "https://a.com/i.png?utm_source=x";
    const result = previewResponse.safeParse({
      url: "https://a.com",
      mediaType: "link",
      imageUrl,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imageUrl).toBe(imageUrl);
    }
  });

  it('rejects mediaType: "audio"', () => {
    expect(previewResponse.safeParse({ url: "https://a.com", mediaType: "audio" }).success).toBe(
      false,
    );
  });

  it.each([
    ["embed.id short", { embed: { provider: "youtube" as const, id: "short" } }],
    ["embed.provider vimeo", { embed: { provider: "vimeo" as const, id: "dQw4w9WgXcQ" } }],
  ])("%s fails", (_label, extra) => {
    const result = previewResponse.safeParse({
      url: "https://a.com",
      mediaType: "link",
      ...extra,
    });
    expect(result.success).toBe(false);
  });

  it("accepts provider instagram", () => {
    const result = previewResponse.safeParse({
      url: "https://a.com",
      mediaType: "link",
      provider: "instagram",
    });
    expect(result.success).toBe(true);
  });

  it('rejects provider: "vimeo"', () => {
    expect(
      previewResponse.safeParse({
        url: "https://a.com",
        mediaType: "link",
        provider: "vimeo",
      }).success,
    ).toBe(false);
  });

  it("provider enum matches Provider", () => {
    type ResponseProvider = NonNullable<z.infer<typeof previewResponse>["provider"]>;
    expectTypeOf<ResponseProvider>().toEqualTypeOf<Provider>();
  });
});

describe("previewError", () => {
  it.each(PREVIEW_ERROR_CODES)("%s passes", (code) => {
    const result = previewError.safeParse({ error: code });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ error: code });
    }
  });

  it('rejects { error: "oops" }', () => {
    expect(previewError.safeParse({ error: "oops" }).success).toBe(false);
  });

  it("PREVIEW_ERROR_CODES matches contract", () => {
    expect(PREVIEW_ERROR_CODES).toEqual([
      "invalid_url",
      "unauthorized",
      "blocked_target",
      "rate_limited",
      "fetch_failed",
      "timeout",
    ]);
  });
});
