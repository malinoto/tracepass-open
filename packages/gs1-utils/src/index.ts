/**
 * GS1 identifier utilities — GTIN, GLN, and Digital Link.
 *
 * Zero dependencies. QR-code rendering lives at the `@tracepass/gs1-utils/qr`
 * subpath so the core stays dependency-free.
 */

export {
  buildDigitalLinkUri,
  parseDigitalLinkUri,
  buildDigitalLinkSegments,
} from "./digital-link.js";

// `calculateCheckDigit` exists in both gln.ts and gtin.ts with the same mod-10
// algorithm but different length rules, so each is re-exported under its own
// name rather than colliding at the barrel.
export {
  validateGln,
  normalizeGln,
  calculateCheckDigit as calculateGlnCheckDigit,
} from "./gln.js";

export {
  validateGtin,
  calculateCheckDigit as calculateGtinCheckDigit,
} from "./gtin.js";

export { parseAcceptLanguage, detectLanguage } from "./language.js";
