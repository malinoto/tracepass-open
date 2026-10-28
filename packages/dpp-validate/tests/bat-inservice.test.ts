/**
 * Tests for the BAT-INSERVICE rule in dpp-validate (open package mirror of the
 * platform rule). Covers the same cases as the platform's
 * tests/compliance/battery-inservice.test.ts, scoped to the rule behaviour.
 *
 * The `temporal: true` gate + BAT-INSERVICE warning are the mirrored
 * behaviours this test locks in.
 */

import { describe, it, expect } from "vitest";
import type { Passport, PassportField, Template, TemplateField } from "@tracepass/dpp-types";
import { CONDITIONAL_RULES } from "../src/rules.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function field(value: unknown, status: "approved" | "pending_review" = "approved"): PassportField {
  return { value, status, source: "manual" } as PassportField;
}

function makePassport(
  category: string,
  overrides: Partial<Passport> = {},
): Passport {
  return {
    status: "published",
    fields: {
      batteryCategory: field(category),
    },
    ...overrides,
  } as unknown as Passport;
}

function makeTemplate(): Template {
  return {
    category: "battery",
    fields: [
      { key: "batteryCategory", label: { en: "Battery Category" } },
      { key: "numberOfFullEquivalentChargingCycles", label: { en: "Full Equivalent Charging Cycles" } },
      { key: "numberOfChargingEvents", label: { en: "Charging Events" } },
      { key: "negativeEvents", label: { en: "Negative Events" } },
      { key: "temperatureConditionsHistorical", label: { en: "Temperature History" } },
      { key: "currentStateOfCharge", label: { en: "State of Charge" } },
    ] as unknown as TemplateField[],
  } as unknown as Template;
}

const BAT_INSERVICE = CONDITIONAL_RULES["battery"]?.find((r) => r.id === "BAT-INSERVICE");

// ── Registration ──────────────────────────────────────────────────────────

describe("BAT-INSERVICE registration", () => {
  it("is registered in battery CONDITIONAL_RULES", () => {
    expect(BAT_INSERVICE).toBeDefined();
    expect(BAT_INSERVICE?.id).toBe("BAT-INSERVICE");
  });
});

// ── Pre-service (no findings) ──────────────────────────────────────────────

describe("BAT-INSERVICE — pre-service: no findings", () => {
  it("returns no findings when dynamicDataAsOf is null (EV)", () => {
    const passport = makePassport("EV", { dynamicDataAsOf: null });
    expect(BAT_INSERVICE!.run(passport, makeTemplate())).toHaveLength(0);
  });

  it("returns no findings when dynamicDataAsOf is undefined (LMT)", () => {
    const passport = makePassport("LMT");
    expect(BAT_INSERVICE!.run(passport, makeTemplate())).toHaveLength(0);
  });

  it("returns no findings when dateOfServiceEntry is empty string (industrial)", () => {
    const passport = makePassport("industrial_gt_2kwh", {
      fields: {
        batteryCategory: field("industrial_gt_2kwh"),
        dateOfServiceEntry: field(""),
      },
    });
    expect(BAT_INSERVICE!.run(passport, makeTemplate())).toHaveLength(0);
  });
});

// ── In-service via dynamicDataAsOf ────────────────────────────────────────

describe("BAT-INSERVICE — in-service via dynamicDataAsOf", () => {
  it("warns on all 5 empty 4(d) fields for EV", () => {
    const passport = makePassport("EV", { dynamicDataAsOf: new Date() });
    const findings = BAT_INSERVICE!.run(passport, makeTemplate());
    expect(findings.length).toBe(5);
    findings.forEach((f) => {
      expect(f.severity).toBe("warning");
      expect(f.ruleId).toBe("BAT-INSERVICE");
      expect(f.article).toBe("Annex XIII 4(d)");
    });
  });

  it("warns for LMT", () => {
    const passport = makePassport("LMT", { dynamicDataAsOf: new Date() });
    const findings = BAT_INSERVICE!.run(passport, makeTemplate());
    expect(findings.length).toBe(5);
  });

  it("warns for industrial_gt_2kwh", () => {
    const passport = makePassport("industrial_gt_2kwh", { dynamicDataAsOf: new Date() });
    const findings = BAT_INSERVICE!.run(passport, makeTemplate());
    expect(findings.length).toBe(5);
  });

  it("no finding for a 4(d) field that is already filled", () => {
    const passport = makePassport("EV", {
      dynamicDataAsOf: new Date(),
      fields: {
        batteryCategory: field("EV"),
        numberOfChargingEvents: field(500),
        numberOfFullEquivalentChargingCycles: field(300),
        negativeEvents: field([]),
        temperatureConditionsHistorical: field([]),
        currentStateOfCharge: field(85),
      },
    });
    expect(BAT_INSERVICE!.run(passport, makeTemplate())).toHaveLength(0);
  });
});

// ── In-service via dateOfServiceEntry ────────────────────────────────────

describe("BAT-INSERVICE — in-service via dateOfServiceEntry", () => {
  it("warns when dateOfServiceEntry has a value (LMT)", () => {
    const passport = makePassport("LMT", {
      fields: {
        batteryCategory: field("LMT"),
        dateOfServiceEntry: field("2026-01-15"),
      },
    });
    const findings = BAT_INSERVICE!.run(passport, makeTemplate());
    expect(findings.length).toBe(5);
    findings.forEach((f) => expect(f.severity).toBe("warning"));
  });
});

// ── Out-of-scope categories (no findings) ────────────────────────────────

describe("BAT-INSERVICE — out-of-scope categories", () => {
  it("no findings for portable", () => {
    const passport = makePassport("portable", { dynamicDataAsOf: new Date() });
    expect(BAT_INSERVICE!.run(passport, makeTemplate())).toHaveLength(0);
  });

  it("no findings for SLI", () => {
    const passport = makePassport("SLI", { dynamicDataAsOf: new Date() });
    expect(BAT_INSERVICE!.run(passport, makeTemplate())).toHaveLength(0);
  });

  it("no findings for industrial_lte_2kwh", () => {
    const passport = makePassport("industrial_lte_2kwh", { dynamicDataAsOf: new Date() });
    expect(BAT_INSERVICE!.run(passport, makeTemplate())).toHaveLength(0);
  });

  it("no findings when category is absent (safety)", () => {
    const passport = {
      status: "published",
      fields: {},
      dynamicDataAsOf: new Date(),
    } as unknown as Passport;
    expect(BAT_INSERVICE!.run(passport, makeTemplate())).toHaveLength(0);
  });
});
