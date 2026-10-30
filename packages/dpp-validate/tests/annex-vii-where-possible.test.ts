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
