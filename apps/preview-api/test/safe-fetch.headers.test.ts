import { afterEach, describe, expect, it } from "vitest";

import { createSafeFetch } from "../src/ssrf/safe-fetch.js";
import { testFetchDeps } from "./helpers/policy.js";
import { scriptedResolver } from "./helpers/resolver.js";
import { startServer, type ServerHandler, type TestServer } from "./helpers/servers.js";

const USER_AGENT = "MarkMeBot/1.0 (+https://github.com/MostafaAbuHamed/MarkMe)";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function listen(handler: ServerHandler): Promise<TestServer> {
  const server = await startServer(handler);
  closers.push(server.close);
  return server;
}

function safeFetchFor(server: TestServer) {
  const resolver = scriptedResolver({
    "a.test": [[{ address: "127.0.0.2", family: 4 }]],
  });
  return createSafeFetch(testFetchDeps(server, resolver));
}

describe("safe fetch headers", () => {
  it.fails("sends the fixed user-agent and no cookie or authorization", async () => {
    const body = "<p>ok</p>";
    const server = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
    });
    const safeFetch = safeFetchFor(server);
    const url = `http://a.test:${server.port}/`;
    const pending = safeFetch(url);
    await expect(pending).resolves.toMatchObject({
      finalUrl: url,
      status: 200,
      contentType: "text/html",
      charset: "utf-8",
    });
    const result = await pending;
    expect(result.body).toEqual(new TextEncoder().encode(body));
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.headers["user-agent"]).toBe(USER_AGENT);
    expect(server.requests[0]?.headers.cookie).toBeUndefined();
    expect(server.requests[0]?.headers.authorization).toBeUndefined();
  });

  it.fails("does not replay Set-Cookie on the next hop", async () => {
    const server = await listen((req, res) => {
      if (req.url === "/next") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("next");
        return;
      }
      res.writeHead(302, { location: "/next", "set-cookie": "s=1" });
      res.end();
    });
    const safeFetch = safeFetchFor(server);
    const start = `http://a.test:${server.port}/`;
    const pending = safeFetch(start);
    await expect(pending).resolves.toMatchObject({
      finalUrl: new URL("/next", start).href,
      status: 200,
      contentType: "text/html",
    });
    expect(server.requests).toHaveLength(2);
    expect(server.requests[0]?.headers.cookie).toBeUndefined();
    expect(server.requests[1]?.headers.cookie).toBeUndefined();
    expect(server.requests[1]?.headers.authorization).toBeUndefined();
  });

  it.fails("sends the accept header it was given", async () => {
    const accept = "text/html,application/xhtml+xml";
    const server = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("ok");
    });
    const safeFetch = safeFetchFor(server);
    const url = `http://a.test:${server.port}/`;
    const pending = safeFetch(url, { accept });
    await expect(pending).resolves.toMatchObject({
      finalUrl: url,
      status: 200,
      contentType: "text/html",
    });
    expect(server.requests[0]?.headers.accept).toBe(accept);
  });
});
