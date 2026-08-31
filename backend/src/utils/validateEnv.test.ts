import { describe, expect, it } from "vitest";

import { validateEnv } from "./validateEnv.js";

describe("validateEnv", () => {
  it("accepts a complete configuration", () => {
    expect(() =>
      validateEnv({ API_KEY: "value", SECRET: "value" })
    ).not.toThrow();
  });

  it.each([undefined, ""])("rejects the missing value %s", (value) => {
    expect(() => validateEnv({ API_KEY: value })).toThrow(
      "Brakuje zmiennej środowiskowej: API_KEY"
    );
  });
});
