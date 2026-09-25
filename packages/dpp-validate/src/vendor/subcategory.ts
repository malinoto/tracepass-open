/**
 * The passport's sub-category, read from the field its template category names.
 *
 * Mirrors `SUBCATEGORY_FIELD` in `@tracepass/extraction-core` without importing
 * the core, because this runs in client components (the passport editor) and the
 * core pulls in server-only modules. `tests/passports/subcategory.test.ts` pins
 * the two maps equal, so they cannot drift.
 *
 * `requiredBy` maps are keyed by these values; `effectiveRequiredFor` resolves
 * them. Unset → undefined → the field's plain `required` flag applies.
 */
export const SUBCATEGORY_FIELD: Readonly<Record<string, string>> = {
  battery: "batteryCategory",
  fmcg: "productSubcategory",
  detergents: "detergentUserType",
};

export function passportSubcategory(
  templateCategory: string | undefined,
  fields: Readonly<Record<string, { value?: unknown } | undefined>> | undefined,
): string | undefined {
  const key = templateCategory ? SUBCATEGORY_FIELD[templateCategory] : undefined;
  if (!key) return undefined;
  const v = fields?.[key]?.value;
  return v != null && v !== "" ? String(v) : undefined;
}
