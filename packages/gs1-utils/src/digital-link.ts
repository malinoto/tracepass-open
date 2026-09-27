/**
 * GS1 Digital Link URI utilities.
 *
 * A Digital Link URI encodes a GTIN (AI 01) and serial number (AI 21) as
 * path segments:
 *
 *   https://example.com/01/<gtin>/21/<serial>
 *
 * Accepts GTIN-8, GTIN-12, GTIN-13 and GTIN-14 on input; always emits
 * 14-digit GTINs in the URI. GS1 guarantees that any GTIN format becomes a
 * valid GTIN-14 when left-padded to 14 digits with zeros — the check digit
 * is preserved. For 14-digit inputs the behaviour is byte-identical to prior
 * versions.
 *
 * See: https://www.gs1.org/standards/gs1-digital-link
 *
 * ⚠️ MIRRORED INTO THE PUBLIC npm PACKAGE @tracepass/gs1-utils.
 * `tracepass-open/packages/gs1-utils/src/digital-link.ts` is a hand-copy of this
 * file — nothing generates one from the other, and a stale copy fails silently
 * (it still compiles and still returns a plausible answer). tracepass-open
 * gates on a hash of this file in CI, so after changing it:
 *
 *   cd ../tracepass-open && node scripts/build-mirror-manifest.mjs \
 *     && npm run check:mirrors
 *
 * and commit `mirror-manifest.json` with the code.
 */

/** GS1 Application Identifier for GTIN */
const AI_GTIN = "01";
/** GS1 Application Identifier for serial number */
const AI_SERIAL = "21";

/**
 * Left-pad a GTIN-8, -12, -13, or -14 to 14 digits.
 * No check-digit validation — callers that need validation use normalizeGtin
 * from gtin.ts. A 14-digit input is returned unchanged (byte-identical to the
 * prior single-length behaviour).
 */
function padToGtin14(gtin: string): string {
  switch (gtin.length) {
    case 8:  return "000000" + gtin;
    case 12: return "00"     + gtin;
    case 13: return "0"      + gtin;
    default: return gtin; // 14 digits: unchanged. Other lengths: pass through.
  }
}

/**
 * Build a GS1 Digital Link URI from components.
 *
 * @param domain  - fully qualified domain, no scheme (e.g. "id.tracepass.eu")
 * @param gtin    - GTIN-8, GTIN-12, GTIN-13, or GTIN-14; always emitted as 14 digits
 * @param serialNumber - product serial number (percent-encoded if needed)
 * @returns full URI, e.g. "https://id.tracepass.eu/01/01234567890128/21/ABC-123"
 */
export function buildDigitalLinkUri(
  domain: string,
  gtin: string,
  serialNumber: string,
): string {
  const cleanDomain = domain.replace(/\/+$/, "");
  const gtin14 = padToGtin14(gtin);
  const encodedSerial = encodeURIComponent(serialNumber);
  return `https://${cleanDomain}/${AI_GTIN}/${gtin14}/${AI_SERIAL}/${encodedSerial}`;
}

/**
 * Parse a GS1 Digital Link URI and extract GTIN + serial number.
 * Accepts URIs with or without scheme. Accepts GTIN-8, -12, -13, and -14 in
 * the path; always returns the GTIN normalised to 14 digits.
 *
 * @returns parsed components or null if the URI doesn't match the expected pattern
 */
export function parseDigitalLinkUri(
  uri: string,
): { gtin: string; serialNumber: string } | null {
  // Strip scheme + authority to get the path.
  // Handles https://domain/01/…, http://domain/01/…, or bare path /01/…
  // Accepts any of the four valid GTIN lengths in the path segment.
  const match = uri.match(
    /\/01\/(\d{8}|\d{12}|\d{13}|\d{14})\/21\/([^/?#]+)/,
  );
  if (!match) return null;

  return {
    gtin: padToGtin14(match[1]),
    serialNumber: decodeURIComponent(match[2]),
  };
}

/**
 * Build the path segments array for the [...uri] catch-all route.
 * Returns e.g. ["01", "01234567890128", "21", "ABC-123"]
 * GTIN is normalised to 14 digits.
 */
export function buildDigitalLinkSegments(
  gtin: string,
  serialNumber: string,
): string[] {
  return [AI_GTIN, padToGtin14(gtin), AI_SERIAL, encodeURIComponent(serialNumber)];
}
