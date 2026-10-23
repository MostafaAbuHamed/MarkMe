import type { IncomingMessage, ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { PreviewFailure } from "../src/errors.js";
import { createSafeFetch, type SafeFetchOptions } from "../src/ssrf/safe-fetch.js";
import { testFetchDeps } from "./helpers/policy.js";
import { scriptedResolver } from "./helpers/resolver.js";
import { startServer, type ServerHandler } from "./helpers/servers.js";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

function page(
  body: string | Buffer,
  status: number,
  headers: Record<string, string | number>,
): ServerHandler {
  return (_req, res) => {
    res.writeHead(status, headers);
    res.end(body);
  };
}

async function fetchFrom(handler: ServerHandler, options?: SafeFetchOptions) {
  const server = await startServer(handler);
  closers.push(server.close);
  const resolver = scriptedResolver({
    "a.test": [[{ address: "127.0.0.2", family: 4 }]],
  });
  const safeFetch = createSafeFetch(testFetchDeps(server, resolver));
  // Wrapped so callers' `await` waits for the server, not for the fetch.
  return { pending: safeFetch(`http://a.test:${server.port}/`, options) };
}

function delay(ms: number, res: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    res.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe("safe fetch limits", () => {
  it.fails(
    "times out when the body trickles past the deadline",
    async () => {
      const server = await startServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        let sent = 0;
        const timer = setInterval(() => {
          sent += 1;
          if (sent >= 20) {
            clearInterval(timer);
            res.end();
            return;
          }
          res.write("x");
        }, 500);
        res.on("close", () => {
          clearInterval(timer);
        });
      });
      closers.push(server.close);
      const resolver = scriptedResolver({
        "a.test": [[{ address: "127.0.0.2", family: 4 }]],
      });
      const safeFetch = createSafeFetch(testFetchDeps(server, resolver));
      const started = performance.now();
      const pending = safeFetch(`http://a.test:${server.port}/`);
      await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
      await expect(pending).rejects.toMatchObject({ code: "timeout" });
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(4_000);
      expect(elapsed).toBeLessThan(6_000);
    },
    10_000,
  );

  it.fails(
    "times out across three redirects that share one deadline",
    async () => {
      const server = await startServer(async (req, res) => {
        await delay(2_000, res);
        if (res.destroyed || res.writableEnded) return;
        const next = `${req.url ?? "/"}x`;
        res.writeHead(302, { location: next });
        res.end();
      });
      closers.push(server.close);
      const resolver = scriptedResolver({
        "a.test": [[{ address: "127.0.0.2", family: 4 }]],
      });
      const safeFetch = createSafeFetch(testFetchDeps(server, resolver));
      const started = performance.now();
      const pending = safeFetch(`http://a.test:${server.port}/`);
      await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
      await expect(pending).rejects.toMatchObject({ code: "timeout" });
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(4_000);
      expect(elapsed).toBeLessThan(6_000);
    },
    10_000,
  );

  it.fails("fails a text/html body larger than 2 MB", async () => {
    const body = Buffer.alloc(3 * 1024 * 1024, 0x61);
    const { pending } = await fetchFrom(
      page(body, 200, { "content-type": "text/html", "content-length": body.length }),
    );
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "fetch_failed" });
  });

  it.fails("fails a gzip body that inflates past 2 MB", async () => {
    const gzipped = gzipSync(Buffer.alloc(3 * 1024 * 1024));
    const { pending } = await fetchFrom(
      page(gzipped, 200, {
        "content-type": "text/html",
        "content-encoding": "gzip",
        "content-length": gzipped.length,
      }),
    );
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "fetch_failed" });
  });

  it.fails.each(["application/json", "application/octet-stream"])(
    "rejects %s with the default allowlist",
    async (type) => {
      const { pending } = await fetchFrom(page("{}", 200, { "content-type": type }));
      await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
      await expect(pending).rejects.toMatchObject({ code: "fetch_failed" });
    },
  );

  it.fails("accepts application/json when the caller allows it", async () => {
    const body = Buffer.from('{"ok":true}');
    const server = await startServer(page(body, 200, { "content-type": "application/json" }));
    closers.push(server.close);
    const resolver = scriptedResolver({
      "a.test": [[{ address: "127.0.0.2", family: 4 }]],
    });
    const safeFetch = createSafeFetch(testFetchDeps(server, resolver));
    const url = `http://a.test:${server.port}/`;
    const pending = safeFetch(url, { allowedTypes: ["application/json"] });
    await expect(pending).resolves.toMatchObject({
      finalUrl: url,
      status: 200,
      contentType: "application/json",
    });
    const result = await pending;
    expect(result.body).toEqual(new Uint8Array(body));
  });

  it.fails(
    "accepts image/png without reading the body",
    async () => {
      const totalChunks = 40;
      let chunksWritten = 0;
      let closedEarly = false;
      const server = await startServer((_req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        const timer = setInterval(() => {
          if (res.destroyed || res.writableEnded) {
            closedEarly = chunksWritten < totalChunks;
            clearInterval(timer);
            return;
          }
          chunksWritten += 1;
          if (chunksWritten >= totalChunks) {
            clearInterval(timer);
            res.end();
            return;
          }
          res.write(Buffer.alloc(64 * 1024, 7));
        }, 50);
        res.on("close", () => {
          if (chunksWritten < totalChunks) closedEarly = true;
          clearInterval(timer);
        });
      });
      closers.push(server.close);
      const resolver = scriptedResolver({
        "a.test": [[{ address: "127.0.0.2", family: 4 }]],
      });
      const safeFetch = createSafeFetch(testFetchDeps(server, resolver));
      const url = `http://a.test:${server.port}/`;
      const pending = safeFetch(url);
      await expect(pending).resolves.toMatchObject({
        finalUrl: url,
        status: 200,
        contentType: "image/png",
      });
      const result = await pending;
      expect(result.body.length).toBe(0);
      const until = performance.now() + 1_000;
      while (!closedEarly && performance.now() < until) {
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
      }
      expect(closedEarly).toBe(true);
      expect(chunksWritten).toBeLessThan(totalChunks);
    },
    10_000,
  );

  it.fails("fails a 200 response with no content type", async () => {
    const { pending } = await fetchFrom((_req, res) => {
      res.writeHead(200);
      res.end("hello");
    });
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "fetch_failed" });
  });

  it.fails.each([404, 500])("fails a final %i", async (status) => {
    const { pending } = await fetchFrom(page("nope", status, { "content-type": "text/html" }));
    await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
    await expect(pending).rejects.toMatchObject({ code: "fetch_failed" });
  });

  it.fails(
    "maps a connection reset to fetch_failed, not timeout",
    async () => {
      const server = await startServer((req: IncomingMessage) => {
        req.socket.destroy();
      });
      closers.push(server.close);
      const resolver = scriptedResolver({
        "a.test": [[{ address: "127.0.0.2", family: 4 }]],
      });
      const safeFetch = createSafeFetch(testFetchDeps(server, resolver));
      const started = performance.now();
      const pending = safeFetch(`http://a.test:${server.port}/`);
      await expect(pending).rejects.toBeInstanceOf(PreviewFailure);
      await expect(pending).rejects.toMatchObject({ code: "fetch_failed" });
      expect(performance.now() - started).toBeLessThan(4_000);
    },
    10_000,
  );
});
