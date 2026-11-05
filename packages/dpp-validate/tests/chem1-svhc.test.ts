import { describe, it, expect } from "vitest";
import { CONDITIONAL_RULES } from "../src/rules.js";
import type { Passport, Template } from "@tracepass/dpp-types";

/**
 * CHEM-1, warning tier: REACH Art. 33(1) (substance name) and WFD Art. 9(1)(i)
 * (SCIP). Neither duty puts the information in a passport, so a finding is only
 * ever a warning, and it fires only where a field exists that clears it.
 */
const template = { fields: [] } as unknown as Template;
function passport(fields: Record<string, unknown>): Passport {
  return {
    status: "draft",
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, status: "approved" }])),
  } as unknown as Passport;
}
const chem1 = (category: string, fields: Record<string, unknown>) =>
  (CONDITIONAL_RULES[category] ?? [])
    .filter((r) => r.id === "CHEM-1")
    .flatMap((r) => r.run(passport(fields), template, { now: new Date() }));

describe("CHEM-1 · electronics", () => {
  it("SVHC present and no SCIP id → a SCIP warning", () => {
    const f = chem1("electronics", { svhcPresent: true });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "warning", target: "scipNotificationId", regulation: "2008/98/EC", article: "Art. 9(1)(i)" });
  });
  it("a string 'yes' counts as present", () => {
    expect(chem1("electronics", { svhcPresent: "yes" })).toHaveLength(1);
  });
  it("SCIP id recorded, or no SVHC → nothing", () => {
    expect(chem1("electronics", { svhcPresent: true, scipNotificationId: "abc-123" })).toEqual([]);
    expect(chem1("electronics", { svhcPresent: false })).toEqual([]);
    expect(chem1("electronics", {})).toEqual([]);
  });
});

describe("CHEM-1 · steel", () => {
  it("SVHC present and no substance named → a REACH Art. 33(1) warning", () => {
    const f = chem1("steel", { svhcPresent: true, svhcCandidateListSubstances: [] });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "warning", target: "svhcCandidateListSubstances", regulation: "(EC) No 1907/2006", article: "Art. 33(1)" });
  });
  it("a named substance clears it", () => {
    expect(chem1("steel", { svhcPresent: true, svhcCandidateListSubstances: ["Lead"] })).toEqual([]);
  });
});

describe("CHEM-1 · furniture", () => {
  it("substances listed and no SCIP number → a SCIP warning", () => {
    const f = chem1("furniture", { svhcCandidateListSubstances: ["DEHP"] });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "warning", target: "scipNotificationNumber" });
  });
  it("SCIP number recorded, or no substance listed → nothing", () => {
    expect(chem1("furniture", { svhcCandidateListSubstances: ["DEHP"], scipNotificationNumber: "x" })).toEqual([]);
    expect(chem1("furniture", { svhcCandidateListSubstances: [] })).toEqual([]);
  });
});

describe("CHEM-1 · never critical, never on mixtures", () => {
  it("does not run on detergents or paints (mixtures: REACH Art. 31, the SDS)", () => {
    for (const c of ["detergents", "paints-coatings"]) {
      expect((CONDITIONAL_RULES[c] ?? []).some((r) => r.id === "CHEM-1")).toBe(false);
    }
  });
  it("every CHEM-1 finding is a warning", () => {
    const all = [
      ...chem1("electronics", { svhcPresent: true }),
      ...chem1("steel", { svhcPresent: true }),
      ...chem1("furniture", { svhcCandidateListSubstances: ["DEHP"] }),
    ];
    expect(all.length).toBe(3);
    expect(all.every((f) => f.severity === "warning")).toBe(true);
  });
});
