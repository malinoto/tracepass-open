/**
 * Validate and parse EU Digital Product Passport identifiers per EN 18219.
 *
 * Pure functions over plain objects — no network, no database, no dependencies
 * beyond the sibling `@tracepass/dpp-types` (types) and `@tracepass/gs1-utils`
 * (GTIN/GLN check-digit arithmetic).
 *
 * Exported API:
 *
 *   validateProductIdentifier(id, { category? })  — validate any of the five
 *     EN 18219 product schemes; add `category: "battery"` to apply the
 *     Battery Regulation Art. 77(3) restriction (gs1 + iso15459 only).
 *
 *   validateOperatorIdentifier(id)  — validate ISO/IEC 6523 (LEI/GLN/DUNS),
 *     GLN, DID and DOI operator identifiers.
 *
 *   validateFacilityIdentifier(id)  — validate GLN facility identifiers.
 *
 *   identifierToUri(id, resolverBase)  — build a resolver URL (null for
 *     iec61406/did/doi, which carry their own URL).
 *
 *   identifierOwnUrl(id)  — the identifier's own canonical URL when it has one.
 *
 *   parseResolverPath(path)  — inverse of identifierToUri for gs1 and iso15459.
 *
 *   identifierKey(id)  — a stable string key for deduplication.
 *
 *   normalizeDoi(input)  — strip doi:/https://doi.org/ prefixes; returns null
 *     on invalid syntax.
 */

export { validateProductIdentifier } from "./product.js";
export type { ValidationResult, ValidateProductOptions } from "./product.js";
export { normalizeDoi } from "./product.js";

export { validateOperatorIdentifier, validateFacilityIdentifier } from "./operator.js";

export {
  identifierToUri,
  identifierOwnUrl,
  parseResolverPath,
  identifierKey,
} from "./uri.js";
