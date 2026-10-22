import { z } from "zod";

/** Row ids come from Postgres gen_random_uuid(), which always makes v4 uuids. */
export const rowId = z.uuid({ version: "v4" });
