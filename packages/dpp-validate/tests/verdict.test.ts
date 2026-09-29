import { describe, it, expect } from "vitest";
import { evaluateCompliance } from "../src/verdict.js";
import { isEuEeaCountry } from "../src/eu-countries.js";
import { getPartyRoles, isRequiredRole, allRolesForCategory } from "../src/vendor/required-roles.js";
import { effectiveRequired, effectiveRequiredForBattery } from "../src/vendor/publish-gate.js";
import { CONDITIONAL_RULES } from "../src/rules.js";
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
    // The test isolates the enum shape — asserting on format findings directly
    // rather than the rolled-up verdict so a future static-field addition to
    // the chemicals template can't change this result.
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

  // BAT-2: Art. 77(1) applies from 18 February 2027, so the same gap is a
  // warning before that day and critical from it.
  const BEFORE = new Date("2027-02-17T23:59:59Z");
  const FROM = new Date("2027-02-18T00:00:00Z");

  it("critical when an in-scope EV battery lacks its unique identifier, from 18 Feb 2027", () => {
    const p = passport({ parties, fields: { batteryCategory: field("EV") } });
    const r = evaluateCompliance(p, t(), "battery", FROM);
    expect(r.critical.some((c) => c.ruleId === "BAT-1" && c.target === "batteryUniqueIdentifier")).toBe(true);
    expect(r.verdict).toBe("incomplete");
  });

  it("warning, not critical, for the same gap before 18 Feb 2027 (BAT-2 date gate)", () => {
    const p = passport({ parties, fields: { batteryCategory: field("EV") } });
    const r = evaluateCompliance(p, t(), "battery", BEFORE);
    expect(r.critical.some((c) => c.ruleId === "BAT-1")).toBe(false);
    const w = r.warnings.find((c) => c.ruleId === "BAT-1" && c.target === "batteryUniqueIdentifier");
    expect(w?.severity).toBe("warning");
    expect(w?.why).toContain("18 February 2027");
    expect(r.verdict).toBe("compliant_with_warnings");
  });

  // Guards the BAT-1 fix text: it must cite ISO/IEC 15459 (Battery Regulation
  // Art. 77(3) requires it until a delegated act replaces it with EN 18219), and
  // must name GS1 only as an *example*, not as the sole required scheme. The
  // previous text said "(GS1 Digital Link)" without "e.g." — asserting a
  // constraint BAT-1 never verified and EN 18219 does not impose. Batteries are
  // a special case: Art. 77(3) does constrain the scheme (to 15459), so the fix
  // text is intentionally specific about 15459 while keeping GS1 as an example.
  //
  // The non-battery cross-cutting rule (CC-1) and other rules must still not name
  // schemes they don't verify.
  it("BAT-1 remediation text cites ISO/IEC 15459 and Art. 77(3), naming GS1 only as an example", () => {
    const p = passport({ parties, fields: { batteryCategory: field("EV") } });
    const r = evaluateCompliance(p, t(), "battery");
    const findings = [...r.critical, ...(r.warnings ?? [])];
    // Sanity: the fixture must produce the BAT-1 finding.
    const bat1 = findings.find((f) => f.ruleId === "BAT-1");
    expect(bat1).toBeDefined();
    // Must cite the legal basis for the scheme restriction.
    expect(bat1?.fix).toMatch(/ISO\/IEC 15459/);
    expect(bat1?.fix).toMatch(/Art\. 77\(3\)/);
    // GS1 must appear only as an example (preceded by "e.g.").
    if (bat1?.fix && /GS1/.test(bat1.fix)) {
      expect(bat1.fix).toMatch(/e\.g\.\s+a GS1/i);
    }

    // Other rules (CC-1, BAT-APP, BAT-VAL, CE-1) must still not assert a
    // scheme they do not check.
    const NON_BAT1_SCHEME_NAMES = /GS1|Digital Link|GTIN|\bGLN\b|\bLEI\b|IEC 61406|\bDOI\b/i;
    for (const f of findings.filter((f) => f.ruleId !== "BAT-1")) {
      expect(
        NON_BAT1_SCHEME_NAMES.test(f.fix ?? ""),
        `${f.ruleId} remediation names an identifier scheme but the rule only checks presence: ${f.fix}`,
      ).toBe(false);
    }
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

// ── CHEM-1 does NOT apply to detergents or paints-coatings ──────────
// REACH Art. 33 addresses ARTICLES — physical objects that contain a
// substance but do not intentionally release it during normal use.
// Detergents and paints are MIXTURES; their SVHC disclosure obligation
// is the safety data sheet under REACH Art. 31, not Art. 33. Annex VI
// Part A of (EU) 2026/405 has no SVHC point for either category.
//
// These tests are the regression guard: they must FAIL if CHEM-1 is
// reinstated for either category. Specifically, the strongest trigger is
// tested — svhcSubstances populated with items AND svhcSubstanceName
// absent — because that is the exact path the old rule used to produce
// a `critical` finding. If it passes without a CHEM-1 finding, the rule
// is absent; if someone adds it back, these fail loudly.
describe.each(["detergents", "paints-coatings"])(
  "evaluateCompliance — no CHEM-1 for %s (REACH Art. 33 binds articles, not mixtures)",
  (category) => {
    const t = () => template([tf("svhcSubstances", { dataType: "array" }), tf("svhcSubstanceName")]);

    it("no CHEM-1 warning when svhcSubstances is absent", () => {
      const r = evaluateCompliance(passport({ parties: { manufacturer: party("DE") } }), t(), category);
      expect(r.warnings.some((w) => w.ruleId === "CHEM-1")).toBe(false);
      expect(r.critical.some((c) => c.ruleId === "CHEM-1")).toBe(false);
    });

    it("no CHEM-1 critical even when SVHC present and svhcSubstanceName absent", () => {
      // This is the exact condition that formerly triggered the critical finding.
      // It must not fire: the obligation is on the safety data sheet, not the
      // DPP. A passive pass here means the rule is gone; a failure means it
      // was reintroduced.
      const p = passport({
        parties: { manufacturer: party("DE") },
        fields: { svhcSubstances: field(["lead"]) },
      });
      const r = evaluateCompliance(p, t(), category);
      expect(r.critical.some((c) => c.ruleId === "CHEM-1")).toBe(false);
    });
  },
);

// The dead key must NOT resurrect the rule: `chemicals` is not a category.
it("reports chemicals as static-only — the category no longer exists", () => {
  const t = template([tf("svhcSubstances", { dataType: "array" }), tf("svhcSubstanceName")]);
  const p = passport({ parties: { manufacturer: party("DE") }, fields: { svhcSubstances: field(["lead"]) } });
  const r = evaluateCompliance(p, t, "chemicals");
  expect(r.critical.some((c) => c.ruleId === "CHEM-1")).toBe(false);
  expect(r.warnings.some((w) => w.ruleId === "CHEM-1")).toBe(false);
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

// ── CE-1 · CE-marking coherence ───────────────────────────────────
describe("evaluateCompliance — CE-1 CE-marking coherence", () => {
  const t = () => template([tf("ceMarkingStatus", { dataType: "enum" }), tf("ceMarking", { dataType: "boolean" })]);
  const p = (fields: Record<string, PassportField>) =>
    passport({ parties: { manufacturer: party("DE") }, fields });

  it("critical when the mark applies but whether it is borne is unrecorded", () => {
    const r = evaluateCompliance(p({ ceMarkingStatus: field("marked") }), t(), "electronics");
    expect(r.critical.some((c) => c.ruleId === "CE-1" && c.target === "ceMarking")).toBe(true);
  });

  it("critical when bearing the mark contradicts a not_applicable status", () => {
    const r = evaluateCompliance(
      p({ ceMarkingStatus: field("not_applicable"), ceMarking: field(true) }),
      t(),
      "toys",
    );
    expect(r.critical.some((c) => c.ruleId === "CE-1")).toBe(true);
  });

  it("coherent status+mark produces no CE-1 finding", () => {
    const r = evaluateCompliance(
      p({ ceMarkingStatus: field("marked"), ceMarking: field(true) }),
      t(),
      "steel",
    );
    expect(r.critical.some((c) => c.ruleId === "CE-1")).toBe(false);
  });

  it("does not run for a category outside the CE regime", () => {
    const r = evaluateCompliance(p({ ceMarkingStatus: field("marked") }), t(), "textile");
    expect(r.critical.some((c) => c.ruleId === "CE-1")).toBe(false);
  });
});

// ── Category coverage ─────────────────────────────────────────────
// Both category-keyed maps in this package (CONDITIONAL_RULES and
// CATEGORY_PARTY_ROLES) fail SILENTLY on a renamed category: the lookup
// misses, and a miss is a legitimate value (`static-only` / `null`). These
// pin the category list itself so a rename breaks a test instead of quietly
// disabling a rule or emptying a role list.
describe("category coverage", () => {
  // The 13 live categories — mirrors tracepass-dpp-schemas/templates/*.json.
  const CATEGORIES = [
    "battery", "construction", "detergents", "electronics", "fmcg",
    "furniture", "jewelry", "packaging", "paints-coatings", "steel",
    "textile", "toys", "tyres",
  ] as const;

  it("every live category has a party-role entry", () => {
    const missing = CATEGORIES.filter((c) => getPartyRoles(c) === null);
    expect(missing).toEqual([]);
  });

  it("every live category requires a manufacturer", () => {
    const notRequired = CATEGORIES.filter((c) => !isRequiredRole(c, "manufacturer"));
    expect(notRequired).toEqual([]);
  });

  it("retired category keys resolve to nothing", () => {
    // `chemicals` was split into detergents + paints-coatings.
    expect(getPartyRoles("chemicals")).toBeNull();
    expect(allRolesForCategory("chemicals")).toEqual([]);
    expect(CONDITIONAL_RULES["chemicals"]).toBeUndefined();
  });

  it("every conditional-rule key is a live category", () => {
    const stale = Object.keys(CONDITIONAL_RULES).filter(
      (k) => !(CATEGORIES as readonly string[]).includes(k),
    );
    expect(stale).toEqual([]);
  });
});

// ── Per-battery-category applicability (validation.requiredBy) ─────
// Annex XIII fields do not all apply to every battery. A portable or SLI
// battery owes NO passport at all (Art. 77(1)), so demanding its fields would
// be inventing an obligation — the mirror image of the under-report failures.
describe("effectiveRequired — requiredBy resolution", () => {
  const gated = (map?: Record<string, "required" | "conditional" | "notApplicable">) =>
    tf("stateOfHealth", { validation: { required: false, ...(map ? { requiredBy: map } : {}) } });
  const MAP = { EV: "required", LMT: "required", industrial_gt_2kwh: "required" } as const;

  it("falls back to `required` when there is no requiredBy map", () => {
    expect(effectiveRequired(tf("x", { validation: { required: true } }), "EV")).toBe(true);
    expect(effectiveRequired(tf("x", { validation: { required: false } }), "EV")).toBe(false);
  });

  it("resolves per category when the map lists it", () => {
    expect(effectiveRequired(gated(MAP), "EV")).toBe(true);
    expect(effectiveRequired(gated({ ...MAP, EV: "conditional" }), "EV")).toBe(false);
    expect(effectiveRequired(gated({ ...MAP, EV: "notApplicable" }), "EV")).toBe(false);
  });

  it("falls back to `required` for a category absent from the map", () => {
    // "portable" is not a key, so the base flag applies — false here.
    expect(effectiveRequired(gated(MAP), "portable")).toBe(false);
  });

  it("does not demand Annex XIII fields from an out-of-scope battery", () => {
    // The whole point: portable / SLI owe no passport, so no field is mandatory.
    for (const cat of ["portable", "SLI", "industrial_lte_2kwh"]) {
      expect(effectiveRequiredForBattery(gated(MAP), cat)).toBe(false);
    }
    expect(effectiveRequiredForBattery(gated(MAP), "EV")).toBe(true);
  });

  it("an UNSET category is not treated as exemption", () => {
    // Absence of a category is not evidence of exemption, but a gated field
    // whose base flag is false still cannot block — BAT-1 warns instead.
    expect(effectiveRequiredForBattery(gated(MAP), undefined)).toBe(false);
    const always = tf("x", { validation: { required: true } });
    expect(effectiveRequiredForBattery(always, undefined)).toBe(true);
  });
});

// requiredBy is resolved from each category's own sub-category field, not only
// batteryCategory (vendor/subcategory.ts, mirrored from the platform).
describe("evaluateCompliance — requiredBy outside batteries", () => {
  const t = () => ({
    ...template([
      tf("detergentUserType"),
      tf("ingredients", { dataType: "array", validation: { required: false, requiredBy: { consumer: "required", industrial_institutional: "conditional" } } } as Partial<TemplateField>),
    ]),
    category: "detergents",
  }) as unknown as Template;
  const missing = (r: ReturnType<typeof evaluateCompliance>) => r.critical.some((c) => c.target === "ingredients");

  it("a consumer detergent must carry its substance list", () => {
    const r = evaluateCompliance(passport({ fields: { detergentUserType: field("consumer") } }), t(), "detergents");
    expect(missing(r)).toBe(true);
  });

  it("an industrial and institutional detergent need not", () => {
    const r = evaluateCompliance(passport({ fields: { detergentUserType: field("industrial_institutional") } }), t(), "detergents");
    expect(missing(r)).toBe(false);
  });
});

describe("BAT-APP — platform-written values and remediation text", () => {
  const BAT_APP = CONDITIONAL_RULES.battery.find((r) => r.id === "BAT-APP")!;
  const tmpl = { category: "battery", fields: [] } as unknown as Template;
  function battery(
    category: string,
    fields: Record<string, PassportField>,
    profile: Record<string, boolean> = {},
  ): Passport {
    const batteryProfile = Object.fromEntries(
      Object.entries(profile).map(([k, v]) => [k, { value: v, status: "approved" }]),
    );
    return {
      status: "draft",
      fields: { batteryCategory: field(category), ...fields },
      batteryProfile,
    } as unknown as Passport;
  }

  it("does not flag a system default the user never entered", () => {
    const p = battery(
      "industrial_gt_2kwh",
      { stateOfHealth: { value: 100, status: "approved", source: "system" } as PassportField },
      { hasBMS: true, isStationaryBess: false },
    );
    expect(BAT_APP.run(p, tmpl).find((f) => f.target === "stateOfHealth")).toBeUndefined();
  });

  it("flags the same value once a user entered it", () => {
    const p = battery(
      "industrial_gt_2kwh",
      { stateOfHealth: { value: 100, status: "approved", source: "manual" } as PassportField },
      { hasBMS: true, isStationaryBess: false },
    );
    expect(BAT_APP.run(p, tmpl).find((f) => f.target === "stateOfHealth")?.fix).toMatch(
      /stationary battery energy storage system/,
    );
  });

  it("keeps the stationary-storage hint off unrelated gates", () => {
    const p = battery("LMT", { capacityThresholdForExhaustion: field(80) });
    const f = BAT_APP.run(p, tmpl).find((x) => x.target === "capacityThresholdForExhaustion");
    expect(f?.fix).toBeDefined();
    expect(f?.fix).not.toMatch(/stationary/);
  });
});

// ── Gate-conditional enforcement via evaluateCompliance ───────────────────────
describe("evaluateCompliance — gate:conditional critical finding", () => {
  /**
   * Build a minimal battery template with a field that is conditionally
   * required for industrial_gt_2kwh (requiredBy.industrial_gt_2kwh = "conditional")
   * — mirrors the 12 real rechargeable-gated fields in battery.json.
   */
  function batteryTemplate(extraFields: TemplateField[] = []): Template {
    return {
      category: "battery",
      fields: [
        tf("batteryCategory", { validation: { required: true } }),
        // A rechargeable-gated field: conditional for industrial_gt_2kwh,
        // not present at all in a minimal template (required via gate only).
        tf("dynamicRatedCapacity", {
          validation: {
            required: false,
            requiredBy: { industrial_gt_2kwh: "conditional" },
          },
          regulationRef: { instrument: "(EU) 2023/1542", article: "Annex XIII 4(a)(i)" },
        }),
        ...extraFields,
      ],
      regulation: { number: "(EU) 2023/1542", name: "Battery Regulation", effectiveDate: new Date() },
    } as unknown as Template;
  }

  it("emits a critical gate:conditional finding when an approved rechargeable flag makes the field required and the field is absent", () => {
    // An industrial_gt_2kwh battery with an APPROVED rechargeable=true flag
    // and an empty dynamicRatedCapacity field must produce a critical finding
    // with ruleId "gate:conditional".
    const p = passport({
      fields: { batteryCategory: field("industrial_gt_2kwh") },
      // conditionProfile is the canonical field; rechargeable=true + approved
      // makes the gate return "applies" for industrial_gt_2kwh
      conditionProfile: {
        rechargeable: { value: true, status: "approved", source: "manual", audit: [] },
      },
    });

    const r = evaluateCompliance(p, batteryTemplate(), "battery");

    expect(r.verdict).toBe("incomplete");
    const gateFindings = r.critical.filter((c) => c.ruleId === "gate:conditional");
    expect(gateFindings.length).toBeGreaterThan(0);
    const dcFinding = gateFindings.find((c) => c.target === "dynamicRatedCapacity");
    expect(dcFinding).toBeDefined();
    expect(dcFinding?.severity).toBe("critical");
    expect(dcFinding?.type).toBe("missing_field");
  });

  it("does NOT emit gate:conditional when rechargeable flag is not approved (pending_review gate = unknown)", () => {
    // A pending_review flag does not activate the gate — applicability stays "unknown"
    // and the field remains optional.
    const p = passport({
      fields: { batteryCategory: field("industrial_gt_2kwh") },
      conditionProfile: {
        rechargeable: { value: true, status: "pending_review", source: "ai_suggested", audit: [] },
      },
    });

    const r = evaluateCompliance(p, batteryTemplate(), "battery");

    const gateFindings = r.critical.filter((c) => c.ruleId === "gate:conditional");
    expect(gateFindings.find((c) => c.target === "dynamicRatedCapacity")).toBeUndefined();
  });

  it("does NOT emit gate:conditional when the gated field is present and approved", () => {
    const p = passport({
      fields: {
        batteryCategory: field("industrial_gt_2kwh"),
        dynamicRatedCapacity: field(150),
      },
      conditionProfile: {
        rechargeable: { value: true, status: "approved", source: "manual", audit: [] },
      },
    });

    const r = evaluateCompliance(p, batteryTemplate(), "battery");

    const gateFindings = r.critical.filter((c) => c.ruleId === "gate:conditional");
    expect(gateFindings.find((c) => c.target === "dynamicRatedCapacity")).toBeUndefined();
  });

  it("emits gate:conditional when the gated field is present but pending_review (unapproved value = hard block)", () => {
    // MEDIUM 1: gate-confirmed conditional field with pending_review value
    // must also block (consistent with the hard-block decision).
    const p = passport({
      fields: {
        batteryCategory: field("industrial_gt_2kwh"),
        dynamicRatedCapacity: field(150, "pending_review"),
      },
      conditionProfile: {
        rechargeable: { value: true, status: "approved", source: "manual", audit: [] },
      },
    });

    const r = evaluateCompliance(p, batteryTemplate(), "battery");

    expect(r.verdict).toBe("incomplete");
    const gateFindings = r.critical.filter((c) => c.ruleId === "gate:conditional");
    const dcFinding = gateFindings.find((c) => c.target === "dynamicRatedCapacity");
    expect(dcFinding).toBeDefined();
    expect(dcFinding?.severity).toBe("critical");
    // The field IS present (not absent) — the why text should say "not yet approved"
    expect(dcFinding?.why).toMatch(/not yet approved/);
  });
});
