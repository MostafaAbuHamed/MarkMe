import { expect, test } from "vitest";

import { DOMAIN_PACKAGE } from "./index";

test("DOMAIN_PACKAGE is @markme/domain", () => {
  expect(DOMAIN_PACKAGE).toBe("@markme/domain");
});
