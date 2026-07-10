/**
 * GS1 Digital Link URI utilities.
 *
 * A Digital Link URI encodes a GTIN (AI 01) and serial number (AI 21) as
 * path segments:
 *
 *   https://example.com/01/<gtin>/21/<serial>
 *
 * See: https://www.gs1.org/standards/gs1-digital-link
 */

/** GS1 Application Identifier for GTIN */
const AI_GTIN = "01";
/** GS1 Application Identifier for serial number */
const AI_SERIAL = "21";

/**
 * Build a GS1 Digital Link URI from components.
 *
 * @param domain  - fully qualified domain (e.g. "id.tracepass.eu")
 * @param gtin    - 14-digit GTIN
 * @param serialNumber - product serial number (percent-encoded if needed)
 * @returns full URI, e.g. "https://id.tracepass.eu/01/01234567890128/21/ABC-123"
 */
export function buildDigitalLinkUri(
  domain: string,
  gtin: string,
  serialNumber: string,
): string {
  const cleanDomain = domain.replace(/\/+$/, "");
  const encodedSerial = encodeURIComponent(serialNumber);
  return `https://${cleanDomain}/${AI_GTIN}/${gtin}/${AI_SERIAL}/${encodedSerial}`;
}

/**
 * Parse a GS1 Digital Link URI and extract GTIN + serial number.
 * Accepts URIs with or without scheme.
 *
 * @returns parsed components or null if the URI doesn't match the expected pattern
 */
export function parseDigitalLinkUri(
  uri: string,
): { gtin: string; serialNumber: string } | null {
  // Strip scheme + authority to get the path.
  // Handles https://domain/01/…, http://domain/01/…, or bare path /01/…
  const match = uri.match(
    /\/01\/(\d{14})\/21\/([^/?#]+)/,
  );
  if (!match) return null;

  return {
    gtin: match[1],
    serialNumber: decodeURIComponent(match[2]),
  };
}

/**
 * Build the path segments array for the [...uri] catch-all route.
 * Returns e.g. ["01", "01234567890128", "21", "ABC-123"]
 */
export function buildDigitalLinkSegments(
  gtin: string,
  serialNumber: string,
): string[] {
  return [AI_GTIN, gtin, AI_SERIAL, encodeURIComponent(serialNumber)];
}
