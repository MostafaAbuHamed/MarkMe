import { describe, expect, it } from "vitest";

import { sanitizeText } from "../src/parse/sanitize.js";

describe("sanitizeText", () => {
  it.each([
    ["drops tags and script text", "<b>Hi</b> <script>alert(1)</script>there", 300, "Hi there"],
    ["decodes entities", "Tom &amp; Jerry &#x27;s", 300, "Tom & Jerry 's"],
    ["strips control characters", "a\u0000b\u0007c\u009f", 300, "abc"],
    ["collapses and trims whitespace", "  a \n\t  b  ", 300, "a b"],
    ["maps an empty string to undefined", "", 300, undefined],
    ["maps blank text to undefined", "   ", 300, undefined],
    ["keeps undefined", undefined, 300, undefined],
    ["cuts at max", "x".repeat(301), 300, "x".repeat(300)],
    ["never splits a surrogate pair", `${"x".repeat(299)}😀`, 300, "x".repeat(299)],
    ["keeps Arabic text", "مرحبا", 300, "مرحبا"],
  ] as const)("%s", (_name, input, max, expected) => {
    expect(sanitizeText(input, max)).toBe(expected);
  });
});
