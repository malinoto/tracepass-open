/**
 * Pure "can this passport be published?" check, shared between:
 *   - GET /api/passports (list response includes publishReady per row)
 *   - POST /api/passports/[id]/publish (single-publish eligibility)
 *   - POST /api/passports/bulk-publish (skipped-reason messages)
 *
 * One rule, one implementation. If the product policy for publishing
 * changes (e.g. "warnings block", "min coverage %"), change it here.
 *
 * ⚠️ MIRRORED INTO THE PUBLIC npm PACKAGE @tracepass/dpp-validate.
 * `tracepass-open/packages/dpp-validate/src/vendor/publish-gate.ts` is a hand-copy of this
 * file — nothing generates one from the other, and a stale copy fails silently
 * (it still compiles and still returns a plausible answer). tracepass-open
 * gates on a hash of this file in CI, so after changing it:
 *
 *   cd ../tracepass-open && node scripts/build-mirror-manifest.mjs \
 *     && npm run check:mirrors
 *
 * and commit `mirror-manifest.json` with the code.
 */

import { passportSubcategory } from "./subcategory.js";
import type { Passport, Template, TemplateField } from "@tracepass/dpp-types";
import { isInScopeBatteryCategory } from "./battery-scope.js";
import { isFieldAbsent } from "./field-emptiness.js";

/** Applicability value returned by the condition-gate engine. */
export type GateApplicability = "applies" | "not_applicable" | "unknown";

export interface PublishCheck {
  ready: boolean;
  /** Field keys that have no value set. */
  missingFields: string[];
  /** Field keys with a value but status != approved. */
  unapprovedFields: string[];
  /**
   * Field keys with `requiredBy[category] === "conditional"` whose gate
   * resolved `"applies"` (from an APPROVED flag) and the field is empty.
   * This is a HARD publish block — stricter than a soft gap, because the
   * owner has confirmed the condition holds.
   */
  conditionalMissingFields: string[];
  /** Short human reason suitable for a tooltip or toast — undefined when ready. */
  reason?: string;
  /**
   * Distinguishes WHY the passport isn't ready:
   *   - "hard"        → structural blocker that can't be bypassed
   *                     (already-published, wrong status, template missing).
   *   - "gap"         → required fields are missing or unapproved. The UI
   *                     can offer to publish anyway with an explicit "I
   *                     understand the risk" acknowledgement.
   *   - "conditional" → a condition-flag gate confirmed a duty applies and
   *                     the field is empty. Hard block, same as "hard".
   *   - `undefined` when ready === true.
   */
  blockerType?: "hard" | "gap" | "conditional";
}

const PUBLISHABLE_STATUSES = new Set<Passport["status"]>([
  "draft",
  "in_review",
  "approved",
]);

/**
 * Resolves whether a template field is effectively required for a specific
 * battery category:
 *
 *   1. No `requiredBy` map → fall back to `validation.required`.
 *      This is the backward-compat path: ALL 11 non-battery templates and
 *      any battery field without a `requiredBy` entry behave exactly as before.
 *   2. Category present in the map → "required" is true; "conditional" and
 *      "notApplicable" are false.
 *   3. Category absent from the map, or unset on the passport → base required.
 *
 * `requiredBy` maps are keyed ONLY by the three in-scope categories, so step 3
 * is what a portable or SLI battery would otherwise land on — see
 * `effectiveRequiredForBattery`, which callers holding a battery passport should
 * use instead.
 *
 * @param tf        A template field (from the template's `fields` array).
 * @param category  The resolved `batteryCategory` value from the passport, or
 *                  `undefined` when the field is unset.
 */
export function effectiveRequired(
  tf: Pick<TemplateField, "validation">,
  category: string | undefined,
): boolean {
  const { requiredBy, required } = tf.validation;

  // Path 1 & 3: no map, or category not a key in the map → base required.
  if (!requiredBy || category === undefined || !(category in requiredBy)) {
    return required;
  }

  // Path 2: explicit per-category applicability.
  return requiredBy[category] === "required";
}

/**
 * Battery-aware wrapper around `effectiveRequired`.
 *
 * A portable, SLI or industrial-≤2 kWh battery owes NO battery passport at all
 * (Art. 77(1) — see `isInScopeBatteryCategory`), so no Annex XIII field is
 * mandatory for it. Resolving those categories through `effectiveRequired`
 * alone lands on the base `required` flag, which would demand the full
 * category-agnostic field set from a battery that has no passport obligation —
 * an obligation we would be inventing.
 *
 * An UNSET category still falls through to the base flag. That is deliberate:
 * absence of a category is not evidence of exemption, and treating "not yet
 * filled in" as "nothing required" would let a genuine EV battery publish empty.
 * BAT-1 raises a warning for the unset case instead.
 *
 * Non-battery templates never reach the scope branch — they carry no
 * `batteryCategory`, so `category` is `undefined` and behaviour is unchanged.
 */
