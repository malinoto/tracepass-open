import { describe, it, expect } from "vitest";
import { analyzeComposition } from "../src/vendor/composition-detail.js";
import { ruleById } from "./helpers.js";
import type { Passport, Template } from "@tracepass/dpp-types";

/**
 * Annex XIII 2(a) / guidance DP 45: detailed composition. The law asks for the
 * materials, not their quantities; Commission Battery Passport FAQ §7.7: a
 * general indication of chemistry such as "LFP" is not enough. These cases pin
 * both halves: a chemistry label is critical (in-scope battery, from 18 Feb 2027),
 * named materials without shares pass.
 */
const BAT_VAL = ruleById("battery", "BAT-VAL");
const template = { category: "battery", fields: [] } as unknown as Template;
function passport(fields: Record<string, unknown>): Passport {
  return {
    status: "draft",
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, { value: v, status: "approved" }]),
    ),
  } as unknown as Passport;
}
// Annex XIII binds where Art. 77(1) requires a passport, from 18 Feb 2027: the
// default case is an in-scope EV battery evaluated after that day.
const AFTER = new Date("2027-03-01T00:00:00Z");
const BEFORE = new Date("2026-11-05T00:00:00Z");
const findings = (
  fields: Record<string, unknown>,
  now: Date = AFTER,
  category: string | null = "EV",
) =>
  BAT_VAL.run(
    passport(category === null ? fields : { batteryCategory: category, ...fields }),
    template,
    { now },
  ).filter((f) =>
    ["cathodeActiveMaterials", "anodeActiveMaterials", "electrolyteComposition"].includes(
      f.target ?? "",
    ),
  );

// The shape the published sample passports carry (scripts/seed-sample-passport.ts).
const SAMPLE_CATHODE = [
  {
    substance: "Lithium Nickel Cobalt Aluminum Oxide",
    casNumber: "193214-24-3",
    massPercent: 32.5,
  },
  { substance: "Nickel", casNumber: "7440-02-0", massPercent: 24.5 },
  { substance: "Cobalt", casNumber: "7440-48-4", massPercent: 4.8 },
  { substance: "Aluminum", casNumber: "7429-90-5", massPercent: 1.1 },
];

describe("analyzeComposition", () => {
  it("nothing to judge for an empty or non-list value", () => {
    expect(analyzeComposition(undefined)).toBeUndefined();
    expect(analyzeComposition([])).toBeUndefined();
    expect(analyzeComposition("LFP")).toBeUndefined();
  });

  it("a bare chemistry label names no material", () => {
    expect(analyzeComposition(["LFP"])).toMatchObject({
      entries: 1,
      materials: 0,
      chemistryLabels: 1,
    });
    expect(analyzeComposition([{ name: "NMC811" }])).toMatchObject({
      materials: 0,
      chemistryLabels: 1,
    });
    expect(analyzeComposition([{ name: "Li-ion" }])).toMatchObject({
      materials: 0,
      chemistryLabels: 1,
    });
  });

  it("accepts every key alias in use", () => {
    expect(analyzeComposition(SAMPLE_CATHODE)).toMatchObject({
      entries: 4,
      materials: 4,
      withShare: 4,
    });
    expect(analyzeComposition([{ name: "Graphite", weightPercent: 18.2 }])?.materials).toBe(1);
    // The canonical shape (battery.json entryProperties).
    expect(
      analyzeComposition([{ substanceName: "Graphite", casNumber: "7782-42-5", massPercent: 18.2 }])
        ?.withShare,
    ).toBe(1);
    expect(analyzeComposition([{ material: "Graphite", sharePercent: "18.2" }])?.withShare).toBe(1);
    expect(
      analyzeComposition([{ substanceName: "LiPF6", concentrationPercent: 1.5 }])?.withShare,
    ).toBe(1);
  });

  it("names materials without shares (shares are optional)", () => {
    expect(
      analyzeComposition([{ substanceName: "Graphite", casNumber: "7782-42-5" }, "Silicon"]),
    ).toMatchObject({ materials: 2, withShare: 0 });
  });

  it("counts shares outside (0, 100] and sums the valid ones", () => {
    expect(
      analyzeComposition([
        { name: "A", weightPercent: 0 },
        { name: "B", weightPercent: 140 },
        { name: "C", weightPercent: 60 },
      ]),
    ).toMatchObject({ materials: 3, withShare: 1, outOfRange: 2, shareSum: 60 });
  });
});

describe("BAT-VAL: detailed composition", () => {
  it('["LFP"] is critical', () => {
    const f = findings({ cathodeActiveMaterials: ["LFP"] });
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe("critical");
    expect(f[0]?.article).toBe("Annex XIII 2(a)");
  });

  it("a chemistry label in object form is critical", () => {
    const f = findings({ cathodeActiveMaterials: [{ substanceName: "NMC811" }] });
    expect(f.map((x) => x.severity)).toEqual(["critical"]);
  });

  it("before 18 Feb 2027 a chemistry label is a warning, not critical (Art. 77(1) date gate)", () => {
    const f = findings({ cathodeActiveMaterials: ["LFP"] }, BEFORE);
    expect(f.map((x) => x.severity)).toEqual(["warning"]);
  });

  it("a portable or SLI battery gets no composition finding: Annex XIII does not apply", () => {
    expect(findings({ cathodeActiveMaterials: ["LFP"] }, AFTER, "portable")).toEqual([]);
    expect(findings({ cathodeActiveMaterials: ["LFP"] }, AFTER, "SLI")).toEqual([]);
  });

  it("with the battery category unknown, a chemistry label is a warning", () => {
    const f = findings({ cathodeActiveMaterials: ["LFP"] }, AFTER, null);
    expect(f.map((x) => x.severity)).toEqual(["warning"]);
  });

  it("named materials without any share pass: Annex XIII 2(a) asks for materials, not quantities", () => {
    expect(findings({ anodeActiveMaterials: [{ name: "Graphite" }, { name: "Silicon" }] })).toEqual(
      [],
    );
    expect(
      findings({
        electrolyteComposition: [
          { substanceName: "LiPF6", casNumber: "21324-40-3" },
          "ethylene carbonate",
        ],
      }),
    ).toEqual([]);
  });

  it("the sample passports' composition passes", () => {
    expect(findings({ cathodeActiveMaterials: SAMPLE_CATHODE })).toEqual([]);
  });

  it("a mix of entries with and without shares passes", () => {
    expect(
      findings({
        electrolyteComposition: [{ name: "LiPF6", weightPercent: 1.5 }, "ethylene carbonate"],
      }),
    ).toEqual([]);
  });

  it("a share outside 0–100 % is a warning", () => {
    const f = findings({
      cathodeActiveMaterials: [{ name: "A", weightPercent: 140 }, { name: "B" }],
    });
    expect(f.map((x) => x.severity)).toEqual(["warning"]);
  });

  it("shares adding up to more than 100 % is a warning", () => {
    const f = findings({
      cathodeActiveMaterials: [
        { name: "A", weightPercent: 70 },
        { name: "B", weightPercent: 40 },
      ],
    });
    expect(f.some((x) => x.severity === "warning" && x.why.includes("more than 100"))).toBe(true);
  });

  it("rounding within half a point is tolerated", () => {
    expect(
      findings({
        cathodeActiveMaterials: [
          { name: "A", weightPercent: 60.3 },
          { name: "B", weightPercent: 40.1 },
        ],
      }),
    ).toEqual([]);
  });

  it("an absent field produces nothing (the required-field check owns absence)", () => {
    expect(findings({})).toEqual([]);
  });
});
