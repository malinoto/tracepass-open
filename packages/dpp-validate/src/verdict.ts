/**
 * Compliance-verdict engine.
 *
 * Takes a passport, its template, and the category; returns a three-tier
 * verdict (compliant / compliant_with_warnings / incomplete) with
 * regulation-cited findings a caller can act on, then re-check after fixing
 * — the read → fix → verify loop.
 *
 * Pure and IO-free: no database, no network, no clock.
 *
 * Composition:
 *   static tier      — evaluateFieldRequirements (required fields,
 *                      status-independent) + required economic operators
 *                      (required-roles) + format validation
 *   conditional tier — CONDITIONAL_RULES[category] + CROSS_CUTTING_RULES
 *   coverage         — "evaluated" if the category has conditional rules,
 *                      else "static-only"
 *
 * Each finding cites the article of the instrument that mandates it, taken
 * from the template field's own `regulationRef`.
 */

import type { Passport, Template, TemplateField } from "@tracepass/dpp-types";
import { evaluateFieldRequirements } from "./vendor/publish-gate.js";
import { getPartyRoles } from "./vendor/required-roles.js";
import { derivePassportCounts } from "./vendor/counts.js";
import { categoryFieldApplicability } from "./vendor/battery-applicability.js";
import { CONDITIONAL_RULES, CROSS_CUTTING_RULES } from "./rules.js";
import type {
  ComplianceFinding,
  ComplianceResult,
  ComplianceVerdict,
  ConditionalCoverage,
} from "./types.js";

/** Validate a filled value against a template field's format rules.
 *  Returns a finding (warning) on mismatch, or null when clean. Empty
 *  values are NOT checked here — presence is the static field check's
 *  job; this only judges the SHAPE of values that ARE set. */
function checkFieldFormat(
  tf: TemplateField,
  value: unknown,
): ComplianceFinding | null {
  const v = tf.validation;
  const base = {
    type: "invalid_format" as const,
    severity: "warning" as const,
    target: tf.key,
    regulation: undefined as string | undefined,
    // Template JSON stores an absent article as an explicit `null`; findings
    // expose it as `undefined` so consumers only handle one absent case.
    article: tf.regulationRef?.article ?? undefined,
  };

  // enum / multi_enum: value(s) must be among the allowed options.
  if ((tf.dataType === "enum" || tf.dataType === "multi_enum") && tf.enumOptions) {
    const allowed = new Set(tf.enumOptions.map((o) => o.value));
    const vals = Array.isArray(value) ? value : [value];
    const bad = vals.filter((x) => !allowed.has(String(x)));
    if (bad.length > 0) {
      return { ...base, why: `Value "${bad.join(", ")}" is not one of the allowed options for ${tf.key}.`, fix: `Use one of: ${[...allowed].join(", ")}.` };
    }
  }

  // string-shaped checks (string / url). Bounds use `!= null` so an
  // explicit `null` in the template JSON (the seeded shape for "no
  // bound" — not `undefined`) is correctly treated as "no constraint"
  // rather than coercing to 0.
  if (typeof value === "string") {
    if (v.minLength != null && value.length < v.minLength) {
      return { ...base, why: `${tf.key} is shorter than the required ${v.minLength} characters.`, fix: `Provide at least ${v.minLength} characters.` };
    }
    if (v.maxLength != null && value.length > v.maxLength) {
      return { ...base, why: `${tf.key} exceeds the maximum ${v.maxLength} characters.`, fix: `Shorten to at most ${v.maxLength} characters.` };
    }
    if (v.pattern) {
      let re: RegExp | null = null;
      try { re = new RegExp(v.pattern); } catch { re = null; }
      if (re && !re.test(value)) {
        return { ...base, why: `${tf.key} doesn't match the required format.`, fix: `Expected format: ${tf.aiHints?.expectedFormat ?? v.pattern}.` };
      }
    }
  }

  // numeric bounds — `!= null` for the same reason (template carries
  // explicit `min: null` / `max: null`, which must not coerce to 0).
  if (typeof value === "number") {
    if (v.min != null && value < v.min) {
      return { ...base, why: `${tf.key} (${value}) is below the minimum ${v.min}.`, fix: `Use a value ≥ ${v.min}.` };
    }
    if (v.max != null && value > v.max) {
      return { ...base, why: `${tf.key} (${value}) is above the maximum ${v.max}.`, fix: `Use a value ≤ ${v.max}.` };
    }
  }

  return null;
}

/**
 * Evaluate a passport's compliance. `template` undefined → we can't
 * assess; returns an `incomplete` verdict with a single explanatory
 * critical finding (mirrors checkPublishReady's "template missing" hard
 * blocker rather than throwing).
 */
