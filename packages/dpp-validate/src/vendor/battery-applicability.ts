/**
 * Battery field-applicability predicate — the SINGLE source of truth for
 * "does this Annex XIII field apply to *this* battery?", consumed by both:
 *
 *   - the compliance verdict engine (rules.ts) — flags a filled field that
 *     doesn't apply, or warns when applicability can't be determined; and
 *   - the passport editor UI (PassportEditor.tsx) — soft-collapses
 *     not-applicable fields so a reviewer isn't asked for data the
 *     regulation doesn't require for their battery type.
 *
 * Source: DG GROW battery-passport webinar 27 May 2026, slide 36
 * (per-category applicability matrix) + the cross-reference/scope-gate
 * slides; Reg. (EU) 2023/1542 Art. 14(1) + Annex VII Parts A and B.
 * Analysis: knowledgebase/regulations/dpp-battery-webinar-2026-05.md.
 * Spec home: knowledgebase/regulations/dpp-conditional-rules.md.
 *
 * Design contract — the SAFETY rule that makes A safe:
 *   "unknown" (a gate's trigger field is absent) ⇒ treat as APPLIES for the
 *   UI (show the field) and as `unverifiable_conditional` for the verdict
 *   (warn, never assert). We NEVER hide or suppress a field on uncertainty —
 *   a mis-classified battery must never lose a legally-required field.
 *
 * Triggers:
 *   - batteryCategory  — a real template field in battery.json (enum: LMT |
 *                        EV | industrial_gt_2kwh | industrial_lte_2kwh | SLI
 *                        | portable). Read from `passport.fields`.
 *   - hasBMS, rechargeable, externalStorageOnly, isStationaryBess — tri-state
 *                        booleans on `passport.batteryProfile` (a separate
 *                        block, NOT template fields — keeps the template's
 *                        field count intact). Absent ⇒ the dependent gate
 *                        resolves to "unknown" (show + warn), not a guess.
 *
 * Pure + IO-free → unit-tested in tests/compliance/battery-applicability.test.ts.
 */

import type { Passport } from "@tracepass/dpp-types";
import { resolveConditionProfile } from "./condition-profile.js";
import { IN_SCOPE_BATTERY_CATEGORIES } from "./battery-scope.js";

export type Applicability = "applies" | "not_applicable" | "unknown";

/** Battery categories that are *in scope* for a battery passport at all.
 *  Re-exported from the shared definition so this module's consumers keep
 *  importing it from here; the passport-level scope gate is rules.ts BAT-1. */
export { IN_SCOPE_BATTERY_CATEGORIES };

/** Field keys whose applicability is conditional, with a short reason +
 *  the deck article they map to. Everything NOT listed here is always
 *  "applies". Kept as data so the rules engine + editor can enumerate the
 *  conditional set and so a reader can audit each gate against the deck. */
/** Remediation for the gates that depend on `isStationaryBess`. */
const SBESS_FIX_HINT =
  "For an industrial (>2 kWh) battery, confirm whether it is a stationary battery energy storage system: Art. 14 state-of-health and Annex VII expected-lifetime data apply only to stationary storage systems, LMT and (for state of health) EV batteries.";

export interface FieldGate {
  /** Battery template field keys this gate governs. */
  keys: string[];
  /** Annex XIII / deck reference, for the verdict citation. */
  article: string;
  /** One-line reason, surfaced in the verdict + editor tooltip. */
  reason: string;
  /** Extra remediation, for gates that turn on the stationary-storage flag. */
  fixHint?: string;
  /** Decide applicability from the resolved trigger values. */
  decide(t: Triggers): Applicability;
}

interface Triggers {
  category: string | undefined;
  hasBMS: boolean | undefined;
  rechargeable: boolean | undefined;
  externalStorageOnly: boolean | undefined;
  isStationaryBess: boolean | undefined;
}

