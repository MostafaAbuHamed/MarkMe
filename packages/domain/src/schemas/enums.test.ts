import { Constants, type Enums } from "@markme/database";
import { describe, expect, it, expectTypeOf } from "vitest";
import { z } from "zod";

import { embedProvider, mediaType, previewStatus } from "./enums";

describe("database enums", () => {
  it.each([
    { name: "mediaType", schema: mediaType, values: Constants.public.Enums.media_type },
    { name: "previewStatus", schema: previewStatus, values: Constants.public.Enums.preview_status },
    { name: "embedProvider", schema: embedProvider, values: Constants.public.Enums.embed_provider },
  ])("$name options equal the database Constants", ({ schema, values }) => {
    expect(schema.options).toEqual(values);
  });

  it("infers the generated Enums types", () => {
    expectTypeOf<z.infer<typeof mediaType>>().toEqualTypeOf<Enums<"media_type">>();
    expectTypeOf<z.infer<typeof previewStatus>>().toEqualTypeOf<Enums<"preview_status">>();
    expectTypeOf<z.infer<typeof embedProvider>>().toEqualTypeOf<Enums<"embed_provider">>();
  });

  it.each([
    { schema: mediaType, invalid: "audio" },
    { schema: previewStatus, invalid: "done" },
    { schema: embedProvider, invalid: "vimeo" },
  ])("$invalid is rejected", ({ schema, invalid }) => {
    expect(schema.safeParse(invalid).success).toBe(false);
  });
});
