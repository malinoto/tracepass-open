/**
 * Per-category CONDITIONAL compliance rules.
 *
 * These encode the conditional obligations that are binding and in force.
 * Seven categories carry them — battery, detergents, paints-coatings,
 * construction, electronics, steel and toys — plus one cross-cutting rule
 * (CC-1) that applies to every category. The remaining categories have no rule
 * entry here, so the engine reports them `static-only`: their template's
 * required fields are the whole obligation.
 *
 * Rules live in TypeScript rather than a JSON DSL in the templates.
 * Regulatory logic stays in code, reviewed in pull requests, and is
 * deliberately not drift-able by editing a template. Each rule cites its
 * article so the verdict can show provenance.
 *
 * A rule returns findings. `unverifiable_conditional` (warning) is
 * emitted when a rule's TRIGGER field is absent — we never silently
 * skip a mandatory conditional, and never assert compliance on data we
 * couldn't read.
 *
 * Tier discipline: `critical` is reserved for binding, in-force obligations
 * traced to a primary source. A draft or not-yet-dated obligation is a
 * `warning`, never a blocker.
 */

import type { Passport, Template } from "@tracepass/dpp-types";
import { isEuEeaCountry } from "./eu-countries.js";
import { BATTERY_FIELD_GATES, batteryFieldApplicability } from "./battery-applicability.js";
import type { ComplianceFinding } from "./types.js";

/** A field counts as "present" when it exists with a non-empty value. */
function hasValue(passport: Passport, key: string): boolean {
  const f = passport.fields[key];
  return !!f && f.value !== null && f.value !== undefined && f.value !== "";
}

/** Read a field's raw value (or undefined when absent/empty). */
function valueOf(passport: Passport, key: string): unknown {
  return hasValue(passport, key) ? passport.fields[key].value : undefined;
}

/** A conditional rule: given passport+template, produce zero or more findings. */
export interface ConditionalRule {
  id: string;
  run(passport: Passport, template: Template): ComplianceFinding[];
}

// ── CC-1 · cross-cutting EU economic-operator rule ──────────────────
// Reg (EU) 2019/1020 Art. 4(1)+(2): a product may be placed on the
// market only if there is an EU-established operator. When the
// manufacturer is non-EU, that operator must be one of importer / AR /
// fulfilment service provider. This is GROUPED (any one satisfies) —
// NOT "AR required". We have no fulfilmentServiceProvider role, so the
// satisfying set is {importer, authorisedRepresentative}; if neither is
// present we warn (not critical) and point at the FSP escape hatch, to
// avoid a false-positive on a legitimately FSP-only arrangement.
const CC1: ConditionalRule = {
  id: "CC-1",
  run(passport) {
    const mfr = passport.parties?.manufacturer;
    // Trigger field absent → can't evaluate. Warn, don't assert.
    if (!mfr || !mfr.country) {
      return [
        {
          type: "unverifiable_conditional",
          severity: "warning",
          target: "manufacturer.country",
          regulation: "(EU) 2019/1020",
          article: "Art. 4",
          ruleId: "CC-1",
          why: "Manufacturer country is not set, so the EU economic-operator requirement couldn't be evaluated.",
          fix: "Set the manufacturer party's country so compliance with Art. 4 can be confirmed.",
        },
      ];
    }
    if (isEuEeaCountry(mfr.country)) return []; // EU/EEA manufacturer satisfies Art. 4 directly.

    const satisfied =
      !!passport.parties?.importer || !!passport.parties?.authorisedRepresentative;
    if (satisfied) return [];

    return [
      {
        type: "conditional_missing",
        severity: "warning",
        target: "importer|authorisedRepresentative",
        regulation: "(EU) 2019/1020",
        article: "Art. 4(1)(2)",
        ruleId: "CC-1",
        why: `Manufacturer is established outside the EU/EEA (${mfr.country}); EU placing on market requires an EU-established operator.`,
        fix: "Add an importer OR an authorised representative (or record a fulfilment service provider) established in the EU.",
      },
    ];
  },
};