/**
 * Resolve a profile flag to a confirmed boolean. Only an `approved` flag
 * counts — a `pending_review` (AI-suggested, unconfirmed) flag resolves to
 * `undefined` ("unknown") so it can NEVER hard-hide a field. This is the
 * safety contract: AI may suggest, but gating tightens only on confirmation.
 *
 * Accepts any object with `value: boolean` and `status: string` — works for
 * both the legacy `BatteryProfileFlag` and the new `ConditionFlag`.
 */
function confirmed(flag: { value: boolean; status: string } | undefined): boolean | undefined {
  if (!flag) return undefined;
  return flag.status === "approved" ? flag.value : undefined;
}

function readTriggers(passport: Passport): Triggers {
  const cat = passport.fields["batteryCategory"];
  // Use the canonical accessor so conditionProfile (new) and batteryProfile
  // (legacy) both work through the same path.
  const profile = resolveConditionProfile(passport);
  return {
    category: cat && cat.value != null && cat.value !== "" ? String(cat.value) : undefined,
    hasBMS: confirmed(profile["hasBMS"]),
    rechargeable: confirmed(profile["rechargeable"]),
    externalStorageOnly: confirmed(profile["externalStorageOnly"]),
    isStationaryBess: confirmed(profile["isStationaryBess"]),
  };
}

/**
 * Is this battery an Art. 14(1) subject (state-of-health / expected-lifetime
 * data applies)?  Art. 14(1) covers EV, LMT, and stationary battery energy
 * storage systems — NOT other industrial batteries.
 *
 * Returns:
 *   true      — EV or LMT (deterministic from category alone)
 *   true/false — industrial_gt_2kwh resolved through isStationaryBess
 *   undefined — category absent (cannot determine) or
 *               industrial_gt_2kwh with isStationaryBess unconfirmed
 *   false     — any other category (portable, SLI, industrial_lte_2kwh)
 */
function art14Subject(t: Triggers): boolean | undefined {
  if (t.category === undefined) return undefined;
  if (t.category === "EV" || t.category === "LMT") return true;
  if (t.category === "industrial_gt_2kwh") return t.isStationaryBess;
  return false;
}

/**
 * Annex VII Part A + B applicability: applies for LMT; for industrial_gt_2kwh
 * only when confirmed as a stationary BESS; not_applicable for EV and all
 * other categories; unknown when category is absent or isStationaryBess unset.
 *
 * Used for: the Annex VII Part A cluster (remaining capacity, pack resistance,
 * etc.) and the Annex VII Part B cluster (expected-lifetime: capacity/energy
 * throughput, date of service entry).
 */
function sbessOrLmt(t: Triggers): Applicability {
  if (t.category === undefined) return "unknown";
  if (t.category === "LMT") return "applies";
  if (t.category === "industrial_gt_2kwh") {
    if (t.isStationaryBess === true) return "applies";
    if (t.isStationaryBess === false) return "not_applicable";
    return "unknown";
  }
  // EV uses SOCE instead; portable / SLI / industrial_lte_2kwh are out of scope.
  return "not_applicable";
}

/**
 * The conditional gates, one per applicability rule from the deck. Order
 * doesn't matter — each governs a disjoint set of field keys.
 */
