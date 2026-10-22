import { describe, expect, it } from "vitest";

import { LIMITS } from "./limits";

describe("LIMITS", () => {
  it("matches the domain validation caps", () => {
    expect(LIMITS).toEqual({
      title: 300,
      description: 1000,
      siteName: 200,
      note: 1000,
      url: 2048,
      name: 100,
      tagsPerItem: 20,
    });
    expect(Object.isFrozen(LIMITS)).toBe(true);
  });

  // M1 ceilings: packages/database/supabase/migrations/20261021123948_item_rules.sql,
  // packages/database/supabase/migrations/20261021122915_name_rules.sql
  it.each([
    ["title", LIMITS.title, 500],
    ["description", LIMITS.description, 2000],
    ["siteName", LIMITS.siteName, 200],
    ["note", LIMITS.note, 1000],
    ["url", LIMITS.url, 2048],
    ["name", LIMITS.name, 100],
  ] as const)("%s (%i) is at most the M1 ceiling (%i)", (_field, value, ceiling) => {
    expect(value).toBeLessThanOrEqual(ceiling);
  });
});
