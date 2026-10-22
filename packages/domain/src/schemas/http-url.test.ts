import { describe, expect, it } from "vitest";

import { httpUrl, urlErrorCode } from "./http-url";

const tooLongUrl = "https://a.com/" + "a".repeat(2100 - "https://a.com/".length);

describe("httpUrl", () => {
  it("normalizes a valid URL", () => {
    const result = httpUrl.safeParse(" https://a.com/x/?utm_source=y ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        url: "https://a.com/x/?utm_source=y",
        normalizedUrl: "https://a.com/x",
      });
    }
  });

  it.each([
    ["not a url", "invalid"],
    ["ftp://a.com", "unsupported_scheme"],
    ["https://u:p@a.com", "has_credentials"],
    [tooLongUrl, "too_long"],
    ["example.com", "invalid"],
  ])("%s → %s", (input, code) => {
    const result = httpUrl.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(urlErrorCode(result.error)).toBe(code);
    }
  });

  it("rejects non-string input with null urlErrorCode", () => {
    const result = httpUrl.safeParse(123);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(urlErrorCode(result.error)).toBe(null);
    }
  });
});
