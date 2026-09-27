import { describe, it, expect } from "vitest";
import {
  batteryFieldApplicability,
  GATED_FIELD_KEYS,
} from "../src/battery-applicability.js";
import type { Passport, PassportField, BatteryProfile } from "@tracepass/dpp-types";

// ── Tiny builders ─────────────────────────────────────────────────
function field(value: unknown): PassportField {
  return { value, status: "approved" } as PassportField;
}

type FlagInput = boolean | { value: boolean; status: "approved" | "pending_review" };
function buildProfile(p?: Partial<Record<keyof BatteryProfile, FlagInput>>): BatteryProfile | undefined {
  if (!p) return undefined;
  const out: BatteryProfile = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    const flag = typeof v === "boolean" ? { value: v, status: "approved" as const } : v;
    (out as Record<string, unknown>)[k] = flag;
  }
  return out;
}

function batteryPassport(
  category: string | undefined,
  profile?: Partial<Record<keyof BatteryProfile, FlagInput>>,
): Passport {
  const built = buildProfile(profile);
  return {
    status: "draft",
    fields: {
      ...(category !== undefined ? { batteryCategory: field(category) } : {}),
    },
    ...(built ? { batteryProfile: built } : {}),
  } as unknown as Passport;
}

function gateResult(category: string | undefined, key: string, profile?: Partial<Record<keyof BatteryProfile, FlagInput>>) {
  const map = batteryFieldApplicability(batteryPassport(category, profile), "battery");
  return map[key] ?? "applies"; // ungated fields not in the map
}

// ── stateOfHealth — Art. 14(1) subject + BMS ─────────────────────
describe("stateOfHealth gate (dpp-validate)", () => {
  it("applies on EV with BMS", () => {
    expect(gateResult("EV", "stateOfHealth", { hasBMS: true })).toBe("applies");
  });

  it("not_applicable on EV without BMS", () => {
    expect(gateResult("EV", "stateOfHealth", { hasBMS: false })).toBe("not_applicable");
  });

  it("applies on LMT with BMS", () => {
    expect(gateResult("LMT", "stateOfHealth", { hasBMS: true })).toBe("applies");
  });

  it("not_applicable on industrial non-SBESS (Art. 14 does not apply)", () => {
    expect(gateResult("industrial_gt_2kwh", "stateOfHealth", { hasBMS: true, isStationaryBess: false })).toBe("not_applicable");
  });

  it("applies on industrial SBESS with BMS", () => {
    expect(gateResult("industrial_gt_2kwh", "stateOfHealth", { hasBMS: true, isStationaryBess: true })).toBe("applies");
  });

  it("unknown when industrial SBESS unset", () => {
    expect(gateResult("industrial_gt_2kwh", "stateOfHealth", { hasBMS: true })).toBe("unknown");
  });

  it("unknown when industrial SBESS pending_review", () => {
    expect(gateResult("industrial_gt_2kwh", "stateOfHealth", {
      hasBMS: true,
      isStationaryBess: { value: true, status: "pending_review" },
    })).toBe("unknown");
  });

  it("not_applicable on portable", () => {
    expect(gateResult("portable", "stateOfHealth", { hasBMS: true })).toBe("not_applicable");
  });
});

// ── Part A cluster — sbessOrLmt ───────────────────────────────────
describe("Part A cluster gate (Annex VII Part A)", () => {
  const PART_A_KEYS = [
    "remainingCapacity",
    "remainingPowerCapability",
    "remainingRoundTripEfficiency",
    "evolutionOfSelfDischargeRate",
    "currentInternalResistancePack",
    "initialSelfDischargeRate",
  ] as const;

  it("not_applicable on EV (uses SOCE instead)", () => {
    for (const key of PART_A_KEYS) {
      expect(gateResult("EV", key)).toBe("not_applicable");
    }
  });

  it("applies on LMT", () => {
    for (const key of PART_A_KEYS) {
      expect(gateResult("LMT", key)).toBe("applies");
    }
  });

  it("applies on industrial SBESS", () => {
    for (const key of PART_A_KEYS) {
      expect(gateResult("industrial_gt_2kwh", key, { isStationaryBess: true })).toBe("applies");
    }
  });

  it("not_applicable on non-SBESS industrial", () => {
    for (const key of PART_A_KEYS) {
      expect(gateResult("industrial_gt_2kwh", key, { isStationaryBess: false })).toBe("not_applicable");
    }
  });

  it("unknown when industrial SBESS unset", () => {
    for (const key of PART_A_KEYS) {
      expect(gateResult("industrial_gt_2kwh", key)).toBe("unknown");
    }
  });

  it("unknown when category absent", () => {
    for (const key of PART_A_KEYS) {
      expect(gateResult(undefined, key)).toBe("unknown");
    }
  });

  it("not_applicable on portable / SLI / industrial_lte_2kwh", () => {
    for (const key of PART_A_KEYS) {
      expect(gateResult("portable", key)).toBe("not_applicable");
      expect(gateResult("SLI", key)).toBe("not_applicable");
      expect(gateResult("industrial_lte_2kwh", key)).toBe("not_applicable");
    }
  });
});

// ── Part B cluster — sbessOrLmt ───────────────────────────────────
describe("Part B cluster gate (Annex VII Part B — expected lifetime)", () => {
  const PART_B_KEYS = ["capacityThroughput", "energyThroughput", "dateOfServiceEntry"] as const;

  it("not_applicable on EV", () => {
    for (const key of PART_B_KEYS) {
      expect(gateResult("EV", key)).toBe("not_applicable");
    }
  });

  it("applies on LMT", () => {
    for (const key of PART_B_KEYS) {
      expect(gateResult("LMT", key)).toBe("applies");
    }
  });

  it("applies on industrial SBESS", () => {
    for (const key of PART_B_KEYS) {
      expect(gateResult("industrial_gt_2kwh", key, { isStationaryBess: true })).toBe("applies");
    }
  });

  it("not_applicable on non-SBESS industrial", () => {
    for (const key of PART_B_KEYS) {
      expect(gateResult("industrial_gt_2kwh", key, { isStationaryBess: false })).toBe("not_applicable");
    }
  });

  it("unknown when SBESS unset for industrial", () => {
    for (const key of PART_B_KEYS) {
      expect(gateResult("industrial_gt_2kwh", key)).toBe("unknown");
    }
  });

  it("unknown when category absent", () => {
    for (const key of PART_B_KEYS) {
      expect(gateResult(undefined, key)).toBe("unknown");
    }
  });
});

// ── GATED_FIELD_KEYS includes all new keys ────────────────────────
it("GATED_FIELD_KEYS includes Part A + Part B + SOCE keys", () => {
  for (const key of [
    "stateOfCertifiedEnergy",
    "remainingCapacity",
    "remainingRoundTripEfficiency",
    "initialSelfDischargeRate",
    "capacityThroughput",
    "energyThroughput",
    "dateOfServiceEntry",
  ]) {
    expect(GATED_FIELD_KEYS.has(key), `GATED_FIELD_KEYS missing: ${key}`).toBe(true);
  }
});

// ── safety: pending_review never hard-gates ────────────────────────
it("pending_review isStationaryBess never hard-gates the Part A cluster", () => {
  const map = batteryFieldApplicability(
    batteryPassport("industrial_gt_2kwh", {
      isStationaryBess: { value: false, status: "pending_review" },
    }),
    "battery",
  );
  // pending_review resolves to unknown, never to not_applicable
  expect(map["remainingCapacity"]).toBe("unknown");
  expect(map["capacityThroughput"]).toBe("unknown");
});