export function effectiveRequiredForBattery(
  tf: Pick<TemplateField, "validation">,
  category: string | undefined,
): boolean {
  if (category !== undefined && !isInScopeBatteryCategory(category)) {
    return false;
  }
  return effectiveRequired(tf, category);
}

/**
 * `effectiveRequired` for any template: the battery scope rule
 * (`effectiveRequiredForBattery`) applies to battery templates only, since a
 * non-battery sub-category such as "laundry" is not an out-of-scope battery.
 */
export function effectiveRequiredFor(
  templateCategory: string,
  tf: Pick<TemplateField, "validation">,
  subcategory: string | undefined,
): boolean {
  return templateCategory === "battery"
    ? effectiveRequiredForBattery(tf, subcategory)
    : effectiveRequired(tf, subcategory);
}

/**
 * True when the template EXPLICITLY marks this field `notApplicable` for the
 * given category — i.e. the Regulation says it must not be filled or displayed.
 *
 * Distinct from "not required" in the way that matters for a compliance
 * surface: a `conditional` field may legitimately be filled and simply isn't
 * mandatory, whereas a `notApplicable` one carries an instruction NOT to report
 * it (the Annex XIII 4(b) state-of-health exclusions are the live example — an
 * EV battery must leave the granular metrics blank and an LMT battery must
 * leave SOCE blank). Rendering those as "not provided" reads as missing data
 * when the truth is that there is nothing to provide.
 *
 * Returns false when the category is unset or the field carries no map —
 * absence of information is never grounds for asserting non-applicability.
 */
export function notApplicableForCategory(
  tf: Pick<TemplateField, "validation">,
  category: string | undefined,
): boolean {
  const { requiredBy } = tf.validation;
  if (!requiredBy || category === undefined) return false;
  return requiredBy[category] === "notApplicable";
}

/** The field-level findings returned by `evaluateFieldRequirements`. */
export interface FieldRequirements {
  missingFields: string[];
  unapprovedFields: string[];
  conditionalMissingFields: string[];
}

/**
 * Evaluate field-level requirements for a passport against its template,
 * status-independently. Called by both `checkPublishReady` (which adds
 * status early-returns) and `evaluateCompliance` (which must run even on
 * published passports so live DPPs are re-evaluated after a template or
 * flag change).
 *
 * Returns three buckets:
 *   - `missingFields`            — statically required, no value set
 *   - `unapprovedFields`         — statically required, value set but not approved
 *   - `conditionalMissingFields` — gate-confirmed conditional duty, absent
 *                                   OR present-but-unapproved (hard block)
 *
 * `applicabilityMap` is pre-computed by the caller via
 * `categoryFieldApplicability(passport, template.category)`. Pass `{}` for
 * non-battery categories — the gate branch is then a no-op. Keeping it
 * injected preserves the IO-free/pure contract of this function.
 */
