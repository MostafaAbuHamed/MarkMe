import { describe, expect, it } from "vitest";

import { isBlockedAddress } from "../src/ssrf/ip-policy.js";

describe("isBlockedAddress blocked", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "[::1]",
    "fc00::1",
    "fd00:ec2::254",
    "fe80::1",
    "ff02::1",
    "64:ff9b::7f00:1",
    "64:ff9b::808:808",
    "64:ff9b:1::1",
    "2001::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "2002:808:808::",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "localhost",
    "",
    "example.com",
    "1.2.3",
    "::g",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });
});

describe("encoded IPv4 literals", () => {
  it.each(["http://2130706433", "http://0177.0.0.1", "http://0x7f.1", "http://127.1"])(
    "blocks URL hostname for %s",
    (u) => {
      expect(new URL(u).hostname).toBe("127.0.0.1");
      expect(isBlockedAddress(new URL(u).hostname)).toBe(true);
    },
  );
});

describe("isBlockedAddress allowed", () => {
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.215.14",
    "2606:4700::1111",
    "[2606:4700::1111]",
    "::ffff:8.8.8.8",
  ])("allows %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});
