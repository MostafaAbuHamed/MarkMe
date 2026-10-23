import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { PreviewFailure } from "../src/errors.js";
import { createSafeFetch } from "../src/ssrf/safe-fetch.js";
import { allowOnly, testFetchDeps } from "./helpers/policy.js";
import { scriptedResolver, type ScriptedResolver } from "./helpers/resolver.js";
import { startServer, type ServerHandler, type TestServer } from "./helpers/servers.js";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

function respond(
  res: ServerResponse,
  status: number,
  headers: Record<string, string>,
  body = "",
): void {
  res.writeHead(status, headers);
  res.end(body);
}

async function hosted(handler: ServerHandler): Promise<{
  server: TestServer;
  resolver: ScriptedResolver;
  connected: string[];
  safeFetch: ReturnType<typeof createSafeFetch>;
}> {
  const server = await startServer(handler);
  closers.push(server.close);
  const resolver = scriptedResolver({
    "a.test": [[{ address: "127.0.0.2", family: 4 }]],
    "internal.test": [[{ address: "10.0.0.1", family: 4 }]],
  });
  const deps = testFetchDeps(server, resolver, allowOnly("127.0.0.2"));
  return {
    server,
    resolver,
    connected: deps.connected,
    safeFetch: createSafeFetch(deps),
  };
}

describe("safe fetch redirects", () => {
  it.fails.each([
    ["http://127.0.0.1/", "127.0.0.1"],
    ["http://169.254.169.254/latest/meta-data", "169.254.169.254"],
  ])("blocks a redirect to %s", async (location, host) => {
    const { server, resolver, connected, safeFetch } = await hosted((_req, res) => {
      respond(res, 302, { location });
    });
    const pending = safeFetch(`http://a.test:${server.port}/`);
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "blocked_target" });
    expect(server.requests).toHaveLength(1);
    expect(connected).toEqual(["127.0.0.2"]);
    expect(resolver.calls("a.test")).toBe(1);
    expect(resolver.calls(host)).toBe(0);
  });

  it.fails("blocks a redirect to a host that resolves to a private address", async () => {
    const { server, resolver, connected, safeFetch } = await hosted((_req, res) => {
      respond(res, 302, { location: "http://internal.test/" });
    });
    const pending = safeFetch(`http://a.test:${server.port}/`);
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "blocked_target" });
    expect(server.requests).toHaveLength(1);
    expect(connected).toEqual(["127.0.0.2"]);
    expect(resolver.calls("a.test")).toBe(1);
    expect(resolver.calls("internal.test")).toBe(1);
  });

  it.fails("blocks a redirect to ftp", async () => {
    const { server, resolver, connected, safeFetch } = await hosted((_req, res) => {
      respond(res, 302, { location: "ftp://a.com" });
    });
    const pending = safeFetch(`http://a.test:${server.port}/`);
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "blocked_target" });
    expect(server.requests).toHaveLength(1);
    expect(connected).toEqual(["127.0.0.2"]);
    expect(resolver.calls("a.test")).toBe(1);
    expect(resolver.calls("a.com")).toBe(0);
  });

  it.fails("resolves a relative Location against the current URL and follows it", async () => {
    const { server, safeFetch } = await hosted((req, res) => {
      if (req.url === "/next") {
        respond(res, 200, { "content-type": "text/html" }, "next");
        return;
      }
      respond(res, 302, { location: "/next" });
    });
    const start = `http://a.test:${server.port}/`;
    const finalUrl = new URL("/next", start).href;
    const pending = safeFetch(start);
    await expect(pending).resolves.toMatchObject({
      finalUrl,
      status: 200,
      contentType: "text/html",
    });
    expect(server.requests.map((request) => request.path)).toEqual(["/", "/next"]);
  });

  it.fails("follows three redirects and returns the last hop", async () => {
    const { server, safeFetch } = await hosted((req, res) => {
      const steps = ["/", "/1", "/2", "/3"];
      const index = steps.indexOf(req.url ?? "");
      if (index === steps.length - 1) {
        respond(res, 200, { "content-type": "text/html" }, "done");
        return;
      }
      const next = steps[index + 1] ?? "/3";
      respond(res, 302, { location: next });
    });
    const finalUrl = `http://a.test:${server.port}/3`;
    const pending = safeFetch(`http://a.test:${server.port}/`);
    await expect(pending).resolves.toMatchObject({
      finalUrl,
      status: 200,
      contentType: "text/html",
    });
    expect(server.requests.map((request) => request.path)).toEqual(["/", "/1", "/2", "/3"]);
  });

  it.fails("fails the fetch on a fourth redirect", async () => {
    const { server, safeFetch } = await hosted((req, res) => {
      const steps = ["/", "/1", "/2", "/3", "/4"];
      const index = steps.indexOf(req.url ?? "");
      const next = steps[index + 1];
      if (next === undefined) {
        respond(res, 200, { "content-type": "text/html" }, "too far");
        return;
      }
      respond(res, 302, { location: next });
    });
    const pending = safeFetch(`http://a.test:${server.port}/`);
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "fetch_failed" });
    expect(server.requests.map((request) => request.path)).toEqual(["/", "/1", "/2", "/3"]);
  });
});
