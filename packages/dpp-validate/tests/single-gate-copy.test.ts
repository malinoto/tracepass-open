import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Passport } from "@tracepass/dpp-types";
import * as pkg from "../src/index.js";
import * as vendor from "../src/vendor/battery-applicability.js";

// The package once exported an older, hand-written copy of the battery gates while its
// verdict engine used the platform-mirrored copy in vendor/, so the two could disagree
// (the old copy had no recycled-content start date). There is one copy now.
describe("one copy of the battery gates", () => {
  it("the public exports are the vendored platform gates", () => {
    expect(pkg.BATTERY_FIELD_GATES).toBe(vendor.BATTERY_FIELD_GATES);
    expect(pkg.GATED_FIELD_KEYS).toBe(vendor.GATED_FIELD_KEYS);
  });
  it("the deprecated batteryFieldApplicability alias is still exported and agrees with the gates", () => {
    // Read by name: the alias is deprecated on purpose, and this test is about it.
    const alias: unknown = Reflect.get(pkg, "batteryFieldApplicability");
    if (typeof alias !== "function")
      expect.unreachable("batteryFieldApplicability is not exported");
    const passport: Passport = {
      status: "draft",
      fields: { batteryCategory: { value: "EV", status: "approved" } },
    };
    const viaAlias: unknown = Reflect.apply(alias, undefined, [passport, "battery"]);
    expect(viaAlias).toEqual(vendor.categoryFieldApplicability(passport, "battery"));
    expect(vendor.categoryFieldApplicability(passport, "battery")).not.toEqual({});
  });
  it("the old copy is gone", () => {
    expect(existsSync(resolve(__dirname, "../src/battery-applicability.ts"))).toBe(false);
  });
});
