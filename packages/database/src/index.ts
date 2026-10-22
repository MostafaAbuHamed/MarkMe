import type { Database } from "./types.gen";

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from "./types.gen";
export { Constants } from "./types.gen";

export type SearchItemRow = Database["public"]["Functions"]["search_items"]["Returns"][number];
