import { describe, it, expect } from "vitest";
import type { Passport, Template } from "@tracepass/dpp-types";
import { ruleById } from "./helpers.js";

/**
 * BAT-CONS: battery values that are each plausible but contradict one another.
 * The checks are a byte-identical platform mirror (`vendor/battery-consistency.ts`),
 * tested in depth on the platform; these cases pin the rule's wiring here:
 * registration, the finding shape, the identifier precedence and "warning only".
 */
const BAT_CONS = ruleById("battery", "BAT-CONS");
const GTIN = "09506000134352";
const SERIAL = "UNIT-1";

const template = {
  category: "battery",
  fields: [
    {
      key: "batteryEnergyTotal",
      label: { en: "Battery Energy Total" },
      regulationRef: { instrument: "32023R1542", provision: "Annex XIII 1(g)" },
    },
  ],
} as unknown as Template;

/** A consistent battery: 355.2 V × 170 Ah = 60.38 kWh. */
const GOOD = {
  nominalVoltage: 355.2,
  minimumVoltage: 288,
  maximumVoltage: 403.2,
  ratedCapacity: 170,
  batteryEnergyTotal: 60.38,
  batteryWeight: 386,
  energyDensity: 156,
  batteryUniqueIdentifier: `https://id.example.eu/01/${GTIN}/21/${SERIAL}`,
};

function passport(fields: Record<string, unknown>, extra: Record<string, unknown> = {}): Passport {
  return {
    status: "draft",
    identifier: { scheme: "gs1", gtin: GTIN, serialNumber: SERIAL },
    ...extra,
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, { value: v, status: "approved" }]),
    ),
  } as unknown as Passport;
}

describe("BAT-CONS", () => {
  it("raises nothing on a consistent battery", () => {
    expect(BAT_CONS.run(passport(GOOD), template)).toEqual([]);
  });

  it("reports a Wh value entered as kWh once, as an inconsistent_values warning", () => {
    const findings = BAT_CONS.run(passport({ ...GOOD, batteryEnergyTotal: 60380 }), template);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: "inconsistent_values",
      severity: "warning",
      ruleId: "BAT-CONS",
      target: "batteryEnergyTotal",
      article: "Annex XIII 1(g)",
    });
  });

  it("flags an impossible zero and a voltage out of order, never as critical", () => {
    const findings = BAT_CONS.run(
      passport({ ...GOOD, initialInternalResistanceCell: 0, minimumVoltage: 400 }),
      template,
    );
    expect(findings.map((f) => f.target)).toEqual(
      expect.arrayContaining(["initialInternalResistanceCell", "nominalVoltage"]),
    );
    expect(findings.every((f) => f.severity === "warning")).toBe(true);
  });

  it("flags a unique identifier that names another unit", () => {
    const other = `https://id.example.eu/01/${GTIN}/21/UNIT-2`;
    const findings = BAT_CONS.run(passport({ ...GOOD, batteryUniqueIdentifier: other }), template);
    expect(findings.map((f) => f.target)).toEqual(["batteryUniqueIdentifier"]);
  });

  it("reads the deprecated gs1 block when there is no identifier", () => {
    const legacy = passport(
      { ...GOOD, batteryUniqueIdentifier: `https://id.example.eu/01/${GTIN}/21/UNIT-2` },
      { identifier: undefined, gs1: { gtin: GTIN, serialNumber: SERIAL } },
    );
    expect(BAT_CONS.run(legacy, template).map((f) => f.target)).toEqual([
      "batteryUniqueIdentifier",
    ]);
  });

  it("skips the identifier check for a non-GS1 identifier", () => {
    const did = passport(
      { ...GOOD, batteryUniqueIdentifier: `https://id.example.eu/01/${GTIN}/21/UNIT-2` },
      { identifier: { scheme: "did", did: "did:web:example.eu:unit-1" } },
    );
    expect(BAT_CONS.run(did, template)).toEqual([]);
  });
});
