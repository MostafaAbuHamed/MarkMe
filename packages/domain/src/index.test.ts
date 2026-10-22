import { expect, test, vi } from "vitest";

import { DOMAIN_PACKAGE } from "./index";

vi.mock("@supabase/supabase-js", () => {
  throw new Error("supabase-js loaded by the rules entry");
});

test("DOMAIN_PACKAGE is @markme/domain", () => {
  expect(DOMAIN_PACKAGE).toBe("@markme/domain");
});

test("rules entry does not load supabase-js", async () => {
  const entry = await import("./index");
  expect(entry.normalizeUrl).toBeTypeOf("function");
});
