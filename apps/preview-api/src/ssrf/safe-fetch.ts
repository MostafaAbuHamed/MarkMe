import type { AddressPolicy } from "./ip-policy.js";
import type { Resolver } from "./resolve.js";

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
  return () => {
    void deps;
    return Promise.reject(new Error("not implemented"));
  };
}