// ── Battery · Reg (EU) 2023/1542 ────────────────────────────────────
// BAT-1: battery passport required IF category ∈ {LMT, EV, industrial>2kWh}.
// The template's `batteryCategory` enum already encodes the scope split
// (LMT, EV, industrial_gt_2kwh vs industrial_lte_2kwh, SLI, portable),
// so the ">2 kWh" line is an enum check, not kWh math.
const IN_SCOPE_BATTERY = new Set(["LMT", "EV", "industrial_gt_2kwh"]);
// Fields the passport must carry once it's an in-scope battery. Kept tight —
// only the identifiers Art. 77 hangs the passport on; broader field
// completeness is the static tier's job.
const BATTERY_PASSPORT_FIELDS = ["batteryUniqueIdentifier"] as const;

const BAT1: ConditionalRule = {
  id: "BAT-1",
  run(passport) {
    const cat = valueOf(passport, "batteryCategory");
    if (cat === undefined) {
      return [
        {
          type: "unverifiable_conditional",
          severity: "warning",
          target: "batteryCategory",
          regulation: "(EU) 2023/1542",
          article: "Art. 77(1)",
          ruleId: "BAT-1",
          why: "Battery category isn't set, so battery-passport scope (LMT / EV / industrial >2 kWh) couldn't be evaluated.",
          fix: "Set batteryCategory. Portable and SLI batteries are out of scope; LMT, EV and industrial >2 kWh require a battery passport.",
        },
      ];
    }
    // Out-of-scope categories (portable, SLI, industrial_lte_2kwh) → no obligation.
    if (!IN_SCOPE_BATTERY.has(String(cat))) return [];

    const findings: ComplianceFinding[] = [];
    for (const key of BATTERY_PASSPORT_FIELDS) {
      if (!hasValue(passport, key)) {
        findings.push({
          type: "conditional_missing",
          severity: "critical",
          target: key,
          regulation: "(EU) 2023/1542",
          article: "Art. 77",
          ruleId: "BAT-1",
          why: `This is an in-scope battery (${String(cat)}); a battery passport with its unique identifier is mandatory.`,
          fix: `Provide ${key} — the battery passport's unique identifier (GS1 Digital Link).`,
        });
      }
    }
    return findings;
  },
};

// ── Battery · field-applicability (deck 27 May 2026, slide 36) ──────
// BAT-APP: not every Annex XIII field applies to every battery. The
// shared predicate (battery-applicability.ts) decides per field from
// batteryCategory + the batteryProfile classifiers. This rule turns that
// into findings WITHOUT ever blocking:
//   - a field that's `not_applicable` but FILLED → warning (likely
//     mis-entered or the battery is mis-classified). Never critical —
//     extra data isn't a compliance failure, just a flag.
//   - a gate whose trigger is absent (`unknown`) AND the dependent field
//     is filled → unverifiable_conditional warning (can't confirm the
//     field belongs; ask for the missing classifier).
// We deliberately do NOT emit "missing applicable field" here — required-
// field completeness is the static tier's job; this rule is purely about
// applicability, so it stays additive and can't double-count.
const BAT_APP: ConditionalRule = {
  id: "BAT-APP",
  run(passport) {
    const findings: ComplianceFinding[] = [];
    // Reuse the shared predicate so the verdict + editor read applicability
    // through ONE path (incl. the "pending AI flag = unknown" safety rule).
    const applicability = batteryFieldApplicability(passport, "battery");
    for (const gate of BATTERY_FIELD_GATES) {
      // Every key in a gate shares the gate's verdict; sample the first.
      const verdict = applicability[gate.keys[0]];
      if (verdict === "applies") continue;

      for (const key of gate.keys) {
        const filled = hasValue(passport, key);
        if (verdict === "not_applicable" && filled) {
          findings.push({
            type: "invalid_format",
            severity: "warning",
            target: key,
            regulation: "(EU) 2023/1542",
            article: gate.article,
            ruleId: "BAT-APP",
            why: `${key} is filled but doesn't apply to this battery — ${gate.reason}`,
            fix: `Remove ${key}, or correct the battery classification (batteryCategory / battery profile) if this field should apply.`,
          });
        } else if (verdict === "unknown" && filled) {
          findings.push({
            type: "unverifiable_conditional",
            severity: "warning",
            target: key,
            regulation: "(EU) 2023/1542",
            article: gate.article,
            ruleId: "BAT-APP",
            why: `${key} is filled, but whether it applies couldn't be confirmed — ${gate.reason}`,
            fix: "Set the battery classification (has-BMS / rechargeable / external-storage) so applicability can be confirmed.",
          });
        }
      }
    }
    return findings;
  },
};

