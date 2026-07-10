import { describe, it, expect } from "vitest";
import { evaluateCompliance } from "../src/verdict.js";
import { isEuEeaCountry } from "../src/eu-countries.js";
import type { Passport, Template, TemplateField, PassportField, Party } from "@tracepass/dpp-types";

// ── Tiny builders ─────────────────────────────────────────────────
// Minimal shapes cast to the real types — matches the repo's test style
// (cast partials, don't construct full Mongo docs).

function field(value: unknown, status: PassportField["status"] = "approved"): PassportField {
  return { value, status } as PassportField;
}

function party(country?: string): Party {
  return { legalName: "Acme", country, audit: [] } as Party;
}

function tf(key: string, over: Partial<TemplateField> = {}): TemplateField {
  return {
    key,
    label: { en: key },
    dataType: "string",
    validation: { required: false },
    ...over,
  } as TemplateField;
}

function template(fields: TemplateField[], regulationNumber = "(EU) test"): Template {
  return {
    category: "x",
    fields,
    regulation: { number: regulationNumber, name: "Test", effectiveDate: new Date() },
  } as unknown as Template;
}

function passport(over: Partial<Passport> = {}): Passport {
  return {
    status: "draft",
    fields: {},
    parties: {},
    ...over,
  } as unknown as Passport;
}

// ── EU/EEA helper ─────────────────────────────────────────────────
describe("isEuEeaCountry", () => {
  it("accepts EU members (any case)", () => {
    expect(isEuEeaCountry("DE")).toBe(true);
    expect(isEuEeaCountry("bg")).toBe(true);
    expect(isEuEeaCountry(" FR ")).toBe(true);
  });
  it("accepts EEA non-EU states", () => {
    expect(isEuEeaCountry("NO")).toBe(true);
    expect(isEuEeaCountry("IS")).toBe(true);
  });
  it("rejects third countries, Switzerland, and empties", () => {
    expect(isEuEeaCountry("CN")).toBe(false);
    expect(isEuEeaCountry("CH")).toBe(false); // EEA-excluded by design
    expect(isEuEeaCountry(undefined)).toBe(false);
    expect(isEuEeaCountry("")).toBe(false);
  });
});

