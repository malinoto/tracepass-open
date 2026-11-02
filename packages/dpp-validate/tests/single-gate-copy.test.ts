import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as pkg from "../src/index.js";
import * as vendor from "../src/vendor/battery-applicability.js";

// The package once exported an older, hand-written copy of the battery gates while its
// verdict engine used the platform-mirrored copy in vendor/, so the two could disagree
// (the old copy had no recycled-content start date). There is one copy now.
describe("one copy of the battery gates", () => {
  it("the public exports are the vendored platform gates", () => {
    expect(pkg.BATTERY_FIELD_GATES).toBe(vendor.BATTERY_FIELD_GATES);
    expect(pkg.batteryFieldApplicability).toBe(vendor.batteryFieldApplicability);
    expect(pkg.GATED_FIELD_KEYS).toBe(vendor.GATED_FIELD_KEYS);
  });
  it("the old copy is gone", () => {
    expect(existsSync(resolve(__dirname, "../src/battery-applicability.ts"))).toBe(false);
  });
});
