/**
 * Battery Regulation Annex VII Part A owes the remaining power capability, the
 * remaining round trip efficiency and the ohmic resistance only "where possible"
 * (points 2, 3 and 5). Where they apply, the applicability map must leave them
 * out, so a verdict never turns them into a publish duty; on EV they stay
 * not applicable. Remaining capacity (point 1) still applies.
 */
import { describe, it, expect } from "vitest";
import type { Passport } from "@tracepass/dpp-types";
import { categoryFieldApplicability } from "../src/vendor/battery-applicability.js";

const WHERE_POSSIBLE = [
  "remainingPowerCapability",
  "remainingRoundTripEfficiency",
  "currentInternalResistancePack",
];

function batteryPassport(category: string): Passport {
  return {
    status: "draft",
    fields: { batteryCategory: { value: category, status: "approved" } },
  } as unknown as Passport;
}

const NOW = new Date("2027-03-01");

describe("Annex VII Part A 'where possible' parameters", () => {
  it("are never promoted to a duty on LMT", () => {
    const map = categoryFieldApplicability(batteryPassport("LMT"), "battery", NOW);
    for (const key of WHERE_POSSIBLE) expect(map[key]).toBeUndefined();
    expect(map.remainingCapacity).toBe("applies");
  });

  it("stay not applicable on EV", () => {
    const map = categoryFieldApplicability(batteryPassport("EV"), "battery", NOW);
    for (const key of WHERE_POSSIBLE) expect(map[key]).toBe("not_applicable");
  });
});

// Point 4 names only the "evolution of self-discharging rates"; no provision of
// the Regulation names an initial rate, so it is never a duty, while the
// evolution stays one.
describe("initial self-discharge rate", () => {
  it("is never promoted to a duty on LMT", () => {
    const map = categoryFieldApplicability(batteryPassport("LMT"), "battery", NOW);
    expect(map.initialSelfDischargeRate).toBeUndefined();
    expect(map.evolutionOfSelfDischargeRate).toBe("applies");
  });

  it("stays not applicable on EV", () => {
    const map = categoryFieldApplicability(batteryPassport("EV"), "battery", NOW);
    expect(map.initialSelfDischargeRate).toBe("not_applicable");
  });
});

// A stationary battery energy storage system is rechargeable by its Art. 3
// definition, so the Art. 10(1) performance fields apply once it is confirmed.
describe("stationary storage is rechargeable", () => {
  it("capacity fade applies to a confirmed stationary industrial battery", () => {
    const passport = {
      status: "draft",
      fields: { batteryCategory: { value: "industrial_gt_2kwh", status: "approved" } },
      conditionProfile: { isStationaryBess: { value: true, status: "approved" } },
    } as unknown as Passport;
    expect(categoryFieldApplicability(passport, "battery", NOW).capacityFade).toBe("applies");
  });
});

// Annex XIII 4(a) owes the dynamic values "when the battery is placed on the
// market and when it is subject to changes in its status"; at placing they are
// the passport's Annex IV values, so the dynamic fields are never a duty.
describe("dynamic Annex XIII 4(a) values", () => {
  it("are never promoted on a confirmed rechargeable industrial battery", () => {
    const passport = {
      status: "draft",
      fields: { batteryCategory: { value: "industrial_gt_2kwh", status: "approved" } },
      conditionProfile: { rechargeable: { value: true, status: "approved" } },
    } as unknown as Passport;
    const map = categoryFieldApplicability(passport, "battery", NOW);
    for (const key of ["dynamicRatedCapacity", "dynamicPowerCapability", "dynamicInternalResistance"]) {
      expect(map[key], key).toBeUndefined();
    }
    expect(map.powerFade).toBe("applies");
  });
});
