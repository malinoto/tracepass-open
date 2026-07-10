/**
 * Pure helpers for rolling passport-field status counts up into the
 * `fieldCounts` and `completionPercentage` denormalized on the passport row.
 *
 * The same derivation logic was duplicated across the field edit, batch edit,
 * review, and agent-pipeline paths — getting it in one place means the number
 * the UI shows is always consistent no matter which writer touched the fields
 * last.
 */

import type { FieldStatus } from "@tracepass/dpp-types";

export interface FieldCounts {
  total: number;
  empty: number;
  pendingReview: number;
  approved: number;
  flagged: number;
}

export interface PassportFieldsRollup {
  fieldCounts: FieldCounts;
  completionPercentage: number;
}

/** Narrow shape — we only care about the status of each field to roll counts up. */
export interface CountableField {
  status: FieldStatus;
}

/**
 * completionPercentage is explicitly the share of approved fields, not the
 * share of non-empty fields — a field that's pending_review or flagged is
 * *known about* but not yet confirmed, so it doesn't count as done.
 */
export function derivePassportCounts(
  fields: Record<string, CountableField>
): PassportFieldsRollup {
  const values = Object.values(fields);
  const total = values.length;
  const fieldCounts: FieldCounts = {
    total,
    empty: values.filter((f) => f.status === "empty").length,
    pendingReview: values.filter((f) => f.status === "pending_review").length,
    approved: values.filter((f) => f.status === "approved").length,
    flagged: values.filter((f) => f.status === "flagged").length,
  };
  const completionPercentage =
    total > 0 ? Math.round((fieldCounts.approved / total) * 100) : 0;
  return { fieldCounts, completionPercentage };
}
