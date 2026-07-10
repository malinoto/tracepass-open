/**
 * Evaluate a Digital Product Passport against its category field-spec.
 *
 * `evaluateCompliance` takes a passport and its template as plain objects and
 * returns a three-tier verdict with regulation-cited findings. It reads no
 * database and makes no network calls.
 */

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

export {
  CONDITIONAL_RULES,
  CROSS_CUTTING_RULES,
} from "./rules.js";
export type { ConditionalRule } from "./rules.js";

export {
  IN_SCOPE_BATTERY_CATEGORIES,
  BATTERY_FIELD_GATES,
  GATED_FIELD_KEYS,
  batteryFieldApplicability,
  gateForKey,
} from "./battery-applicability.js";
export type { Applicability, FieldGate } from "./battery-applicability.js";

// Re-exported because a passport's publish-readiness and required economic
// operators are part of judging whether it is compliant, not separate concerns.
export { checkPublishReady } from "./vendor/publish-gate.js";
export { getPartyRoles, isRequiredRole, allRolesForCategory, CATEGORY_PARTY_ROLES } from "./vendor/required-roles.js";
export type { CategoryKey } from "./vendor/required-roles.js";
export { derivePassportCounts } from "./vendor/counts.js";
