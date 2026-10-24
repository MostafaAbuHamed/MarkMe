import { isBlockedAddress, type AddressPolicy } from "../../src/ssrf/ip-policy.js";
import type { Resolver } from "../../src/ssrf/resolve.js";

export const allowAll: AddressPolicy = () => false;

export function allowOnly(ip: string): AddressPolicy {
  return (candidate) => candidate !== ip && isBlockedAddress(candidate);
}

export function testFetchDeps(
  server: { port: number },
  resolve: Resolver,
  policy: AddressPolicy = allowAll,
): {
  resolve: Resolver;
  policy: AddressPolicy;
  ports: readonly string[];
  onConnect: (address: string) => void;
  connected: string[];
} {
  const connected: string[] = [];
  return {
    resolve,
    policy,
    ports: ["", "80", "443", String(server.port)],
    onConnect: (address) => {
      connected.push(address);
    },
    connected,
  };
}
