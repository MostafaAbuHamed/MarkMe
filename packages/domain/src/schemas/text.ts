import { z } from "zod";

import { rowId } from "./ids";
import { LIMITS } from "./limits";

function dedupeBy<T>(list: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of list) {
    const itemKey = key(item);
    if (seen.has(itemKey)) {
      continue;
    }
    seen.add(itemKey);
    result.push(item);
  }
  return result;
}

export const note = z
  .string()
  .trim()
  .max(LIMITS.note)
  .transform((value) => (value === "" ? null : value));

export const title = z
  .string()
  .trim()
  .max(LIMITS.title)
  .transform((value) => (value === "" ? null : value));

export const folderName = z.string().trim().min(1).max(LIMITS.name);

export const tagName = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1)
      .max(LIMITS.name)
      .refine((value) => !value.includes(",")),
  );

export const tagNames = z
  .array(tagName)
  .transform((list) => dedupeBy(list, (name) => name.toLowerCase()))
  .pipe(z.array(z.string()).max(LIMITS.tagsPerItem));

export const tagIds = z
  .array(rowId)
  .transform((list) => dedupeBy(list, (id) => id))
  .pipe(z.array(z.string()).max(LIMITS.tagsPerItem));