export const BATTERY_FIELD_GATES: FieldGate[] = [
  {
    // Deck 1(k): "capacity threshold for exhaustion (only for electric
    // vehicle batteries)". Resolvable today — trigger is batteryCategory.
    keys: ["capacityThresholdForExhaustion"],
    article: "Annex XIII 1(k)",
    reason: "Capacity threshold for exhaustion applies only to electric-vehicle (EV) batteries.",
    decide: (t) => {
      if (t.category === undefined) return "unknown";
      return t.category === "EV" ? "applies" : "not_applicable";
    },
  },
  {
    // Annex XIII 4(b) / Art. 14(1): state of health applies to stationary
    // battery energy storage systems (SBESS), LMT, and EV batteries — and
    // only when they have a battery management system. A plain industrial
    // battery that is NOT a stationary ESS does NOT owe state-of-health data.
    // art14Subject encodes the Art. 14(1) subject set; hasBMS is the second
    // condition. Either being false → not_applicable; either absent → unknown.
    keys: ["stateOfHealth"],
    article: "Annex XIII 4(b) / Art. 14",
    fixHint: SBESS_FIX_HINT,
    reason: "State of health (Art. 14) applies only to stationary battery energy storage systems, LMT, and EV batteries that have a battery management system (BMS). A plain industrial (>2 kWh) battery that is not a stationary storage system does not owe this data.",
    decide: (t) => {
      const a14 = art14Subject(t);
      // Either axis definitively false → field does not apply.
      if (a14 === false || t.hasBMS === false) return "not_applicable";
      // Either axis unknown (category absent, or SBESS unconfirmed) → cannot determine.
      if (a14 === undefined || t.hasBMS === undefined) return "unknown";
      // Both confirmed true → applies.
      return "applies";
    },
  },
  {
    // Deck (c): carbon footprint cross-references Art. 7, which is
    // rechargeable-only ("If the battery is non-rechargeable, (c) remains
    // empty"). rechargeable absent ⇒ unknown.
    keys: [
      "carbonFootprintTotal",
      "carbonFootprintPerformanceClass",
      "carbonFootprintLabel",
      "carbonFootprintStudyUrl",
      "cfRawMaterialAcquisition",
      "cfMainProductProduction",
      "cfDistribution",
      "cfEndOfLifeRecycling",
    ],
    article: "Annex XIII 1(c) / Art. 7",
    reason: "Carbon-footprint declaration applies only to rechargeable batteries.",
    decide: (t) => {
      if (t.rechargeable === undefined) return "unknown";
      return t.rechargeable ? "applies" : "not_applicable";
    },
  },
  {
    // Deck (e): recycled content cross-references Art. 8 ("If the battery
    // has external storage only, (e) remains empty"). externalStorageOnly
    // absent ⇒ unknown.
    keys: [
      "recycledContentCobalt",
      "recycledContentLead",
      "recycledContentLithium",
      "recycledContentNickel",
      "recycledContentDocumentation",
      // Pre/post-consumer split-shares (Annex XIII 1(e)) carry the same gate
      // as the combined figures above — external-storage-only batteries are exempt.
      "preConsumerRecycledNickelShare",
      "preConsumerRecycledCobaltShare",
      "preConsumerRecycledLithiumShare",
      "postConsumerRecycledNickelShare",
      "postConsumerRecycledCobaltShare",
      "postConsumerRecycledLithiumShare",
    ],
    article: "Annex XIII 1(e) / Art. 8",
    reason: "Recycled-content information does not apply to industrial batteries with exclusively external storage.",
    decide: (t) => {
      // Art. 8(1) exempts only "industrial batteries … except those with
      // exclusively external storage"; EV and LMT batteries owe it regardless.
      if (t.category !== undefined && t.category !== "industrial_gt_2kwh") return "applies";
      if (t.externalStorageOnly === undefined) return "unknown";
      return t.externalStorageOnly ? "not_applicable" : "applies";
    },
  },
  {
    // Annex XIII 4(b) / Art. 14: state of certified energy (SOCE) applies
    // only to electric-vehicle (EV) batteries. Resolvable from batteryCategory.
    keys: ["stateOfCertifiedEnergy"],
    article: "Annex XIII 4(b) / Art. 14",
    reason: "State of certified energy (SOCE) applies only to electric-vehicle (EV) batteries.",
    decide: (t) => {
      if (t.category === undefined) return "unknown";
      return t.category === "EV" ? "applies" : "not_applicable";
    },
  },
  {
    // Annex XIII 4(b) / Art. 14 / Annex VII Part A: remaining capacity /
    // power capability, remaining round-trip efficiency (DP 64), self-discharge
    // evolution, pack ohmic resistance, and initial self-discharge rate apply
    // only to SBESS and LMT batteries — NOT EV (which has SOCE instead), and
    // NOT plain industrial batteries that are not stationary storage systems.
    // Art. 14(1) subjects: SBESS + LMT + EV. Annex VII Part A applies to
    // SBESS + LMT. sbessOrLmt() resolves this correctly.
    // NOTE: roundTripEfficiencyFade (DP 58) is "if applicable" in ALL THREE
    // guidance columns and therefore is NOT in this gate — it applies to EV too.
    keys: [
      "remainingCapacity",
      "remainingPowerCapability",
      "remainingRoundTripEfficiency",
      "evolutionOfSelfDischargeRate",
      "currentInternalResistancePack",
      // initialSelfDischargeRate cites Annex VII Part A(4) — same applicability
      // as the rest of the Part A cluster.
      "initialSelfDischargeRate",
    ],
    article: "Annex XIII 4(b) / Art. 14 / Annex VII Part A",
    fixHint: SBESS_FIX_HINT,
    reason: "Remaining capacity, remaining power capability, remaining round-trip efficiency, self-discharge evolution, pack ohmic resistance, and initial self-discharge rate (Annex VII Part A) apply only to LMT batteries and stationary battery energy storage systems, not EV or non-stationary industrial batteries.",
    decide: sbessOrLmt,
  },
  {
    // Annex XIII 4(b) / Art. 14 / Annex VII Part B: expected-lifetime
    // parameters — capacity throughput, energy throughput, and date of first
    // service entry — apply only to SBESS and LMT batteries (Annex VII Part B).
    // EV carries SOCE + the capacity-threshold gate instead; a plain industrial
    // battery that is not a stationary storage system does not owe this data.
    // The template already marks these notApplicable for EV via requiredBy;
    // the gate enforces that at the applicability-warning layer too.
    keys: [
      "capacityThroughput",
      "energyThroughput",
      "dateOfServiceEntry",
    ],
    article: "Annex XIII 4(b) / Art. 14 / Annex VII Part B",
    fixHint: SBESS_FIX_HINT,
    reason: "Expected-lifetime parameters (Annex VII Part B) apply only to LMT batteries and stationary battery energy storage systems.",
    decide: sbessOrLmt,
  },
  {
    // Phase 1 — rechargeable gate: 12 performance fields that derive from the
    // Art. 10(1) performance document, which only exists for rechargeable batteries.
    //
    // Category awareness: EV and LMT batteries are inherently rechargeable by
    // definition — no flag check is needed. The gate always returns "applies" for
    // those categories, matching the "required" entries in the template's requiredBy
    // map. For industrial_gt_2kwh the flag is decisive: an approved rechargeable=true
    // promotes the conditional template entry to a hard publish block; rechargeable=false
    // means the Art. 10(1) duty does not arise.
    //
    // Note: dynamicEnergyRoundTripEfficiency (DP 57) is "if applicable" for ALL three
    // categories and is NOT in this gate — it carries no requiredBy map at all.
    //
    // Legal basis:
    //   Annex XIII 1(j)  — expected lifetime, cycle data, performance-fade metrics
    //   Annex XIII 1(n)  — initial / 50%-cycle-life round-trip efficiency
    //   Annex XIII 4(a)(i/ii/iv) — dynamic rated capacity, power, internal resistance
    //   Art. 10(1)       — performance document for rechargeable industrial >2 kWh,
    //                      EV, and LMT batteries
    keys: [
      // Static performance (Annex XIII 1(j)/(n) / Art. 10(1))
      "initialEnergyRoundTripEfficiency",
      "roundTripEfficiencyAtHalfCycleLife",
      // Expected lifetime (Annex XIII 4(c) / Art. 10(1))
      "expectedLifetimeCycles",
      "expectedLifetimeYears",
      "expectedLifetimeReferenceConditions",
      // Performance test parameters (Art. 10(1))
      "cRateRelevantCycleLifeTest",
      // State-of-health performance metrics (Art. 10(1) / Annex XIII 4(b) partial)
      "internalResistanceIncrease",
      "capacityFade",
      "powerFade",
      // Dynamic performance data (Annex XIII 4(a)(i/ii/iv)) — updated on status change
      // Note: 4(a)(iii) = dynamicEnergyRoundTripEfficiency is "if applicable" → not gated
      "dynamicRatedCapacity",
      "dynamicPowerCapability",
      "dynamicInternalResistance",
    ],
    article: "Annex XIII 1(j)/(n), 4(a)(i/ii/iv), Art. 10(1)",
    reason: "These performance fields come from the Art. 10(1) performance document (rechargeable industrial >2 kWh, EV, LMT). EV and LMT are inherently rechargeable; the flag governs industrial_gt_2kwh only.",
    decide: (t) => {
      // EV and LMT are rechargeable by definition — the flag is irrelevant for them.
      if (t.category === "EV" || t.category === "LMT") return "applies";
      // industrial_gt_2kwh: the rechargeable flag is decisive.
      if (t.rechargeable === undefined) return "unknown";
      return t.rechargeable ? "applies" : "not_applicable";
    },
  },
];