// ── Verdict composition ───────────────────────────────────────────
describe("evaluateCompliance — static tier", () => {
  it("compliant when required fields present+approved and required party set", () => {
    // furniture requires a manufacturer party (required-roles.ts) — set it,
    // and CC-1 is satisfied directly by an EU manufacturer.
    const t = template([tf("a", { validation: { required: true } })]);
    const p = passport({ fields: { a: field("x") }, parties: { manufacturer: party("DE") } });
    const r = evaluateCompliance(p, t, "furniture");
    expect(r.verdict).toBe("compliant");
    expect(r.conditionalCoverage).toBe("static-only"); // furniture has no conditional rules
  });

  it("incomplete on a missing required field, citing the field's regulationRef", () => {
    const t = template(
      [tf("a", { validation: { required: true }, regulationRef: { article: "Art. 9" } })],
      "(EU) 2024/1781",
    );
    const r = evaluateCompliance(passport(), t, "furniture");
    expect(r.verdict).toBe("incomplete");
    expect(r.critical[0]).toMatchObject({ type: "missing_field", target: "a", article: "Art. 9" });
  });

  it("incomplete on an unapproved required field", () => {
    const t = template([tf("a", { validation: { required: true } })]);
    const p = passport({ fields: { a: field("x", "pending_review") } });
    const r = evaluateCompliance(p, t, "furniture");
    expect(r.verdict).toBe("incomplete");
    expect(r.critical[0].type).toBe("unapproved_field");
  });

  it("incomplete on a missing required party (battery needs manufacturer/recycler/PRO)", () => {
    const t = template([]);
    const r = evaluateCompliance(passport(), t, "battery");
    const roles = r.critical.filter((f) => f.type === "missing_party").map((f) => f.target);
    expect(roles).toEqual(expect.arrayContaining(["manufacturer", "recycler", "producerResponsibilityOrg"]));
  });

  it("warns on a value that violates an enum, without blocking", () => {
    const t = template([
      tf("e", {
        dataType: "enum",
        enumOptions: [{ value: "ok", label: { en: "ok" } }],
      }),
    ]);
    const p = passport({ fields: { e: field("nope") }, parties: { manufacturer: party("DE") } });
    const r = evaluateCompliance(p, t, "furniture");
    expect(r.verdict).toBe("compliant_with_warnings");
    expect(r.warnings.some((w) => w.type === "invalid_format")).toBe(true);
  });

  it("accepts every option of a real multi_enum (enumOptions are {value,label} objects)", () => {
    // `TemplateField.enumOptions` is `Array<{value, label}>`. A template that
    // stored bare strings instead would make `o.value` undefined, collapsing
    // the allowed set to {undefined} — every real value would then fail enum
    // validation. chemicals.hazardPictograms is the live shape this guards.
    const t = template([
      tf("hazardPictograms", {
        dataType: "multi_enum",
        validation: { required: true },
        enumOptions: ["GHS01", "GHS02", "GHS03"].map((v) => ({ value: v, label: { en: v } })),
      }),
    ]);
    const p = passport({
      fields: { hazardPictograms: field(["GHS01", "GHS03"]) },
      parties: { manufacturer: party("DE") },
    });
    const r = evaluateCompliance(p, t, "chemicals");
    // Only the enum is under test — chemicals also raises an
    // unverifiable_conditional for unrecorded SVHC content (CHEM-1),
    // so assert on the format findings rather than the rolled-up verdict.
    expect(r.warnings.filter((w) => w.type === "invalid_format")).toHaveLength(0);
  });

  it("flags a bare-string enumOptions template as rejecting all values (guards the regression)", () => {
    // If a template regresses to bare strings, `o.value` is undefined and the
    // allowed set is {undefined} — so even a listed option is reported invalid.
    // Asserting the broken behaviour here means a future fix to `checkFieldFormat`
    // (coercing `typeof o === "string" ? o : o.value`) fails this test loudly
    // rather than passing silently with the data still wrong.
    const t = template([
      tf("dataCarrierType", {
        dataType: "enum",
        validation: { required: false },
        enumOptions: ["QR", "NFC"] as unknown as TemplateField["enumOptions"],
      }),
    ]);
    const p = passport({
      fields: { dataCarrierType: field("QR") },
      parties: { manufacturer: party("DE") },
    });
    const r = evaluateCompliance(p, t, "chemicals");
    expect(r.warnings.some((w) => w.type === "invalid_format" && w.target === "dataCarrierType")).toBe(true);
  });

  it("treats explicit null bounds as 'no constraint' (real template shape)", () => {
    // Seeded templates carry `min/max/minLength/maxLength: null` (not
    // undefined) for unset bounds. `null` must NOT coerce to 0 — a
    // regression caught only by the live .loc test, never the unit
    // fixtures (which used absent bounds).
    const t = template([
      tf("n", { dataType: "number", validation: { required: false, min: null as unknown as undefined, max: null as unknown as undefined } }),
      tf("s", { validation: { required: false, minLength: null as unknown as undefined, maxLength: null as unknown as undefined, pattern: null as unknown as undefined } }),
    ]);
    const p = passport({ fields: { n: field(243), s: field("anything") }, parties: { manufacturer: party("DE") } });
    const r = evaluateCompliance(p, t, "furniture");
    expect(r.warnings.filter((w) => w.type === "invalid_format")).toHaveLength(0);
    expect(r.verdict).toBe("compliant");
  });

  it("warns on a pattern mismatch", () => {
    const t = template([tf("u", { validation: { required: false, pattern: "^https://" } })]);
    const p = passport({ fields: { u: field("ftp://x") } });
    const r = evaluateCompliance(p, t, "furniture");
    expect(r.warnings.some((w) => w.type === "invalid_format" && w.target === "u")).toBe(true);
  });

  it("returns incomplete with an explanatory finding when template is missing", () => {
    const r = evaluateCompliance(passport(), undefined, "battery");
    expect(r.verdict).toBe("incomplete");
    expect(r.critical).toHaveLength(1);
  });
});

// ── CC-1 cross-cutting ────────────────────────────────────────────
describe("evaluateCompliance — CC-1 EU operator", () => {
  const t = () => template([]);

  it("warns (unverifiable) when manufacturer country is unset", () => {
    const p = passport({ parties: { manufacturer: party(undefined) } });
    const r = evaluateCompliance(p, t(), "furniture");
    expect(r.warnings.some((w) => w.ruleId === "CC-1" && w.type === "unverifiable_conditional")).toBe(true);
  });

  it("no CC-1 finding for an EU manufacturer", () => {
    const p = passport({ parties: { manufacturer: party("DE") } });
    const r = evaluateCompliance(p, t(), "furniture");
    expect(r.warnings.some((w) => w.ruleId === "CC-1")).toBe(false);
  });

  it("warns when non-EU manufacturer has neither importer nor AR", () => {
    const p = passport({ parties: { manufacturer: party("CN") } });
    const r = evaluateCompliance(p, t(), "furniture");
    expect(r.warnings.some((w) => w.ruleId === "CC-1" && w.type === "conditional_missing")).toBe(true);
  });

  it("satisfied when non-EU manufacturer has an importer (grouped, not AR-only)", () => {
    const p = passport({ parties: { manufacturer: party("CN"), importer: party("DE") } });
    const r = evaluateCompliance(p, t(), "furniture");
    expect(r.warnings.some((w) => w.ruleId === "CC-1")).toBe(false);
  });
});

