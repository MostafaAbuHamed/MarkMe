import { describe, expect, it } from "vitest";

import { parseUserUrl } from "./parse-user-url";

const step1SchemePresentRows: [string, string][] = [
  ["HTTPS://A.com", "https://a.com"],
  ["ftp://a.com", "unsupported_scheme"],
  ["mailto:a@b.com", "unsupported_scheme"],
  ["JavaScript:alert(1)", "unsupported_scheme"],
  ["about:blank", "unsupported_scheme"],
  ["tel:+123", "unsupported_scheme"],
  ["sms:1", "unsupported_scheme"],
  ["data:text/html,x", "unsupported_scheme"],
  ["blob:https://a.com/x", "unsupported_scheme"],
  ["vbscript:x", "unsupported_scheme"],
  ["chrome-extension://abc/x", "unsupported_scheme"],
];

const step2LooksLikeHostRows: [string, string][] = [
  ["example.com/x?y=1", "https://example.com/x?y=1"],
  ["example.com:8080/x", "https://example.com:8080/x"],
  ["Example.COM", "https://example.com"],
  ["  example.com/x  ", "https://example.com/x"],
  ["example.com#top", "https://example.com"],
  ["a.com?x=1", "https://a.com?x=1"],
  ["192.168.1.1:8080", "https://192.168.1.1:8080"],
  ["u:p@a.com", "has_credentials"],
  ["a:b.c", "invalid"],
];

const step3OtherwiseRows: [string, string][] = [
  ["localhost:3000", "invalid"],
  ["notes", "invalid"],
  ["a.com b", "invalid"],
  ["foo/bar.baz", "invalid"],
  ["", "invalid"],
  ["   ", "invalid"],
];

function expectParseResult(input: string, expected: string): void {
  const result = parseUserUrl(input);
  if (
    expected === "invalid" ||
    expected === "unsupported_scheme" ||
    expected === "has_credentials" ||
    expected === "too_long"
  ) {
    expect(result).toEqual({ ok: false, error: expected });
    return;
  }
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.normalizedUrl).toBe(expected);
  }
}

describe("parseUserUrl step 1, scheme present", () => {
  it.each(step1SchemePresentRows)("%s → %s", (input, expected) => {
    expectParseResult(input, expected);
  });
});

describe("parseUserUrl step 2, looks like a host", () => {
  it.each(step2LooksLikeHostRows)("%s → %s", (input, expected) => {
    expectParseResult(input, expected);
  });
});

describe("parseUserUrl step 3, otherwise", () => {
  it.each(step3OtherwiseRows)("%s → %s", (input, expected) => {
    expectParseResult(input, expected);
  });
});