/** Pre-computed map from field key → the gate governing it. */
const KEY_TO_GATE = new Map<string, FieldGate>();
for (const gate of BATTERY_FIELD_GATES) {
  for (const k of gate.keys) KEY_TO_GATE.set(k, gate);
}

/** Every field key under any gate (the conditional set). */
export const GATED_FIELD_KEYS: ReadonlySet<string> = new Set(KEY_TO_GATE.keys());

/**
 * Applicability for a single battery field key. Ungated keys are always
 * "applies". This is the granular accessor the editor uses per-field.
 */
export function fieldApplicability(passport: Passport, key: string): Applicability {
  const gate = KEY_TO_GATE.get(key);
  if (!gate) return "applies";
  return gate.decide(readTriggers(passport));
}

/**
 * Full map for the gated fields only (callers default everything else to
 * "applies"). The verdict engine iterates this to emit findings; the
 * editor reads it once per render and looks up per field.
 *
 * Returns an empty map for non-battery passports — `category` here is the
 * template category, NOT batteryCategory; callers pass it so this is a
 * no-op outside battery and the predicate stays battery-scoped.
 */
/** @deprecated Use `categoryFieldApplicability` instead. Kept for backward compat. */
export function batteryFieldApplicability(
  passport: Passport,
  category: string,
): Record<string, Applicability> {
  return categoryFieldApplicability(passport, category);
}

