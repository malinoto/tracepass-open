/**
 * Types for the compliance-verdict engine.
 *
 * The engine answers, for one passport: "is this DPP compliant, and if not,
 * what's missing — citing the regulation?" It composes three tiers of check:
 *
 *   1. STATIC      — required template fields present + approved, required
 *                    economic-operator parties present, filled values well-
 *                    formed (pattern/enum/bounds). Applies to every category.
 *   2. CONDITIONAL — per-category rules that only fire under a condition
 *                    (e.g. battery passport required IF category is EV/LMT/
 *                    industrial>2kWh; EU operator required IF manufacturer
 *                    non-EU). Three categories carry binding conditionals —
 *                    battery, chemicals, construction — plus one cross-cutting
 *                    rule that applies to every category.
 *   3. COVERAGE    — the engine self-reports whether conditionals were
 *                    evaluated or the category is static-only, so an agent
 *                    NEVER reads silence as "compliant".
 *
 * Severity → verdict:
 *   - any `critical`  → "incomplete"
 *   - else any `warning` → "compliant_with_warnings"
 *   - else            → "compliant"
 */

export type ComplianceVerdict =
  | "compliant"
  | "compliant_with_warnings"
  | "incomplete";

/** Did per-category conditional rules actually run for this passport's
 *  category, or does no binding conditional exist yet (static-only)? */
export type ConditionalCoverage = "evaluated" | "static-only";

export type FindingSeverity = "critical" | "warning";

export type FindingType =
  /** A required template field has no value (static tier). */
  | "missing_field"
  /** A field has a value but isn't approved yet (static tier). */
  | "unapproved_field"
  /** A required economic-operator party isn't set (static tier). */
  | "missing_party"
  /** A filled value violates the template's pattern/enum/bounds (static tier). */
  | "invalid_format"
  /** A conditional rule fired and its required field/party is missing. */
  | "conditional_missing"
  /** A conditional rule should apply but its trigger field is absent, so the
   *  engine couldn't evaluate it — surfaced as a warning, never silent. */
  | "unverifiable_conditional";

export interface ComplianceFinding {
  type: FindingType;
  severity: FindingSeverity;
  /** Field key or party role this finding concerns, when applicable. */
  target?: string;
  /** Regulation number, e.g. "(EU) 2023/1542". Present for conditional
   *  findings and for static findings whose field carries a regulationRef. */
  regulation?: string;
  /** Article / annex citation, e.g. "Art. 77" / "Annex VI". */
  article?: string;
  /** Short rule id from the verified spec (e.g. "BAT-1", "CC-1"). */
  ruleId?: string;
  /** One-line human explanation of why this matters. */
  why: string;
  /** One-line, actionable next step for the agent / user. */
  fix?: string;
}

export interface ComplianceResult {
  verdict: ComplianceVerdict;
  category: string;
  conditionalCoverage: ConditionalCoverage;
  /** Findings that force "incomplete". */
  critical: ComplianceFinding[];
  /** Findings that downgrade to "compliant_with_warnings" but don't block. */
  warnings: ComplianceFinding[];
  /** Rule ids that actually ran (static checks + every conditional rule
   *  evaluated). Lets an agent see WHAT was checked, not just the result. */
  checkedRules: string[];
  /** Completion metric, mirrors the passport's approved/total field ratio. */
  completionPercentage: number;
}
