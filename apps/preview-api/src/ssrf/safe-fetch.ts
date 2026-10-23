import type { LookupOptions } from "node:dns";
import type { ReadableStreamDefaultReader } from "node:stream/web";

import { Agent, fetch } from "undici";

import { PreviewFailure } from "../errors.js";
import type { AddressPolicy } from "./ip-policy.js";
import { createResolveSafe, type ResolvedAddress, type Resolver } from "./resolve.js";

export const USER_AGENT = "MarkMeBot/1.0 (+https://github.com/MostafaAbuHamed/MarkMe)";

const DEFAULT_PORTS = ["", "80", "443"];
const DEFAULT_ALLOWED_TYPES = ["text/html", "application/xhtml+xml", "image/*"];
const DEFAULT_DEADLINE_MS = 5_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

export interface SafeFetchOptions {
  deadlineMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
  allowedTypes?: readonly string[];
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  charset: string | undefined;
  body: Uint8Array;
}

export type SafeFetch = (url: string, options?: SafeFetchOptions) => Promise<SafeFetchResult>;

export function createSafeFetch(deps: {
  resolve: Resolver;
  policy: AddressPolicy;
  ports?: readonly string[];
  onConnect?: (address: string) => void;
}): SafeFetch {
  const ports = deps.ports ?? DEFAULT_PORTS;
  const resolveSafe = createResolveSafe(deps.resolve, deps.policy);

  return async (rawUrl, options = {}) => {
    const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const allowedTypes = options.allowedTypes ?? DEFAULT_ALLOWED_TYPES;
    const signal = AbortSignal.timeout(deadlineMs);

    try {
      let current = new URL(rawUrl);
      for (let hop = 0; hop <= maxRedirects; hop += 1) {
        if (current.protocol !== "http:" && current.protocol !== "https:") {
          throw new PreviewFailure("blocked_target");
        }
        if (!ports.includes(current.port)) throw new PreviewFailure("blocked_target");

        const target = await untilAborted(resolveSafe(current.hostname), signal);
        deps.onConnect?.(target.address);

        const agent = new Agent({ connect: { lookup: pinnedLookup(target) } });
        try {
          const response = await fetch(current, {
            dispatcher: agent,
            redirect: "manual",
            signal,
            credentials: "omit",
            headers: requestHeaders(options.accept),
          });

          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            await discard(response);
            if (location === null || hop === maxRedirects) {
              throw new PreviewFailure("fetch_failed");
            }
            current = new URL(location, current);
            continue;
          }

          if (response.status < 200 || response.status >= 300) {
            await discard(response);
            throw new PreviewFailure("fetch_failed");
          }

          const { contentType, charset } = parseContentType(response.headers.get("content-type"));
          if (contentType === undefined || !typeAllowed(contentType, allowedTypes)) {
            await discard(response);
            throw new PreviewFailure("fetch_failed");
          }

          if (contentType.startsWith("image/")) {
            await discard(response);
            return {
              finalUrl: current.href,
              status: response.status,
              contentType,
              charset,
              body: new Uint8Array(),
            };
          }

          const body = await readBody(response.body, maxBytes, signal);
          return { finalUrl: current.href, status: response.status, contentType, charset, body };
        } finally {
          await agent.close().catch(() => undefined);
        }
      }

      throw new PreviewFailure("fetch_failed");
    } catch (error: unknown) {
      if (error instanceof PreviewFailure) throw error;
      if (signal.aborted && isTimeoutReason(signal.reason)) {
        throw new PreviewFailure("timeout");
      }
      throw new PreviewFailure("fetch_failed");
    }
  };
}

function pinnedLookup(target: ResolvedAddress) {
  return (
    _hostname: string,
    options: LookupOptions,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | { address: string; family: number }[],
      family?: number,
    ) => void,
  ): void => {
    if (options.all === true) {
      callback(null, [{ address: target.address, family: target.family }]);
      return;
    }
    callback(null, target.address, target.family);
  };
}

function requestHeaders(accept: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { "user-agent": USER_AGENT };
  if (accept !== undefined) headers.accept = accept;
  return headers;
}

function parseContentType(header: string | null): {
  contentType: string | undefined;
  charset: string | undefined;
} {
  if (header === null) return { contentType: undefined, charset: undefined };
  const [rawType, ...parameters] = header.split(";");
  const contentType = rawType?.trim().toLowerCase() ?? "";
  if (contentType === "") return { contentType: undefined, charset: undefined };

  let charset: string | undefined;
  for (const parameter of parameters) {
    const separator = parameter.indexOf("=");
    if (separator === -1) continue;
    const name = parameter.slice(0, separator).trim().toLowerCase();
    if (name !== "charset" || charset !== undefined) continue;
    const value = unquote(parameter.slice(separator + 1));
    if (value !== "") charset = value;
  }
  return { contentType, charset };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim().toLowerCase();
  }
  return trimmed.toLowerCase();
}

function typeAllowed(contentType: string, allowedTypes: readonly string[]): boolean {
  return allowedTypes.some((allowed) =>
    allowed === "image/*" ? contentType.startsWith("image/") : allowed === contentType,
  );
}

async function discard(response: { body: ReadableStream | null }): Promise<void> {
  await response.body?.cancel();
}

async function readBody(
  body: ReadableStream | null,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (body === null) return new Uint8Array();

  const reader = byteReader(body);
  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort, { once: true });

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new Error("aborted");
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new PreviewFailure("fetch_failed");
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }

  if (signal.aborted) throw new Error("aborted");
  return concat(chunks, total);
}

function byteReader(body: ReadableStream): ReadableStreamDefaultReader<Uint8Array> {
  return body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

// The deadline covers DNS too; a lookup has no signal of its own.
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      reject(new Error("aborted"));
    };
    if (signal.aborted) onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

function isTimeoutReason(reason: unknown): boolean {
  return (
    typeof reason === "object" &&
    reason !== null &&
    "name" in reason &&
    reason.name === "TimeoutError"
  );
}
