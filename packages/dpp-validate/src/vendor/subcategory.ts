/**
 * The passport's sub-category, read from the field its template category names.
 *
 * The map lives here, with no dependencies, so it can run anywhere this package does.
 *
 * `requiredBy` maps are keyed by these values; `effectiveRequiredFor` resolves
 * them. Unset → undefined → the field's plain `required` flag applies.
 */
export const SUBCATEGORY_FIELD: Readonly<Record<string, string>> = {
  battery: "batteryCategory",
  fmcg: "productSubcategory",
  detergents: "detergentUserType",
};

/**
 * Read the passport's sub-category value (battery category, FMCG sub-category,
 * detergent user type) from the field the template category designates.
 * @param templateCategory - the template's category
 * @param fields - the passport fields keyed by field key
 * @returns the sub-category value, or undefined when the category has none or the field is unset
 */
export function passportSubcategory(
  templateCategory: string | undefined,
  fields: Readonly<Record<string, { value?: unknown } | undefined>> | undefined,
): string | undefined {
  const key = templateCategory ? SUBCATEGORY_FIELD[templateCategory] : undefined;
  if (!key) return undefined;
  const v = fields?.[key]?.value;
  if (typeof v === "string") return v === "" ? undefined : v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  return undefined;
}
