import { lookup } from "node:dns/promises";

import ipaddr from "ipaddr.js";

import { PreviewFailure } from "../errors.js";
import type { AddressPolicy } from "./ip-policy.js";

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type Resolver = (host: string) => Promise<ResolvedAddress[]>;

export const dnsResolve: Resolver = async (host) => {
  const records = await lookup(host, { all: true, verbatim: true });
  return records.map((record) => ({
    address: record.address,
    family: record.family === 6 ? 6 : 4,
  }));
};

export function createResolveSafe(
  resolve: Resolver,
  policy: AddressPolicy,
): (host: string) => Promise<ResolvedAddress> {
  return async (host) => {
    const literal = stripBrackets(host);
    if (ipaddr.isValid(literal)) {
      if (policy(literal)) throw new PreviewFailure("blocked_target");
      return {
        address: literal,
        family: ipaddr.parse(literal).kind() === "ipv4" ? 4 : 6,
      };
    }

    const answers = await resolve(host);
    if (answers.length === 0) throw new PreviewFailure("fetch_failed");
    for (const answer of answers) {
      if (policy(answer.address)) throw new PreviewFailure("blocked_target");
    }

    const ipv4 = answers.find((answer) => answer.family === 4);
    if (ipv4 !== undefined) return ipv4;
    const first = answers[0];
    if (first === undefined) throw new PreviewFailure("fetch_failed");
    return first;
  };
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}
