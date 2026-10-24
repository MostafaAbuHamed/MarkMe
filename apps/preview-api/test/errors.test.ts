import { PREVIEW_ERROR_CODES, type PreviewErrorCode } from "@markme/domain";
import { describe, expect, it } from "vitest";

import { ERROR_STATUS, PreviewFailure } from "../src/errors";

describe("preview API errors", () => {
  it.each<[PreviewErrorCode, number]>([
    ["invalid_url", 400],
    ["unauthorized", 401],
    ["blocked_target", 422],
    ["rate_limited", 429],
    ["fetch_failed", 502],
    ["timeout", 504],
  ])("ERROR_STATUS maps %s to %i", (code, status) => {
    expect(ERROR_STATUS[code]).toBe(status);
  });

  it("ERROR_STATUS keys equal PREVIEW_ERROR_CODES exactly", () => {
    expect(Object.keys(ERROR_STATUS).sort()).toEqual([...PREVIEW_ERROR_CODES].sort());
  });

  it('new PreviewFailure("timeout").code === "timeout"', () => {
    expect(new PreviewFailure("timeout").code).toBe("timeout");
  });
});
