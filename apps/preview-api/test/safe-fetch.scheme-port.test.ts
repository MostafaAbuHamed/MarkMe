import { describe, expect, it } from "vitest";

import { PreviewFailure } from "../src/errors.js";
import { isBlockedAddress } from "../src/ssrf/ip-policy.js";
import { createSafeFetch } from "../src/ssrf/safe-fetch.js";
import { enotfound, scriptedResolver } from "./helpers/resolver.js";

const blockedSchemes = [
  "file:///etc/passwd",
  "ftp://a.com",
  "gopher://a.com",
  "data:text/html,x",
] as const;

const blockedPorts = ["http://a.com:22", "http://a.com:8080", "http://a.com:6379"] as const;

const allowedPorts = [
  "http://a.com/",
  "http://a.com:80/",
  "https://a.com:443/",
  "https://a.com:80/",
  "http://a.com:443/",
] as const;

function fetchBlocked(host = "a.com") {
  const resolver = scriptedResolver({ [host]: enotfound(host) });
  const safeFetch = createSafeFetch({ resolve: resolver, policy: isBlockedAddress });
  return { resolver, safeFetch };
}

describe("safe fetch scheme and port", () => {
  it.fails.each(blockedSchemes)("%s is blocked before any lookup", async (url) => {
    const { resolver, safeFetch } = fetchBlocked();
    const pending = safeFetch(url);
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "blocked_target" });
    expect(resolver.calls()).toBe(0);
  });

  it.fails.each(blockedPorts)("%s is blocked before any lookup", async (url) => {
    const { resolver, safeFetch } = fetchBlocked();
    const pending = safeFetch(url);
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "blocked_target" });
    expect(resolver.calls()).toBe(0);
  });

  it.fails.each(allowedPorts)(
    "%s passes the port check and fails closed when DNS throws",
    async (url) => {
      const { resolver, safeFetch } = fetchBlocked();
      const pending = safeFetch(url);
      await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
      await expect(pending).rejects.toMatchObject({ code: "fetch_failed" });
      expect(resolver.calls("a.com")).toBe(1);
      expect(resolver.calls()).toBe(1);
    },
  );
});
