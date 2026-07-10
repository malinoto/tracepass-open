/**
 * Pure "can this passport be published?" check, shared between:
 *   - GET /api/passports (list response includes publishReady per row)
 *   - POST /api/passports/[id]/publish (single-publish eligibility)
 *   - POST /api/passports/bulk-publish (skipped-reason messages)
 *
 * One rule, one implementation. If the product policy for publishing
 * changes (e.g. "warnings block", "min coverage %"), change it here.
 */

import type { Passport, Template } from "@tracepass/dpp-types";

export interface PublishCheck {
  ready: boolean;
  /** Field keys that have no value set. */
  missingFields: string[];
  /** Field keys with a value but status != approved. */
  unapprovedFields: string[];
  /** Short human reason suitable for a tooltip or toast — undefined when ready. */
  reason?: string;
  /**
   * Distinguishes WHY the passport isn't ready:
   *   - "hard"  → structural blocker that can't be bypassed
   *               (already-published, wrong status, template missing).
   *   - "gap"   → required fields are missing or unapproved. The UI
   *               can offer to publish anyway with an explicit "I
   *               understand the risk" acknowledgement.
   *   - `undefined` when ready === true.
   */
  blockerType?: "hard" | "gap";
}

const PUBLISHABLE_STATUSES = new Set<Passport["status"]>([
  "draft",
  "in_review",
  "approved",
]);

/**
 * Returns whether `passport` satisfies every publish precondition given
 * its `template`. A passport is publish-ready iff:
 *   - status is in PUBLISHABLE_STATUSES (already-published + terminal
 *     states return ready:false with a specific reason),
 *   - every template field with validation.required has a non-empty
 *     value AND status === "approved".
 *
 * `undefined` template means we can't evaluate — treat as not-ready.
 */
export function checkPublishReady(
  passport: Passport,
  template: Template | undefined,
): PublishCheck {
  if (passport.status === "published") {
    return {
      ready: false,
      missingFields: [],
      unapprovedFields: [],
      reason: "Already published",
      blockerType: "hard",
    };
  }

  if (!PUBLISHABLE_STATUSES.has(passport.status)) {
    return {
      ready: false,
      missingFields: [],
      unapprovedFields: [],
      reason: `Cannot publish from status ${passport.status}`,
      blockerType: "hard",
    };
  }

  if (!template) {
    return {
      ready: false,
      missingFields: [],
      unapprovedFields: [],
      reason: "Template missing",
      blockerType: "hard",
    };
  }

  const missingFields: string[] = [];
  const unapprovedFields: string[] = [];

  for (const tf of template.fields) {
    if (!tf.validation.required) continue;
    const f = passport.fields[tf.key];
    if (
      !f ||
      f.value === null ||
      f.value === undefined ||
      f.value === ""
    ) {
      missingFields.push(tf.key);
    } else if (f.status !== "approved") {
      unapprovedFields.push(tf.key);
    }
  }

  if (missingFields.length === 0 && unapprovedFields.length === 0) {
    return { ready: true, missingFields: [], unapprovedFields: [] };
  }

  const parts: string[] = [];
  if (missingFields.length > 0) parts.push(`${missingFields.length} missing`);
  if (unapprovedFields.length > 0) parts.push(`${unapprovedFields.length} not approved`);

  return {
    ready: false,
    missingFields,
    unapprovedFields,
    reason: `Required fields: ${parts.join(", ")}`,
    blockerType: "gap",
  };
}
