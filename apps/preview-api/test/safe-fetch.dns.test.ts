import { afterEach, describe, expect, it } from "vitest";

import { PreviewFailure } from "../src/errors.js";
import { isBlockedAddress } from "../src/ssrf/ip-policy.js";
import { createSafeFetch, type SafeFetch } from "../src/ssrf/safe-fetch.js";
import { allowAll, allowOnly, testFetchDeps } from "./helpers/policy.js";
import { enotfound, scriptedResolver, type ScriptedResolver } from "./helpers/resolver.js";
import { startServer, type ServerHandler, type TestServer } from "./helpers/servers.js";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const html: ServerHandler = (_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<p>ok</p>");
};

async function listen(handler: ServerHandler, host?: string): Promise<TestServer> {
  const server = await startServer(handler, host);
  closers.push(server.close);
  return server;
}

function productionFetch(resolver: ScriptedResolver): {
  safeFetch: SafeFetch;
  connected: string[];
} {
  const connected: string[] = [];
  const safeFetch = createSafeFetch({
    resolve: resolver,
    policy: isBlockedAddress,
    onConnect: (address) => {
      connected.push(address);
    },
  });
  return { safeFetch, connected };
}

describe("safe fetch DNS", () => {
  it("blocks a host that resolves to a private address", async () => {
    const resolver = scriptedResolver({
      "a.test": [[{ address: "10.0.0.1", family: 4 }]],
    });
    const { safeFetch, connected } = productionFetch(resolver);
    const pending = safeFetch("http://a.test/");
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "blocked_target" });
    expect(resolver.calls("a.test")).toBe(1);
    expect(connected).toEqual([]);
  });

  it("blocks a lookup that mixes a public address with a loopback address", async () => {
    const resolver = scriptedResolver({
      "a.test": [
        [
          { address: "8.8.8.8", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
      ],
    });
    const { safeFetch, connected } = productionFetch(resolver);
    const pending = safeFetch("http://a.test/");
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "blocked_target" });
    expect(resolver.calls("a.test")).toBe(1);
    expect(connected).toEqual([]);
  });

  it("pins the first lookup when a second lookup would rebind", async () => {
    const server = await listen(html);
    const resolver = scriptedResolver({
      "a.test": [[{ address: "127.0.0.2", family: 4 }], [{ address: "127.0.0.1", family: 4 }]],
    });
    const deps = testFetchDeps(server, resolver, allowOnly("127.0.0.2"));
    const safeFetch = createSafeFetch(deps);
    const url = `http://a.test:${server.port}/`;
    const pending = safeFetch(url);
    await expect(pending).resolves.toMatchObject({
      finalUrl: url,
      status: 200,
      contentType: "text/html",
      charset: "utf-8",
    });
    expect(server.requests).toHaveLength(1);
    expect(deps.connected).toEqual(["127.0.0.2"]);
    expect(resolver.calls("a.test")).toBe(1);
  });

  it("prefers the IPv4 answer when AAAA is listed first", async () => {
    const server = await listen(html);
    const resolver = scriptedResolver({
      "a.test": [
        [
          { address: "::1", family: 6 },
          { address: "127.0.0.2", family: 4 },
        ],
      ],
    });
    const deps = testFetchDeps(server, resolver, allowAll);
    const safeFetch = createSafeFetch(deps);
    const url = `http://a.test:${server.port}/`;
    const pending = safeFetch(url);
    await expect(pending).resolves.toMatchObject({
      finalUrl: url,
      status: 200,
      contentType: "text/html",
    });
    expect(server.requests).toHaveLength(1);
    expect(deps.connected).toEqual(["127.0.0.2"]);
  });

  it("connects to IPv6 when the lookup has no IPv4 address", async () => {
    const server = await listen(html, "::1");
    const resolver = scriptedResolver({
      "a.test": [[{ address: "::1", family: 6 }]],
    });
    const deps = testFetchDeps(server, resolver, allowAll);
    const safeFetch = createSafeFetch(deps);
    const url = `http://a.test:${server.port}/`;
    const pending = safeFetch(url);
    await expect(pending).resolves.toMatchObject({
      finalUrl: url,
      status: 200,
      contentType: "text/html",
    });
    expect(server.requests).toHaveLength(1);
    expect(deps.connected).toEqual(["::1"]);
  });

  it("maps ENOTFOUND to fetch_failed", async () => {
    const resolver = scriptedResolver({ "a.test": enotfound("a.test") });
    const { safeFetch, connected } = productionFetch(resolver);
    const pending = safeFetch("http://a.test/");
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "fetch_failed" });
    expect(resolver.calls("a.test")).toBe(1);
    expect(connected).toEqual([]);
  });
});