export function evaluateFieldRequirements(
  passport: Passport,
  template: Template,
  applicabilityMap: Record<string, GateApplicability> = {},
): FieldRequirements {
  // The passport's sub-category, read from the field the template category
  // names (battery: batteryCategory, fmcg: productSubcategory, detergents:
  // detergentUserType; core SUBCATEGORY_FIELD), so effectiveRequired can
  // resolve `requiredBy`. Unset → undefined → the plain `required` flag.
  const category = passportSubcategory(template.category, passport.fields);

  const missingFields: string[] = [];
  const unapprovedFields: string[] = [];
  const conditionalMissingFields: string[] = [];

  for (const tf of template.fields) {
    // `anticipated` fields rest on a delegated act that has not been adopted,
    // so no instrument in force compels the data and their absence cannot block
    // publication. Skip them before the required check.
    if (tf.validation.anticipated) continue;

    const f = passport.fields[tf.key];

    // ── Gate-aware conditional check ────────────────────────────────────────
    // A field with requiredBy[category] === "conditional" is normally not
    // required. When a gate's APPROVED flag confirms the condition applies,
    // the field becomes required and its absence is a HARD publish block.
    // An unapproved value (pending_review) is also a hard block — consistent
    // with the owner's decision that conditional duties are non-bypassable.
    // "unknown" (absent or pending_review FLAG) → skip here; the rules engine
    // emits an unverifiable_conditional warning via BAT-APP but never blocks.
    const rb = tf.validation.requiredBy;
    if (
      applicabilityMap[tf.key] === "applies" &&
      rb &&
      category !== undefined &&
      rb[category] === "conditional"
    ) {
      if (isFieldAbsent(f)) {
        conditionalMissingFields.push(tf.key);
      } else if (f.status !== "approved") {
        // Field is present but not yet confirmed — same hard block as absent,
        // because an unreviewed value satisfies neither the owner nor the law.
        conditionalMissingFields.push(tf.key);
      }
      // Don't fall through to the static required check — the gate owns this
      // field's requirement for this passport.
      continue;
    }

    // ── Static required check ────────────────────────────────────────────────
    if (!effectiveRequiredFor(template.category, tf, category)) continue;
    // Shared helper: `[]` stays a valid answer ("none apply"), while a
    // whitespace-only string now counts as missing — the inline `=== ""` it
    // replaces let "   " satisfy a required field and publish a blank.
    if (isFieldAbsent(f)) {
      missingFields.push(tf.key);
    } else if (f.status !== "approved") {
      unapprovedFields.push(tf.key);
    }
  }

  return { missingFields, unapprovedFields, conditionalMissingFields };
}

/**
 * Returns whether `passport` satisfies every publish precondition given
 * its `template`. A passport is publish-ready iff:
 *   - status is in PUBLISHABLE_STATUSES (already-published + terminal
 *     states return ready:false with a specific reason),
 *   - every template field whose effective required flag (resolved via
 *     `effectiveRequired` — which consults `requiredBy` when present) is
 *     true has a non-empty value AND status === "approved",
 *   - every `requiredBy[category] === "conditional"` field whose gate
 *     resolves `"applies"` (from an APPROVED condition flag) also has a
 *     non-empty value AND status === "approved" (hard block, same severity
 *     as a structural blocker).
 *
 * `undefined` template means we can't evaluate — treat as not-ready.
 *
 * @param applicabilityMap  Pre-computed gate-applicability map (field key →
 *   "applies" | "not_applicable" | "unknown"). Computed by the caller using
 *   `categoryFieldApplicability(passport, template.category)`. Pass `{}` or
 *   omit for non-battery passports (no change in behaviour). Keeping it
 *   injected preserves the IO-free/pure contract of this function.
 */
export function checkPublishReady(
  passport: Passport,
  template: Template | undefined,
  applicabilityMap: Record<string, GateApplicability> = {},
): PublishCheck {
  if (passport.status === "published") {
    return {
      ready: false,
      missingFields: [],
      unapprovedFields: [],
      conditionalMissingFields: [],
      reason: "Already published",
      blockerType: "hard",
    };
  }

  if (!PUBLISHABLE_STATUSES.has(passport.status)) {
    return {
      ready: false,
      missingFields: [],
      unapprovedFields: [],
      conditionalMissingFields: [],
      reason: `Cannot publish from status ${passport.status}`,
      blockerType: "hard",
    };
  }

  if (!template) {
    return {
      ready: false,
      missingFields: [],
      unapprovedFields: [],
      conditionalMissingFields: [],
      reason: "Template missing",
      blockerType: "hard",
    };
  }

  const { missingFields, unapprovedFields, conditionalMissingFields } =
    evaluateFieldRequirements(passport, template, applicabilityMap);

  if (
    missingFields.length === 0 &&
    unapprovedFields.length === 0 &&
    conditionalMissingFields.length === 0
  ) {
    return {
      ready: true,
      missingFields: [],
      unapprovedFields: [],
      conditionalMissingFields: [],
    };
  }

  const parts: string[] = [];
  if (conditionalMissingFields.length > 0)
    parts.push(`${conditionalMissingFields.length} conditional-required missing`);
  if (missingFields.length > 0) parts.push(`${missingFields.length} missing`);
  if (unapprovedFields.length > 0) parts.push(`${unapprovedFields.length} not approved`);

  // Hard block when any conditional-required field is missing; soft gap otherwise.
  const blockerType: "hard" | "gap" | "conditional" =
    conditionalMissingFields.length > 0 ? "conditional" : "gap";

  return {
    ready: false,
    missingFields,
    unapprovedFields,
    conditionalMissingFields,
    reason: `Required fields: ${parts.join(", ")}`,
    blockerType,
  };
}
