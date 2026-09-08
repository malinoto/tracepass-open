/**
 * Which battery categories are in scope for the EU battery passport at all.
 *
 * Art. 77 of Reg (EU) 2023/1542 hangs the passport on LMT, EV and industrial
 * batteries only. Portable and SLI batteries are covered by the Regulation for
 * other duties (labelling, collection, removability) but carry NO passport
 * obligation, and neither does industrial ≤ 2 kWh. The Commission's own data-point
 * guidance is scoped the same way — it enumerates applicability for "EV, LMT and
 * industrial batteries" and never addresses the other three categories.
 *
 * The template's `batteryCategory` enum offers all six values because it also
 * describes batteries we hold data about; the enum is NOT the scope list. Read
 * this module to answer "is a passport due", never the enum.
 *
 * Lives on its own so the compliance engine and the publish gate can share one
 * definition without importing each other. Both did carry their own copy, kept
 * in agreement by hand.
 */

/** Categories that owe a battery passport (BAT-1 / Art. 77(1)). */
export const IN_SCOPE_BATTERY_CATEGORIES = [
  "LMT",
  "EV",
  "industrial_gt_2kwh",
] as const;

export type InScopeBatteryCategory =
  (typeof IN_SCOPE_BATTERY_CATEGORIES)[number];

const IN_SCOPE = new Set<string>(IN_SCOPE_BATTERY_CATEGORIES);

/**
 * True when `category` owes a battery passport.
 *
 * An unset category returns `false` — absence of a category is not evidence of
 * an obligation. Callers that need to distinguish "out of scope" from "we don't
 * know yet" must check for `undefined` themselves; BAT-1 does exactly that so it
 * can raise `unverifiable_conditional` rather than silently passing.
 */
export function isInScopeBatteryCategory(
  category: string | undefined | null,
): boolean {
  return category != null && IN_SCOPE.has(category);
}
