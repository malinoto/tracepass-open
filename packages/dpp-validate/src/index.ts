/**
 * Evaluate a Digital Product Passport against its category field-spec.
 *
 * `evaluateCompliance` takes a passport and its template as plain objects and
 * returns a three-tier verdict with regulation-cited findings. It reads no
 * database and makes no network calls.
 */

import type { Passport } from "@tracepass/dpp-types";
import { categoryFieldApplicability } from "./vendor/battery-applicability.js";
import type { Applicability } from "./vendor/battery-applicability.js";

export { evaluateCompliance } from "./verdict.js";

export type {
  ComplianceVerdict,
  ComplianceResult,
  ComplianceFinding,
  ConditionalCoverage,
  FindingSeverity,
  FindingType,
} from "./types.js";

export { isEuEeaCountry } from "./eu-countries.js";

export { CONDITIONAL_RULES, CROSS_CUTTING_RULES } from "./rules.js";
export type { ConditionalRule } from "./rules.js";

// The platform's own gates (vendor/, mirrored and hash-checked by
// mirror-manifest.json), so the public package and the platform cannot disagree.
export { IN_SCOPE_BATTERY_CATEGORIES } from "./vendor/battery-scope.js";
export {
  BATTERY_FIELD_GATES,
  GATED_FIELD_KEYS,
  gateForKey,
} from "./vendor/battery-applicability.js";
export type { Applicability, FieldGate } from "./vendor/battery-applicability.js";

/**
 * Full map for the gated fields only (callers default everything else to
 * "applies"). The verdict engine iterates this to emit findings; the
 * editor reads it once per render and looks up per field.
 *
 * Returns an empty map for non-battery passports — `category` here is the
 * template category, NOT batteryCategory; callers pass it so this is a
 * no-op outside battery and the predicate stays battery-scoped.
 * @param passport - the passport to evaluate
 * @param category - the template category
 * @returns the applicability of each gated field key
 * @deprecated Use `categoryFieldApplicability` instead. Kept for backward compat.
 */
export function batteryFieldApplicability(
  passport: Passport,
  category: string,
): Record<string, Applicability> {
  return categoryFieldApplicability(passport, category);
}

// Re-exported because a passport's publish-readiness and required economic
// operators are part of judging whether it is compliant, not separate concerns.
export { checkPublishReady } from "./vendor/publish-gate.js";
// Exported alongside the gate: a caller rendering a form needs the same
// per-category answer the gate uses, or its asterisks disagree with its verdict.
export { effectiveRequired, effectiveRequiredForBattery } from "./vendor/publish-gate.js";
export { isInScopeBatteryCategory } from "./vendor/battery-scope.js";
export { isFieldAbsent, isFieldValueAbsent } from "./vendor/field-emptiness.js";
export {
  getPartyRoles,
  isRequiredRole,
  allRolesForCategory,
  CATEGORY_PARTY_ROLES,
} from "./vendor/required-roles.js";
export type { CategoryKey } from "./vendor/required-roles.js";
export { derivePassportCounts } from "./vendor/counts.js";
