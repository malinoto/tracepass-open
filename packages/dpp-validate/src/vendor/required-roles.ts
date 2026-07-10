/**
 * Per-category required and optional party roles.
 *
 * Source of truth for "which parties does this passport need before it can
 * be considered complete." Used by:
 *   - the editor UI (red asterisks on required roles, hides irrelevant ones)
 *   - the CSV bulk-import column generator (only emits columns for roles
 *     this category actually uses)
 *   - the publish-precondition check (warns on missing required roles, in
 *     parallel to the existing missing-required-fields warning)
 *   - the per-passport completionPercentage calculation
 *
 * The TypeScript module is the single source of truth — the role map is
 * NOT mirrored into the templates collection. Adding or removing roles
 * from a category is a code change + deploy, deliberate so we don't drift
 * the regulation interpretation across environments.
 *
 * v1 design calls (per Malin's confirmation):
 *   - Chemicals "downstream user" (REACH-specific role) → folded into
 *     `distributor` for now; revisit when a chemicals customer pulls.
 *   - Tyre "retreader" → ignored for v1; retreaded tyres treated as a
 *     separate passport whose `manufacturer` is the retreader.
 *
 * When a category's regulation tightens (a new delegated act lands and
 * adds a mandate), update the entry here and the change ships in the
 * next deploy — no template re-seed needed.
 */

import type { PartyRole } from "@tracepass/dpp-types";

/**
 * The 12 categories the platform models. Mirrors the filenames in
 * `templates/*.json`. We re-declare the union here rather than import
 * a CategoryKey from elsewhere so this module stays the canonical
 * place a future contributor looks when adding a 13th category.
 */
export type CategoryKey =
  | "battery"
  | "chemicals"
  | "construction"
  | "electronics"
  | "fmcg"
  | "furniture"
  | "jewelry"
  | "packaging"
  | "steel"
  | "textile"
  | "toys"
  | "tyres";

export interface CategoryPartyRoles {
  /** Roles that MUST be set before the passport is considered complete.
   *  The publish flow warns (not blocks) when these are missing — a
   *  user can still publish via the existing "I acknowledge incomplete"
   *  ack, which sets `publishedIncomplete: true`. */
  required: readonly PartyRole[];
  /** Roles that the editor surfaces but doesn't require. Order matters —
   *  the UI renders them in this order under the required block. */
  optional: readonly PartyRole[];
}

/**
 * Per-category role requirements. Each entry's `required` is the
 * regulator's mandate; `optional` is roles that a tenant might
 * legitimately want to record but isn't compelled to.
 */
export const CATEGORY_PARTY_ROLES: Record<CategoryKey, CategoryPartyRoles> = {
  // Battery Regulation 2023/1542 Articles 47–50 require all three
  // operators to be identifiable on the passport for serial-level
  // batteries (LMT, EV, industrial >2 kWh).
  battery: {
    required: ["manufacturer", "recycler", "producerResponsibilityOrg"],
    optional: ["importer", "authorisedRepresentative", "distributor"],
  },

  // RoHS / WEEE / RED / EMC — manufacturer is mandatory for any
  // EU placement; AR + importer become mandatory for non-EU
  // manufacturers under Article 4 of the relevant directive, but
  // since we can't tell at schema time whether the manufacturer is
  // EU or not, we keep them optional and let the editor surface
  // them when the manufacturer's `country` is non-EU.
  electronics: {
    required: ["manufacturer"],
    optional: ["importer", "authorisedRepresentative", "distributor", "recycler"],
  },

  // Toy Safety Directive 2009/48 Article 4 — both manufacturer and
  // importer are mandatory for non-EU toys, the most common case.
  toys: {
    required: ["manufacturer", "importer"],
    optional: ["authorisedRepresentative", "distributor"],
  },

  // PPWR 2025/40 Article 11 + national packaging EPR schemes —
  // PRO required where the EPR scheme applies (most EU member states).
  fmcg: {
    required: ["manufacturer", "producerResponsibilityOrg"],
    optional: ["importer", "distributor", "recycler"],
  },

  // PPWR Articles 7 + 45 — packaging materials themselves carry
  // direct PRO obligations.
  packaging: {
    required: ["manufacturer", "producerResponsibilityOrg"],
    optional: ["importer", "distributor", "recycler"],
  },

  // Textile EPR is national (DE, FR, NL have schemes; harmonised
  // EU rules pending). Keep PRO optional until ESPR delegated act
  // mandates it. Manufacturer canonical.
  textile: {
    required: ["manufacturer"],
    optional: ["producerResponsibilityOrg", "importer", "distributor", "recycler"],
  },

  // No EU-level operator mandate beyond CE for upholstered furniture
  // (national flammability rules in IT/UK/FR). Manufacturer canonical.
  furniture: {
    required: ["manufacturer"],
    optional: ["importer", "distributor"],
  },

  // REACH places obligations on manufacturer + importer + downstream
  // user. v1 maps "downstream user" to `distributor` per design call;
  // revisit when a chemicals customer pulls.
  chemicals: {
    required: ["manufacturer"],
    optional: ["importer", "distributor", "authorisedRepresentative"],
  },

  // CPR 2024/3110 — manufacturer mandatory; AR for non-EU
  // construction-product placers.
  construction: {
    required: ["manufacturer"],
    optional: ["importer", "distributor", "authorisedRepresentative"],
  },

  // Tyre Labelling Reg (EU) 2020/740 places obligations on the
  // manufacturer. Retreader role deferred to v2 — see module doc.
  tyres: {
    required: ["manufacturer"],
    optional: ["importer", "distributor"],
  },

  // CBAM places obligations on the importer of CBAM goods, not
  // the steel-mill DPP itself. Manufacturer canonical here.
  steel: {
    required: ["manufacturer"],
    optional: ["importer", "distributor"],
  },

  // REACH SVHC notification — manufacturer canonical; no specific
  // party-mandate beyond that for fine jewellery.
  jewelry: {
    required: ["manufacturer"],
    optional: ["importer", "distributor"],
  },
} as const;

/**
 * Get the required + optional role lists for a category. Returns
 * `null` when the category isn't one of the 12 modeled categories,
 * so callers can early-return rather than crash on legacy / unknown
 * category strings.
 */
export function getPartyRoles(
  category: string,
): CategoryPartyRoles | null {
  return CATEGORY_PARTY_ROLES[category as CategoryKey] ?? null;
}

/**
 * True when `role` is required for the given category. Used by the
 * publish-precondition check + the editor's red-asterisk render.
 * Unknown categories return false (don't block on what we can't
 * interpret).
 */
export function isRequiredRole(category: string, role: PartyRole): boolean {
  const roles = getPartyRoles(category);
  return roles?.required.includes(role) ?? false;
}

/**
 * Combined role list (required first, then optional, in declaration
 * order). Returns `[]` for unknown categories. Convenience for UI
 * iteration when both sets need to render.
 */
export function allRolesForCategory(category: string): readonly PartyRole[] {
  const roles = getPartyRoles(category);
  if (!roles) return [];
  return [...roles.required, ...roles.optional];
}
