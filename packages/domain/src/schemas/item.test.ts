import { describe, expect, expectTypeOf, it } from "vitest";

import { urlErrorCode } from "./http-url";
import { itemCreate, itemUpdate, type ItemUpdate } from "./item";

const ID1 = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ID2 = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

describe("itemCreate", () => {
  it.each([
    [
      { url: "https://a.com/x?utm_source=y" },
      {
        url: {
          url: "https://a.com/x?utm_source=y",
          normalizedUrl: "https://a.com/x",
        },
      },
    ],
  ])("%o → %o", (input, expected) => {
    const result = itemCreate.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(expected);
    }
  });

  it("applies folderId, tagNames and note", () => {
    const result = itemCreate.safeParse({
      url: "https://a.com",
      folderId: ID1,
      tagNames: ["A", "a"],
      note: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        url: { url: "https://a.com/", normalizedUrl: "https://a.com" },
        folderId: ID1,
        tagNames: ["A"],
        note: null,
      });
    }
  });

  it("rejects credentials in url", () => {
    const result = itemCreate.safeParse({ url: "https://u:p@a.com" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(urlErrorCode(result.error)).toBe("has_credentials");
    }
  });

  it("rejects invalid folderId", () => {
    expect(itemCreate.safeParse({ url: "https://a.com", folderId: "x" }).success).toBe(false);
  });

  it("strips unknown keys", () => {
    const result = itemCreate.safeParse({
      url: "https://a.com",
      userId: ID2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        url: { url: "https://a.com/", normalizedUrl: "https://a.com" },
      });
      expect(result.data).not.toHaveProperty("userId");
    }
  });

  it("requires url", () => {
    expect(itemCreate.safeParse({}).success).toBe(false);
  });
});

describe("itemUpdate", () => {
  it.each([
    [{} as const, {}],
    [{ folderId: null }, { folderId: null }],
    [{ title: "  " }, { title: null }],
    [{ note: "x" }, { note: "x" }],
    [{ tagIds: [ID1, ID1] }, { tagIds: [ID1] }],
    [{ userId: ID2 }, {}],
    [{ url: "https://a.com" }, {}],
  ])("%o → %o", (input, expected) => {
    const result = itemUpdate.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(expected);
    }
  });

  it("output type has optional nullable folderId", () => {
    expectTypeOf<Pick<ItemUpdate, "folderId">>().toEqualTypeOf<{ folderId?: string | null }>();
  });
});