// ── Battery · value validation (not just presence) ──────────────────
// BAT-VAL: the static tier + BAT-1 check fields are PRESENT; this rule
// checks the values that ARE present are PLAUSIBLE. All warnings, never
// blocking — a malformed value is a data-quality flag for the reviewer,
// not a hard compliance failure (the reviewer owns the value per the
// "AI suggests, human approves" product stance). Two kinds of check:
//   (1) numeric-range: percentages must be 0–100; carbon footprints ≥ 0.
//   (2) correlated-requirement: a recorded hazardous substance engages
//       the REACH/SCIP notification obligation, so scipNotificationNumber
//       should be present.
// Absent fields are skipped here (presence is BAT-1 / the static tier's
// job) so this rule stays additive and can't double-count.

/** Parse a field value as a finite number, or undefined if not numeric. */
function numberOf(passport: Passport, key: string): number | undefined {
  if (!hasValue(passport, key)) return undefined;
  const raw = passport.fields[key].value;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// Percentage fields that must sit within 0–100 when present.
const BATTERY_PERCENT_FIELDS = [
  "recycledContentCobalt",
  "recycledContentLithium",
  "recycledContentNickel",
  "recycledContentLead",
  "stateOfHealth",
  "stateOfCertifiedEnergy",
] as const;

// Carbon-footprint fields that must be ≥ 0 when present (kg CO2e/kWh).
const BATTERY_NONNEGATIVE_FIELDS = [
  "carbonFootprintTotal",
  "cfRawMaterialAcquisition",
  "cfMainProductProduction",
  "cfDistribution",
  "cfEndOfLifeRecycling",
] as const;

const BAT_VAL: ConditionalRule = {
  id: "BAT-VAL",
  run(passport) {
    const findings: ComplianceFinding[] = [];

    // (1a) percentages in [0, 100].
    for (const key of BATTERY_PERCENT_FIELDS) {
      const n = numberOf(passport, key);
      if (n !== undefined && (n < 0 || n > 100)) {
        findings.push({
          type: "invalid_format",
          severity: "warning",
          target: key,
          regulation: "(EU) 2023/1542",
          article: "Annex XIII",
          ruleId: "BAT-VAL",
          why: `${key} is ${n}, outside the valid 0–100% range.`,
          fix: `Correct ${key} to a percentage between 0 and 100.`,
        });
      }
    }

    // (1b) carbon-footprint values ≥ 0.
    for (const key of BATTERY_NONNEGATIVE_FIELDS) {
      const n = numberOf(passport, key);
      if (n !== undefined && n < 0) {
        findings.push({
          type: "invalid_format",
          severity: "warning",
          target: key,
          regulation: "(EU) 2023/1542",
          article: "Art. 7",
          ruleId: "BAT-VAL",
          why: `${key} is ${n}; a carbon-footprint value cannot be negative.`,
          fix: `Correct ${key} to a non-negative value (kg CO2e/kWh).`,
        });
      }
    }

    // (2) correlated requirement: hazardous substance recorded ⇒ SCIP
    // notification expected. Skipped entirely when no hazardous substance
    // is recorded (obligation not engaged) — so it never fires spuriously.
    const hazardous = valueOf(passport, "hazardousSubstances");
    const hazardousList = Array.isArray(hazardous)
      ? hazardous
      : hazardous !== undefined
        ? [hazardous]
        : [];
    if (hazardousList.length > 0 && !hasValue(passport, "scipNotificationNumber")) {
      findings.push({
        type: "conditional_missing",
        severity: "warning",
        target: "scipNotificationNumber",
        regulation: "(EC) 1907/2006",
        article: "WFD Art. 9(1)(i)",
        ruleId: "BAT-VAL",
        why: "A hazardous substance is recorded, which engages the SCIP notification obligation, but no SCIP notification number is set.",
        fix: "Record scipNotificationNumber for the SCIP database notification covering the recorded hazardous substance(s).",
      });
    }

    return findings;
  },
};

// ── Chemicals · REACH Art. 33 + SCIP (WFD Art. 9(1)(i)) ─────────────
// CHEM-1: SVHC disclosure required IF any Candidate-List SVHC present
// >0.1% w/w. The trigger is composition data the passport may not carry
// machine-readably — when `svhcSubstances` is absent we cannot tell
// whether the threshold is crossed, so we WARN (verify manually) rather
// than assert compliance. When the array is present and non-empty, the
// disclosure obligation is engaged → require the safe-use disclosure.
const CHEM1: ConditionalRule = {
  id: "CHEM-1",
  run(passport) {
    const svhc = valueOf(passport, "svhcSubstances");
    if (svhc === undefined) {
      return [
        {
          type: "unverifiable_conditional",
          severity: "warning",
          target: "svhcSubstances",
          regulation: "(EC) 1907/2006",
          article: "Art. 33",
          ruleId: "CHEM-1",
          why: "SVHC content isn't recorded, so REACH Art. 33 / SCIP disclosure (triggered above 0.1% w/w) couldn't be evaluated.",
          fix: "Record svhcSubstances. If any Candidate-List substance exceeds 0.1% w/w, safe-use info and a SCIP notification are required.",
        },
      ];
    }
    // Empty array → declared no SVHC above threshold → obligation not engaged.
    const list = Array.isArray(svhc) ? svhc : [svhc];
    if (list.length === 0) return [];

    // SVHC present → the safe-use disclosure (substance name min.) must be set.
    if (!hasValue(passport, "svhcSubstanceName")) {
      return [
        {
          type: "conditional_missing",
          severity: "critical",
          target: "svhcSubstanceName",
          regulation: "(EC) 1907/2006",
          article: "Art. 33(1)",
          ruleId: "CHEM-1",
          why: "A Candidate-List SVHC is recorded; Art. 33 requires safe-use information including, as a minimum, the substance name.",
          fix: "Provide svhcSubstanceName and ensure a SCIP notification reference (WFD Art. 9(1)(i)) is recorded.",
        },
      ];
    }
    return [];
  },
};

// ── Construction · Reg (EU) 2024/3110 (new CPR) ─────────────────────
// CON-1: a Declaration of Performance & Conformity is required IF the
// product is covered by a harmonised technical specification. The
// template's `harmonizedStandardReference` (required) signals coverage;
// when it's set, the CE-marking / declaration evidence must follow.
// NB: the CPR's *DPP* provisions are NOT in force (future delegated
// acts) — only this DoP/DoC conditional is binding today.
const CON1: ConditionalRule = {
  id: "CON-1",
  run(passport) {
    const hsRef = valueOf(passport, "harmonizedStandardReference");
    // No harmonised spec referenced → DoP/DoC obligation not engaged here.
    if (hsRef === undefined) return [];

    if (!hasValue(passport, "ceMarkingStatus")) {
      return [
        {
          type: "conditional_missing",
          severity: "critical",
          target: "ceMarkingStatus",
          regulation: "(EU) 2024/3110",
          article: "DoP/DoC",
          ruleId: "CON-1",
          why: "Product is covered by a harmonised technical specification; a Declaration of Performance & Conformity (CE marking) is required.",
          fix: "Record ceMarkingStatus and the declaration evidence for the referenced harmonised standard.",
        },
      ];
    }
    return [];
  },
};

// ── CE-1 · cross-category CE-marking coherence ──────────────────────
// Two fields describe CE marking: `ceMarking` (does the article bear the
// mark?) and `ceMarkingStatus` (what state is the conformity assessment
// in?). They must agree.
//
// A CE marking never *expires* — the mark is a permanent legal assertion
// about a product model. What expires is the certificate or Declaration of
// Performance behind it, which is why `expired` is not one of the states.
//
// Where the regulation mandates the mark unconditionally (battery Art. 20,
// electronics LVD/EMC Arts. 16-17, toys 2009/48/EC Art. 17) both fields are
// statically required and this rule only checks coherence. Where
// applicability is itself conditional on coverage by a harmonised technical
// specification (construction and steel under CPR), `ceMarking` is not
// statically required — this rule demands it once the status says the mark
// applies.
const CE1: ConditionalRule = {
  id: "CE-1",
  run(passport) {
    const status = valueOf(passport, "ceMarkingStatus");
    if (status === undefined) return []; // static tier already requires it

    const bears = valueOf(passport, "ceMarking");

    // The mark applies → the article must say whether it bears it.
    if ((status === "marked" || status === "pending") && bears === undefined) {
      return [
        {
          type: "conditional_missing",
          severity: "critical",
          target: "ceMarking",
          article: "CE marking",
          ruleId: "CE-1",
          why: `CE marking status is "${String(status)}", so whether the product bears the CE mark must be recorded.`,
          fix: "Set ceMarking to true or false.",
        },
      ];
    }

    // `not_applicable` means the product is outside every CE regime.
    // Claiming the mark is affixed contradicts that.
    if (status === "not_applicable" && bears === true) {
      return [
        {
          type: "invalid_format",
          severity: "critical",
          target: "ceMarking",
          article: "CE marking",
          ruleId: "CE-1",
          why: "The product is marked as bearing the CE mark while its CE marking status is 'not_applicable'. A product outside every CE regime cannot lawfully bear the mark.",
          fix: "Either set ceMarking to false, or correct ceMarkingStatus to `marked`.",
        },
      ];
    }

    // Declared `marked` but the article does not bear it.
    if (status === "marked" && bears === false) {
      return [
        {
          type: "invalid_format",
          severity: "warning",
          target: "ceMarking",
          article: "CE marking",
          ruleId: "CE-1",
          why: "CE marking status is 'marked' but the product is recorded as not bearing the CE mark.",
          fix: "Set ceMarking to true, or change ceMarkingStatus to `pending` if the assessment is not complete.",
        },
      ];
    }

    return [];
  },
};

/**
 * Conditional-rule registry. Categories ABSENT from this map have no
 * binding conditionals in force → the engine reports them `static-only`.
 * CC-1 runs for every category and is composed in by the engine, so it
 * is NOT listed per-category here.
 */
export const CONDITIONAL_RULES: Record<string, ConditionalRule[]> = {
  battery: [BAT1, BAT_APP, BAT_VAL, CE1],
  // CHEM-1 is REACH Art. 33, which binds by substance content, not by product
  // category. `chemicals` was split into these two successors; both carry
  // `svhcSubstances` and `svhcSubstanceName`, so both engage the rule.
  detergents: [CHEM1],
  "paints-coatings": [CHEM1],
  construction: [CON1, CE1],
  electronics: [CE1],
  steel: [CE1],
  toys: [CE1],
};

/** The cross-cutting rule the engine runs for every category. */
export const CROSS_CUTTING_RULES: ConditionalRule[] = [CC1];