/** Look up the gate metadata (article + reason) for a gated field key. */
export function gateForKey(key: string): FieldGate | undefined {
  return KEY_TO_GATE.get(key);
}

/**
 * CATEGORY_FIELD_GATES — generalised gate registry, keyed by template category.
 *
 * Phase 1: battery only. Other categories gain entries when their conditional
 * rules are encoded. Battery gates are unchanged from BATTERY_FIELD_GATES; the
 * two names refer to the same array.
 *
 * Callers that need to enumerate gates for a category use this registry.
 * The battery-specific `batteryFieldApplicability` is now a thin wrapper.
 */
export const CATEGORY_FIELD_GATES: Record<string, FieldGate[]> = {
  battery: BATTERY_FIELD_GATES,
};

/**
 * Compute the applicability map for all gated fields of any category.
 * Returns {} for categories with no gates (safe to iterate).
 *
 * Replaces the battery-only early return in `batteryFieldApplicability` with a
 * generic path: every category that has gates in CATEGORY_FIELD_GATES is handled,
 * everything else is a no-op. `batteryFieldApplicability` is kept as a
 * backward-compat alias.
 */
export function categoryFieldApplicability(
  passport: Passport,
  category: string,
): Record<string, Applicability> {
  const gates = CATEGORY_FIELD_GATES[category];
  if (!gates || gates.length === 0) return {};
  const triggers = readTriggers(passport);
  const out: Record<string, Applicability> = {};
  for (const gate of gates) {
    const verdict = gate.decide(triggers);
    for (const k of gate.keys) out[k] = verdict;
  }
  return out;
}
