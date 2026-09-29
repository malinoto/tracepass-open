/**
 * Generalised condition-profile accessor.
 *
 * `conditionProfile` (the new field) wins when present; falls back to the
 * legacy `batteryProfile` block, adapting it to the `ConditionFlag` shape
 * (audit defaults to []). This mirrors the `gs1` → `identifier` precedence
 * pattern: old data stays readable without a migration, and new writes land
 * in the canonical location.
 *
 * **Use `resolveConditionProfile` everywhere** instead of reading
 * `passport.batteryProfile` directly — this is the single source of truth
 * for "what condition flags has a reviewer set?".
 *
 * Pure + IO-free → unit-tested in tests/compliance/condition-profile.test.ts.
 */

import type { Passport, ConditionProfile } from "@tracepass/dpp-types";

/**
 * Return the effective condition profile for a passport, regardless of which
 * storage field holds the data.
 *
 * - If `passport.conditionProfile` is present (even as `{}`), return it as-is.
 *   An empty conditionProfile means "all flags cleared" — it must NOT fall back
 *   to batteryProfile, or clearing the last flag would resurrect legacy data.
 * - Otherwise, adapt `passport.batteryProfile` (the legacy shape, which lacks
 *   per-flag audit arrays) to the `ConditionProfile` shape with `audit: []`.
 * - If neither is set, return an empty object.
 */
export function resolveConditionProfile(passport: Pick<Passport, "conditionProfile" | "batteryProfile">): ConditionProfile {
  if (passport.conditionProfile !== undefined) {
    return passport.conditionProfile;
  }
  const bp = passport.batteryProfile;
  if (!bp) return {};
  const out: ConditionProfile = {};
  for (const [key, flag] of Object.entries(bp) as [string, typeof bp[keyof typeof bp]][]) {
    if (flag != null) {
      out[key] = {
        value: flag.value,
        status: flag.status,
        source: flag.source,
        audit: [],
      };
    }
  }
  return out;
}
