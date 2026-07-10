/**
 * QR code generation for GS1 Digital Link URIs.
 *
 * Uppercases the scheme + domain portion so the QR encoder can use
 * alphanumeric mode for those characters, producing a smaller (denser) code.
 */

import QRCode from "qrcode";

/**
 * Uppercase the scheme and domain of a URI to allow QR alphanumeric encoding.
 * e.g. "https://id.tracepass.eu/01/…" → "HTTPS://ID.TRACEPASS.EU/01/…"
 *
 * Only the scheme + authority are uppercased; the path is left as-is because
 * serial numbers may be case-sensitive.
 */
function uppercaseSchemeAndDomain(uri: string): string {
  try {
    const url = new URL(uri);
    const schemePlusDomain = `${url.protocol}//${url.host}`;
    return uri.replace(schemePlusDomain, schemePlusDomain.toUpperCase());
  } catch {
    // If not a valid URL, return as-is
    return uri;
  }
}

/**
 * Generate a QR code PNG buffer for the given URI.
 *
 * - Error correction level M (15 % recovery)
 * - Margin: 4 modules
 * - Width: 300 px
 * - Scheme + domain uppercased for smaller QR
 *
 * @param uri - full GS1 Digital Link URI
 * @returns PNG image as a Node.js Buffer
 */
export async function generateQrCode(uri: string): Promise<Buffer> {
  const optimizedUri = uppercaseSchemeAndDomain(uri);

  const buffer = await QRCode.toBuffer(optimizedUri, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 300,
    type: "png",
  });

  return buffer;
}