// ── Battery BAT-1 ─────────────────────────────────────────────────
describe("evaluateCompliance — BAT-1 battery passport scope", () => {
  // battery requires 3 parties; give them so we isolate the BAT-1 behaviour.
  const parties = {
    manufacturer: party("DE"),
    recycler: party("DE"),
    producerResponsibilityOrg: party("DE"),
  };
  const t = () => template([tf("batteryCategory"), tf("batteryUniqueIdentifier")]);

  it("evaluated coverage for battery category", () => {
    const r = evaluateCompliance(passport({ parties }), t(), "battery");
    expect(r.conditionalCoverage).toBe("evaluated");
  });

  it("critical when an in-scope EV battery lacks its unique identifier", () => {
    const p = passport({ parties, fields: { batteryCategory: field("EV") } });
    const r = evaluateCompliance(p, t(), "battery");
    expect(r.critical.some((c) => c.ruleId === "BAT-1" && c.target === "batteryUniqueIdentifier")).toBe(true);
    expect(r.verdict).toBe("incomplete");
  });

  it("no BAT-1 finding for an out-of-scope portable battery", () => {
    const p = passport({ parties, fields: { batteryCategory: field("portable"), batteryUniqueIdentifier: field("x") } });
    const r = evaluateCompliance(p, t(), "battery");
    expect(r.critical.some((c) => c.ruleId === "BAT-1")).toBe(false);
  });

  it("no BAT-1 finding for industrial ≤2kWh (out of scope)", () => {
    const p = passport({ parties, fields: { batteryCategory: field("industrial_lte_2kwh") } });
    const r = evaluateCompliance(p, t(), "battery");
    expect(r.critical.some((c) => c.ruleId === "BAT-1")).toBe(false);
  });

  it("warns (unverifiable) when batteryCategory is unset", () => {
    const r = evaluateCompliance(passport({ parties }), t(), "battery");
    expect(r.warnings.some((w) => w.ruleId === "BAT-1" && w.type === "unverifiable_conditional")).toBe(true);
  });
});

// ── Chemicals CHEM-1 ──────────────────────────────────────────────
describe("evaluateCompliance — CHEM-1 SVHC disclosure", () => {
  const t = () => template([tf("svhcSubstances", { dataType: "array" }), tf("svhcSubstanceName")]);

  it("warns (unverifiable) when SVHC content isn't recorded", () => {
    const r = evaluateCompliance(passport({ parties: { manufacturer: party("DE") } }), t(), "chemicals");
    expect(r.warnings.some((w) => w.ruleId === "CHEM-1" && w.type === "unverifiable_conditional")).toBe(true);
  });

  it("no CHEM-1 finding when SVHC array is empty (declared none above threshold)", () => {
    const p = passport({ parties: { manufacturer: party("DE") }, fields: { svhcSubstances: field([]) } });
    const r = evaluateCompliance(p, t(), "chemicals");
    expect(r.critical.some((c) => c.ruleId === "CHEM-1")).toBe(false);
    expect(r.warnings.some((w) => w.ruleId === "CHEM-1")).toBe(false);
  });

  it("critical when SVHC present but no safe-use disclosure name", () => {
    const p = passport({ parties: { manufacturer: party("DE") }, fields: { svhcSubstances: field(["lead"]) } });
    const r = evaluateCompliance(p, t(), "chemicals");
    expect(r.critical.some((c) => c.ruleId === "CHEM-1" && c.target === "svhcSubstanceName")).toBe(true);
  });

  it("satisfied when SVHC present and disclosure name set", () => {
    const p = passport({
      parties: { manufacturer: party("DE") },
      fields: { svhcSubstances: field(["lead"]), svhcSubstanceName: field("lead") },
    });
    const r = evaluateCompliance(p, t(), "chemicals");
    expect(r.critical.some((c) => c.ruleId === "CHEM-1")).toBe(false);
  });
});

// ── Construction CON-1 ────────────────────────────────────────────
describe("evaluateCompliance — CON-1 DoP/DoC", () => {
  const t = () => template([tf("harmonizedStandardReference"), tf("ceMarkingStatus", { dataType: "enum" })]);

  it("critical when covered by a harmonised spec but CE/declaration missing", () => {
    const p = passport({ parties: { manufacturer: party("DE") }, fields: { harmonizedStandardReference: field("EN 15804") } });
    const r = evaluateCompliance(p, t(), "construction");
    expect(r.critical.some((c) => c.ruleId === "CON-1" && c.target === "ceMarkingStatus")).toBe(true);
  });

  it("no CON-1 finding when no harmonised standard is referenced", () => {
    const p = passport({ parties: { manufacturer: party("DE") } });
    const r = evaluateCompliance(p, t(), "construction");
    expect(r.critical.some((c) => c.ruleId === "CON-1")).toBe(false);
  });
});
