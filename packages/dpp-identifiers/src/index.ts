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
 *   identifierToUri(id, resolverBase)  — build a resolver URL; iso15459 emits
 *     the ISO/IEC 18975 query form `?.25P=...[&.S=...]` per EN 18219 §5.2.2.
 *     Null for iec61406/did/doi, which carry their own URL.
 *
 *   identifierOwnUrl(id)  — the identifier's own canonical URL when it has one.
 *
 *   parseDiQuery(queryString)  — parse the ISO/IEC 18975 `?.25P=...[&.S=...]`
 *     query string back to `{ concatenated25P, serial? }`.
 *
 *   diQueryCandidateKeys(concatenated25P, serial?)  — generate up to 3 candidate
 *     `identifierKey` strings by trying IAC lengths 1, 2 and 3.
 *
 *   parseResolverPath(path)  — inverse of identifierToUri for gs1; also parses
 *     legacy iso15459 agency paths for backward compatibility.
 *
 *   identifierKey(id)  — a stable string key for deduplication.
 *
 *   normalizeDoi(input)  — strip doi:/https://doi.org//(dx.)doi.org/ prefixes;
 *     enforces printable-ASCII (ISO/IEC 646); returns null on invalid syntax.
 *
 *   resolveProductIdentifier(passport)  — read the canonical ProductIdentifier,
 *     preferring `identifier` over the deprecated `gs1` field.
 */

export { validateProductIdentifier } from "./product.js";
export type { ValidationResult, ValidateProductOptions } from "./product.js";
export { normalizeDoi } from "./product.js";

export { validateOperatorIdentifier, validateFacilityIdentifier } from "./operator.js";

export {
  identifierToUri,
  identifierOwnUrl,
  parseResolverPath,
  parseDiQuery,
  diQueryCandidateKeys,
  identifierKey,
} from "./uri.js";

export { resolveProductIdentifier } from "./passport.js";
