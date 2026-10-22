import { describe, expect, it } from "vitest";

import { LIMITS } from "./limits";
import { folderName, note, tagIds, tagName, tagNames, title } from "./text";

const ID1 = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ID2 = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const TWENTY_ONE_IDS = Array.from({ length: 21 }, () => crypto.randomUUID());
const TWENTY_ONE_TAG_NAMES = Array.from({ length: 21 }, (_, i) => "t" + i);

describe("note", () => {
  it.each([
    ["a".repeat(LIMITS.note), "a".repeat(LIMITS.note)],
    ["  " + "a".repeat(LIMITS.note) + "  ", "a".repeat(LIMITS.note)],
    ["  hi  ", "hi"],
    ["", null],
    ["   ", null],
  ])("%s → %s", (input, expected) => {
    const result = note.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(expected);
    }
  });

  it(`rejects length > ${LIMITS.note}`, () => {
    expect(note.safeParse("a".repeat(LIMITS.note + 1)).success).toBe(false);
  });
});

describe("title", () => {
  it.each([
    ["a".repeat(LIMITS.title), "a".repeat(LIMITS.title)],
    ["  ", null],
  ])("%s → %s", (input, expected) => {
    const result = title.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(expected);
    }
  });

  it(`rejects length > ${LIMITS.title}`, () => {
    expect(title.safeParse("a".repeat(LIMITS.title + 1)).success).toBe(false);
  });
});

describe("folderName", () => {
  it.each([
    ["a".repeat(LIMITS.name), "a".repeat(LIMITS.name)],
    ["  Work ", "Work"],
    ["a  b", "a  b"],
    ["a,b", "a,b"],
  ])("%s → %s", (input, expected) => {
    const result = folderName.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(expected);
    }
  });

  it.each(["", "   "])("rejects %j", (input) => {
    expect(folderName.safeParse(input).success).toBe(false);
  });

  it(`rejects length > ${LIMITS.name}`, () => {
    expect(folderName.safeParse("a".repeat(LIMITS.name + 1)).success).toBe(false);
  });
});

describe("tagName", () => {
  it.each([
    ["  React   Native ", "React Native"],
    ["a\t\nb", "a b"],
    ["a".repeat(LIMITS.name), "a".repeat(LIMITS.name)],
  ])("%s → %s", (input, expected) => {
    const result = tagName.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(expected);
    }
  });

  it.each(["a,b", "   "])("rejects %j", (input) => {
    expect(tagName.safeParse(input).success).toBe(false);
  });

  it(`rejects length > ${LIMITS.name}`, () => {
    expect(tagName.safeParse("a".repeat(LIMITS.name + 1)).success).toBe(false);
  });
});

describe("tagNames", () => {
  it.each([
    [
      ["React", "react", "Vue"],
      ["React", "Vue"],
    ],
    [[" React ", "REACT"], ["React"]],
    [[], []],
    [
      TWENTY_ONE_TAG_NAMES.slice(0, LIMITS.tagsPerItem),
      TWENTY_ONE_TAG_NAMES.slice(0, LIMITS.tagsPerItem),
    ],
    [
      [...TWENTY_ONE_TAG_NAMES.slice(0, LIMITS.tagsPerItem - 1), "React", "react"],
      [...TWENTY_ONE_TAG_NAMES.slice(0, LIMITS.tagsPerItem - 1), "React"],
    ],
  ])("%s → %s", (input, expected) => {
    const result = tagNames.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(expected);
    }
  });

  it(`rejects more than ${LIMITS.tagsPerItem} distinct names`, () => {
    expect(tagNames.safeParse(TWENTY_ONE_TAG_NAMES).success).toBe(false);
  });

  it('rejects ["a", " "]', () => {
    expect(tagNames.safeParse(["a", " "]).success).toBe(false);
  });
});

describe("tagIds", () => {
  it.each([
    [
      [ID1, ID1, ID2],
      [ID1, ID2],
    ],
    [TWENTY_ONE_IDS.slice(0, LIMITS.tagsPerItem), TWENTY_ONE_IDS.slice(0, LIMITS.tagsPerItem)],
  ])("%s → %s", (input, expected) => {
    const result = tagIds.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(expected);
    }
  });

  it(`rejects more than ${LIMITS.tagsPerItem} distinct ids`, () => {
    expect(tagIds.safeParse(TWENTY_ONE_IDS).success).toBe(false);
  });

  it.each(["not-a-uuid", "00000000-0000-0000-0000-000000000000"])("rejects %s", (input) => {
    expect(tagIds.safeParse([input]).success).toBe(false);
  });
});
