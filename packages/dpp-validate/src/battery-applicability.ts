/**
 * Battery field-applicability predicate — the single source of truth for
 * "does this Annex XIII field apply to *this* battery?"
 *
 * Consumed by the compliance verdict engine, which flags a filled field that
 * doesn't apply and warns when applicability can't be determined. A passport
 * editor can use the same predicate to collapse not-applicable fields rather
 * than asking a reviewer for data the regulation doesn't require.
 *
 * Derives from Regulation (EU) 2023/1542 (the EU Battery Regulation), Annex
 * XIII, Art. 14(1) and Annex VII Parts A and B. EV batteries do NOT carry every
 * field: the capacity threshold for exhaustion and the state of certified
 * energy are EV-only, while the remaining-capacity and expected-lifetime sets
 * apply to LMT batteries and stationary battery energy storage systems only.
 * Industrial batteries are conditional on the BMS / rechargeable /
 * external-storage / stationary-storage flags.
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
 *                        block, NOT template fields — deliberately outside the
 *                        template field set, so they do not inflate its count).
 *                        Absent ⇒ the dependent gate resolves to
 *                        "unknown" (show + warn), not a guess.
 *
 * Pure + IO-free → unit-tested in tests/compliance/battery-applicability.test.ts.
 */

import type { Passport, BatteryProfile } from "@tracepass/dpp-types";

export type Applicability = "applies" | "not_applicable" | "unknown";

/** Battery categories that are *in scope* for a battery passport at all
 *  (BAT-1). Used only to keep this module self-contained; the passport-
 *  level scope gate still lives in rules.ts BAT-1. */
export const IN_SCOPE_BATTERY_CATEGORIES = ["LMT", "EV", "industrial_gt_2kwh"] as const;

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
 */
function confirmed(flag: BatteryProfile[keyof BatteryProfile]): boolean | undefined {
  if (!flag) return undefined;
  return flag.status === "approved" ? flag.value : undefined;
}

function readTriggers(passport: Passport): Triggers {
  const cat = passport.fields["batteryCategory"];
  const profile = passport.batteryProfile;
  return {
    category: cat && cat.value != null && cat.value !== "" ? String(cat.value) : undefined,
    hasBMS: confirmed(profile?.hasBMS),
    rechargeable: confirmed(profile?.rechargeable),
    externalStorageOnly: confirmed(profile?.externalStorageOnly),
    isStationaryBess: confirmed(profile?.isStationaryBess),
  };
}

/**
 * Is this battery an Art. 14(1) subject (state-of-health / expected-lifetime
 * data applies)?  Art. 14(1) covers EV, LMT, and stationary battery energy
 * storage systems — NOT other industrial batteries.
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
 * other categories; unknown when category absent or isStationaryBess unset.
 */
function sbessOrLmt(t: Triggers): Applicability {
  if (t.category === undefined) return "unknown";
  if (t.category === "LMT") return "applies";
  if (t.category === "industrial_gt_2kwh") {
    if (t.isStationaryBess === true) return "applies";
    if (t.isStationaryBess === false) return "not_applicable";
    return "unknown";
  }
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
    // Annex XIII 4(b) / Art. 14(1): state of health applies to SBESS, LMT,
    // and EV batteries with a BMS. A plain industrial battery that is NOT a
    // stationary ESS does NOT owe state-of-health data.
    keys: ["stateOfHealth"],
    article: "Annex XIII 4(b) / Art. 14",
    fixHint: SBESS_FIX_HINT,
    reason: "State of health (Art. 14) applies only to stationary battery energy storage systems, LMT, and EV batteries that have a battery management system (BMS). A plain industrial (>2 kWh) battery that is not a stationary storage system does not owe this data.",
    decide: (t) => {
      const a14 = art14Subject(t);
      if (a14 === false || t.hasBMS === false) return "not_applicable";
      if (a14 === undefined || t.hasBMS === undefined) return "unknown";
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
    reason: "Recycled-content information does not apply to batteries with external storage only.",
    decide: (t) => {
      if (t.externalStorageOnly === undefined) return "unknown";
      return t.externalStorageOnly ? "not_applicable" : "applies";
    },
  },
  {
    // Annex XIII 4(b) / Art. 14: state of certified energy (SOCE) applies
    // only to electric-vehicle (EV) batteries.
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
    // power capability, remaining round-trip efficiency, self-discharge
    // evolution, pack ohmic resistance, and initial self-discharge rate apply
    // only to SBESS and LMT batteries — NOT EV, and NOT plain industrial
    // batteries that are not stationary storage systems.
    keys: [
      "remainingCapacity",
      "remainingPowerCapability",
      "remainingRoundTripEfficiency",
      "evolutionOfSelfDischargeRate",
      "currentInternalResistancePack",
      "initialSelfDischargeRate",
    ],
    article: "Annex XIII 4(b) / Art. 14 / Annex VII Part A",
    fixHint: SBESS_FIX_HINT,
    reason: "Remaining capacity and related Annex VII Part A metrics apply only to LMT batteries and stationary battery energy storage systems.",
    decide: sbessOrLmt,
  },
  {
    // Annex XIII 4(b) / Art. 14 / Annex VII Part B: expected-lifetime
    // parameters apply only to SBESS and LMT batteries.
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
export function batteryFieldApplicability(
  passport: Passport,
  category: string,
): Record<string, Applicability> {
  if (category !== "battery") return {};
  const triggers = readTriggers(passport);
  const out: Record<string, Applicability> = {};
  for (const gate of BATTERY_FIELD_GATES) {
    const verdict = gate.decide(triggers);
    for (const k of gate.keys) out[k] = verdict;
  }
  return out;
}

/** Look up the gate metadata (article + reason) for a gated field key. */
export function gateForKey(key: string): FieldGate | undefined {
  return KEY_TO_GATE.get(key);
}
