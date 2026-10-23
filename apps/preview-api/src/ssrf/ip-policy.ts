import ipaddr from "ipaddr.js";

/** Returns true when the address must not be fetched. */
export type AddressPolicy = (ip: string) => boolean;

// Defense in depth behind the range() check (docs/IMPLEMENTATION_PLAN.md §3 M3).
const BLOCKED_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "255.255.255.255/32",
  "::/128",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
  "64:ff9b::/96",
  "64:ff9b:1::/48",
  "2001::/32",
  "2001:db8::/32",
  "::ffff:0:0/96",
  "2002::/16",
].map((cidr) => ipaddr.parseCIDR(cidr));

export function isBlockedAddress(ip: string): boolean {
  const literal = ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;
  // Four-part decimal only: WHATWG URL already turns 127.1 or 0x7f.1 into 127.0.0.1.
  if (!ipaddr.IPv6.isValid(literal) && !ipaddr.IPv4.isValidFourPartDecimal(literal)) {
    return true;
  }
  const address = ipaddr.process(literal);
  return (
    address.range() !== "unicast" ||
    BLOCKED_CIDRS.some(
      ([network, prefix]) => network.kind() === address.kind() && address.match(network, prefix),
    )
  );
}
