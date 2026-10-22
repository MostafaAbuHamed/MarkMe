import { z } from "zod";

import { httpUrl } from "./http-url";
import { rowId } from "./ids";
import { note, tagIds, tagNames, title } from "./text";

export const itemCreate = z.object({
  url: httpUrl,
  folderId: rowId.optional(),
  tagNames: tagNames.optional(),
  note: note.optional(),
});

export type ItemCreateInput = z.input<typeof itemCreate>;
export type ItemCreate = z.output<typeof itemCreate>;

export const itemUpdate = z.object({
  title: title.optional(),
  note: note.optional(),
  folderId: rowId.nullable().exactOptional(),
  tagIds: tagIds.optional(),
});

export type ItemUpdateInput = z.input<typeof itemUpdate>;
export type ItemUpdate = z.output<typeof itemUpdate>;