export function evaluateCompliance(
  passport: Passport,
  template: Template | undefined,
  category: string,
  /** Evaluation time for date-gated rules (BAT-2). Defaults to the current time. */
  now: Date = new Date(),
): ComplianceResult {
  const { completionPercentage } = derivePassportCounts(passport.fields);

  if (!template) {
    return {
      verdict: "incomplete",
      category,
      conditionalCoverage: "static-only",
      critical: [
        {
          type: "missing_field",
          severity: "critical",
          why: "No template is available for this passport, so compliance can't be evaluated.",
          fix: "Ensure the passport references a valid category template.",
        },
      ],
      warnings: [],
      checkedRules: [],
      completionPercentage,
    };
  }

  const critical: ComplianceFinding[] = [];
  const warnings: ComplianceFinding[] = [];
  const checkedRules: string[] = [];

  // ── Static tier 1: required fields ─────────────────────────────────
  checkedRules.push("static:required-fields");
  // Compute the gate-applicability map for conditional duties whose APPROVED
  // flag confirms the condition holds. evaluateFieldRequirements is called
  // directly (not via checkPublishReady) so published passports are not
  // short-circuited — live DPPs must be re-evaluated immediately when a
  // field or flag changes.
  const applicabilityMap = categoryFieldApplicability(passport, category);
  const { missingFields, unapprovedFields, conditionalMissingFields } =
    evaluateFieldRequirements(passport, template, applicabilityMap);
  const fieldRef = (key: string) =>
    template.fields.find((f) => f.key === key)?.regulationRef;
  for (const key of missingFields) {
    const ref = fieldRef(key);
    critical.push({
      type: "missing_field",
      severity: "critical",
      target: key,
      regulation: ref ? template.regulation?.number : undefined,
      article: ref?.article ?? undefined,
      why: `Required field "${key}" has no value.`,
      fix: `Provide a value for ${key}.`,
    });
  }
  for (const key of unapprovedFields) {
    critical.push({
      type: "unapproved_field",
      severity: "critical",
      target: key,
      why: `Required field "${key}" has a value but isn't approved yet.`,
      fix: `Review and approve ${key}.`,
    });
  }
  // Gate-confirmed conditional duties: the APPROVED flag makes the duty concrete
  // and the field must be present + approved. Same hard-block severity as a
  // statically-required field — the owner confirmed the condition holds.
  // "gate:conditional" is pushed when the category has gates (non-empty
  // applicabilityMap) so the caller knows whether gates were evaluated.
  if (Object.keys(applicabilityMap).length > 0) {
    checkedRules.push("gate:conditional");
  }
  for (const key of conditionalMissingFields) {
    const ref = fieldRef(key);
    const f = passport.fields[key];
    const isAbsent = f == null || f.value === null || f.value === undefined || f.value === "";
    critical.push({
      type: "missing_field",
      severity: "critical",
      ruleId: "gate:conditional",
      target: key,
      regulation: ref ? template.regulation?.number : undefined,
      article: ref?.article ?? undefined,
      why: isAbsent
        ? `Conditional field "${key}" is required because an approved condition flag confirms the duty applies, but the field has no value.`
        : `Conditional field "${key}" is required because an approved condition flag confirms the duty applies, but the value is not yet approved.`,
      fix: isAbsent
        ? `Provide and approve a value for ${key}.`
        : `Approve the value for ${key}.`,
    });
  }

  // ── Static tier 2: required economic-operator parties ──────────────
  checkedRules.push("static:required-parties");
  const roles = getPartyRoles(category);
  if (roles) {
    for (const role of roles.required) {
      if (!passport.parties?.[role]) {
        critical.push({
          type: "missing_party",
          severity: "critical",
          target: role,
          why: `Required economic operator "${role}" is not set for a ${category} passport.`,
          fix: `Add the ${role} party (legal name + GS1 GLN where available).`,
        });
      }
    }
  }

  // ── Static tier 3: format of filled values (warnings) ──────────────
  checkedRules.push("static:format");
  for (const tf of template.fields) {
    const f = passport.fields[tf.key];
    if (!f || f.value === null || f.value === undefined || f.value === "") continue;
    const bad = checkFieldFormat(tf, f.value);
    if (bad) warnings.push(bad);
  }

  // ── Conditional tier: per-category + cross-cutting ─────────────────
  const categoryRules = CONDITIONAL_RULES[category] ?? [];
  const conditionalCoverage: ConditionalCoverage =
    categoryRules.length > 0 ? "evaluated" : "static-only";

  for (const rule of [...categoryRules, ...CROSS_CUTTING_RULES]) {
    checkedRules.push(rule.id);
    for (const finding of rule.run(passport, template, { now })) {
      (finding.severity === "critical" ? critical : warnings).push(finding);
    }
  }

  const verdict: ComplianceVerdict =
    critical.length > 0
      ? "incomplete"
      : warnings.length > 0
        ? "compliant_with_warnings"
        : "compliant";

  return {
    verdict,
    category,
    conditionalCoverage,
    critical,
    warnings,
    checkedRules,
    completionPercentage,
  };
}
