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
 * XIII, and its per-category applicability matrix: EV batteries carry every
 * field; LMT omits the capacity-threshold-for-exhaustion field; industrial
 * batteries are conditional on BMS / rechargeable / external-storage gates.
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
 *   - hasBMS, rechargeable, externalStorageOnly — tri-state booleans on
 *                        `passport.batteryProfile` (a separate block, NOT
 *                        template fields — keeps the "91 fields" count
 *                        intact). Absent ⇒ the dependent gate resolves to
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
export interface FieldGate {
  /** Battery template field keys this gate governs. */
  keys: string[];
  /** Annex XIII / deck reference, for the verdict citation. */
  article: string;
  /** One-line reason, surfaced in the verdict + editor tooltip. */
  reason: string;
  /** Decide applicability from the resolved trigger values. */
  decide(t: Triggers): Applicability;
}

interface Triggers {
  category: string | undefined;
  hasBMS: boolean | undefined;
  rechargeable: boolean | undefined;
  externalStorageOnly: boolean | undefined;
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
  };
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
    // Deck 4(b): state of health (Art. 14) applies to stationary ESS / LMT
    // / EV batteries AND only if they have a battery management system.
    // We don't model "stationary ESS" as a distinct category, so we gate
    // on (in-scope category) AND (hasBMS). hasBMS absent ⇒ unknown.
    keys: ["stateOfHealth"],
    article: "Annex XIII 4(b) / Art. 14",
    reason: "State of health applies only to EV / LMT / stationary-storage batteries that have a battery management system (BMS).",
    decide: (t) => {
      if (t.category === undefined || t.hasBMS === undefined) return "unknown";
      const inScope = (IN_SCOPE_BATTERY_CATEGORIES as readonly string[]).includes(t.category);
      return inScope && t.hasBMS ? "applies" : "not_applicable";
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
    ],
    article: "Annex XIII 1(e) / Art. 8",
    reason: "Recycled-content information does not apply to batteries with external storage only.",
    decide: (t) => {
      if (t.externalStorageOnly === undefined) return "unknown";
      return t.externalStorageOnly ? "not_applicable" : "applies";
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
