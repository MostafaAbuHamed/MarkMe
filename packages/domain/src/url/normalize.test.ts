import { describe, expect, it } from "vitest";

import { MAX_URL_LENGTH, normalizeUrl } from "./normalize";

const ruleRows: [string, string][] = [
  ["  https://a.com ", "https://a.com"],
  ["HTTPS://Ex.COM/A", "https://ex.com/A"],
  ["https://bücher.de", "https://xn--bcher-kva.de"],
  ["https://a.com:443/x", "https://a.com/x"],
  ["http://a.com:80/x", "http://a.com/x"],
  ["http://a.com:8080", "http://a.com:8080"],
  ["https://a.com:80/x", "https://a.com:80/x"],
  ["https://a.com/x#top", "https://a.com/x"],
  ["https://a.com/x?#f", "https://a.com/x"],
  ["https://a.com/x?", "https://a.com/x"],
  ["https://a.com/x?b=2&a=1", "https://a.com/x?b=2&a=1"],
  ["https://a.com/x?q=a+b&r=%20", "https://a.com/x?q=a+b&r=%20"],
  ["https://a.com/x/", "https://a.com/x"],
  ["https://a.com/", "https://a.com"],
  ["https://a.com//", "https://a.com"],
  ["https://a.com/a//", "https://a.com/a"],
  ["https://a.com/x/?a=1", "https://a.com/x?a=1"],
  ["https://:@a.com", "https://a.com"],
];

const errorRows: [string, string][] = [
  ["", "invalid"],
  ["   ", "invalid"],
  ["not a url", "invalid"],
  ["https://", "invalid"],
  ["http://a b.com", "invalid"],
  ["ftp://a.com", "unsupported_scheme"],
  ["javascript:alert(1)", "unsupported_scheme"],
  ["mailto:a@b.com", "unsupported_scheme"],
  ["data:text/plain,hi", "unsupported_scheme"],
  ["file:///etc/passwd", "unsupported_scheme"],
  ["https://u:p@a.com", "has_credentials"],
  ["https://u@a.com", "has_credentials"],
  ["ftp://u:p@a.com", "unsupported_scheme"],
  ["https://a.com/" + "a".repeat(2035), "too_long"],
  ["https://a.com/x?utm_source=" + "a".repeat(2040), "too_long"],
];

const trackingKeys = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_foo",
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
] as const;

const trackingRows: [string, string][] = [
  ...trackingKeys.map(
    (key) => [`https://a.com/x?${key}=1&id=2`, "https://a.com/x?id=2"] as [string, string],
  ),
  ["https://a.com/x?IGSH=abc", "https://a.com/x"],
  ["https://a.com/x?UTM_Source=x&id=2", "https://a.com/x?id=2"],
  ["https://a.com/x?a=1&fbclid=x&b=2", "https://a.com/x?a=1&b=2"],
  ["https://a.com/x?fbclid=x&b=2", "https://a.com/x?b=2"],
  ["https://a.com/x?a=1&fbclid=x", "https://a.com/x?a=1"],
  ["https://a.com/x?utm=1", "https://a.com/x?utm=1"],
  ["https://a.com/x?xutm_source=1", "https://a.com/x?xutm_source=1"],
  ["https://a.com/x?fbclid2=1", "https://a.com/x?fbclid2=1"],
  ["https://a.com/x?utm%5Fsource=1", "https://a.com/x?utm%5Fsource=1"],
  [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  ],
  [
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=1",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
  ],
  ["https://youtu.be/dQw4w9WgXcQ?si=abc", "https://youtu.be/dQw4w9WgXcQ"],
  ["https://studio.youtube.com/?si=1", "https://studio.youtube.com"],
  ["https://a.com/x?si=1", "https://a.com/x?si=1"],
  ["https://notyoutube.com/?si=1", "https://notyoutube.com?si=1"],
  ["https://youtube.com.evil.com/?si=1", "https://youtube.com.evil.com?si=1"],
];

const queryRows: [string, string][] = [
  ["https://a.com/x?a=1&&b=2", "https://a.com/x?a=1&b=2"],
  ["https://a.com/x?&a=1", "https://a.com/x?a=1"],
  ["https://a.com/x?a=1&", "https://a.com/x?a=1"],
  ["https://a.com/x?&", "https://a.com/x"],
  ["https://a.com/x?a=", "https://a.com/x?a="],
  ["https://a.com/x?a", "https://a.com/x?a"],
  ["https://a.com/x?a=1&a=2", "https://a.com/x?a=1&a=2"],
  ["https://a.com/x?s=a b", "https://a.com/x?s=a%20b"],
];

const edgeRows: [string, string][] = [
  ["http://[::1]", "http://[::1]"],
  ["http://[::1]:8080/x/", "http://[::1]:8080/x"],
  ["https://a.com/%2f//x", "https://a.com/%2f//x"],
  ["https://a.com/%2F//x", "https://a.com/%2F//x"],
  ["https://www.a.com", "https://www.a.com"],
  ["https://youtu.be/dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ"],
  ["https://youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=dQw4w9WgXcQ"],
  ["https://twitter.com/a", "https://twitter.com/a"],
];

const okNormalizedUrls: string[] = [
  ...ruleRows.map(([, expected]) => expected),
  ...trackingRows.map(([, expected]) => expected),
  ...queryRows.map(([, expected]) => expected),
  ...edgeRows.map(([, expected]) => expected),
  "https://a.com/x",
];

describe("normalizeUrl rules", () => {
  it.each(ruleRows)("%s → %s", (input, expected) => {
    const result = normalizeUrl(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedUrl).toBe(expected);
    }
  });
});

describe("normalizeUrl errors", () => {
  it.each(errorRows)("%s → %s", (input, error) => {
    expect(normalizeUrl(input)).toEqual({ ok: false, error });
  });

  it("accepts a URL at the length boundary", () => {
    const input = "https://a.com/" + "a".repeat(2034);
    const result = normalizeUrl(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    expect(result.normalizedUrl.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    expect(result.normalizedUrl.length).toBe(MAX_URL_LENGTH);
    expect(normalizeUrl(result.normalizedUrl)).toEqual(result);
  });
});

describe("normalizeUrl tracking", () => {
  it.each(trackingRows)("%s → %s", (input, expected) => {
    const result = normalizeUrl(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedUrl).toBe(expected);
    }
  });
});

describe("normalizeUrl query", () => {
  it.each(queryRows)("%s → %s", (input, expected) => {
    const result = normalizeUrl(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedUrl).toBe(expected);
    }
  });
});

describe("normalizeUrl edge cases", () => {
  it.each(edgeRows)("%s → %s", (input, expected) => {
    const result = normalizeUrl(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedUrl).toBe(expected);
    }
  });
});

describe("normalizeUrl url output", () => {
  it("keeps tracking params and fragment in url", () => {
    const result = normalizeUrl("https://a.com/x?utm_source=y#top");
    expect(result).toEqual({
      ok: true,
      url: "https://a.com/x?utm_source=y#top",
      normalizedUrl: "https://a.com/x",
    });
  });
});

describe("normalizeUrl invariants", () => {
  it.each(okNormalizedUrls)("%s is idempotent and matches ^https?://", (normalizedUrl) => {
    const again = normalizeUrl(normalizedUrl);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.normalizedUrl).toBe(normalizedUrl);
    }
    expect(normalizedUrl).toMatch(/^https?:\/\//);
  });
});
