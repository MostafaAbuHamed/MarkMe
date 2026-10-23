import type { AddressPolicy } from "../../src/ssrf/ip-policy.js";

export const allowAll: AddressPolicy = () => false;
