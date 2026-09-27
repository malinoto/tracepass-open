/**
 * Identifier URI construction and parsing for the EN 18219 resolver path.
 *
 * identifierToUri   — build a resolver URL from any ProductIdentifier.
 *   gs1     → Digital Link path `/01/<gtin14>/21/<encoded-serial>`
 *   iso15459 → `/<agency>/<encoded-primaryId>[/<encoded-serial>]`
 *   iec61406 / did / doi → null (they carry their own canonical URL)
 *
 * identifierOwnUrl  — the identifier's own URL form, when it has one.
 *   iec61406 → the Identification Link uri
 *   doi      → `https://doi.org/<doi>`
 *   did      → null (resolution is method-specific; the DID itself is not a URL)
 *   gs1/iso15459 → null (no URL intrinsic to the identifier; use identifierToUri)
 *
 * parseResolverPath — inverse of identifierToUri, for gs1 and iso15459 only.
 *   Leading digits in the first path segment → GS1 AI path (AI 01 + AI 21).
 *   Leading letter in the first path segment → ISO/IEC 15459 agency path.
 *   Otherwise → null.
 *
 * identifierKey     — a canonical string for deduplication / map keys.
 *   gs1      → `gs1:<gtin14>:<serial>`
 *   iso15459 → `iso15459:<agency>:<primaryId>:<serial|>` (empty string if no serial)
 *   iec61406 → `iec61406:<uri>`
 *   did      → `did:<did>`
 *   doi      → `doi:<lowercased-bare>`
 *
 * Note on open question: does the iso15459 path form match the ISO/IEC 18975
 * resolver path that EN 18219 scheme 1 references? ISO/IEC 18975 is paywalled
 * and unread. Until that is resolved, the path here is a TracePass resolver
 * route, not a claim of conformance with 18975. The identifier's own `raw`/`uri`
 * field is its authoritative form.
 */

import type { ProductIdentifier } from "@tracepass/dpp-types";

/**
 * Build a resolver URL for a `ProductIdentifier`.
 *
 * @param id           - the (validated, normalised) identifier
 * @param resolverBase - the resolver's bare domain, e.g. `"id.example.com"`
 * @returns the full resolver URL, or `null` for schemes that carry their own URL
 */
export function identifierToUri(id: ProductIdentifier, resolverBase: string): string | null {
  const base = resolverBase.replace(/\/+$/, "");

  switch (id.scheme) {
    case "gs1":
      return (
        `https://${base}/01/${id.gtin}/21/${encodeURIComponent(id.serialNumber)}`
      );

    case "iso15459": {
      const parts = [
        encodeURIComponent(id.issuingAgencyCode),
        encodeURIComponent(id.primaryId),
      ];
      if (id.serial) parts.push(encodeURIComponent(id.serial));
      return `https://${base}/${parts.join("/")}`;
    }

    case "iec61406":
    case "did":
    case "doi":
      // These schemes carry their own canonical URL; use identifierOwnUrl.
      return null;

    default: {
      const _exhaustive: never = id;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Return the identifier's own canonical URL, when it has one.
 * `null` when the identifier type does not define its own URL form.
 */
export function identifierOwnUrl(id: ProductIdentifier): string | null {
  switch (id.scheme) {
    case "iec61406":
      return id.uri;

    case "doi":
      // DOI is always stored as bare form; resolve via the global DOI resolver.
      return `https://doi.org/${id.doi}`;

    case "did":
      // DID resolution is method-specific; the DID itself is not a URL.
      return null;

    case "gs1":
    case "iso15459":
      // These have no intrinsic URL; they need a resolver. Use identifierToUri.
      return null;

    default: {
      const _exhaustive: never = id;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Parse a resolver path back into a `ProductIdentifier`.
 *
 * Handles the two schemes emitted by `identifierToUri`:
 *   - `/01/<gtin14>/21/<encoded-serial>` → `{scheme: "gs1", …}`
 *   - `/<agency>/<encoded-primaryId>[/<encoded-serial>]` → `{scheme: "iso15459", …}`
 *
 * Returns `null` for any path that doesn't match.
 *
 * The first path segment determines the scheme: a digit-only segment is a GS1
 * Application Identifier (we only emit `01`); a segment starting with a letter
 * is an ISO/IEC 15459 issuing agency code.
 */
export function parseResolverPath(path: string): ProductIdentifier | null {
  // Normalise: strip leading slash, strip query/fragment
  const clean = path.replace(/^\//, "").split("?")[0].split("#")[0];
  if (!clean) return null;

  const segments = clean.split("/");
  if (segments.length < 2) return null;

  const first = segments[0];
  if (!first) return null;

  // GS1 AI path: leading all-digit segment
  if (/^\d+$/.test(first)) {
    // Only handle the /01/<gtin>/21/<serial> form we emit.
    if (first !== "01" || segments.length < 4 || segments[2] !== "21") return null;
    const gtin = segments[1];
    const serial = decodeURIComponent(segments[3]);
    return { scheme: "gs1", gtin, serialNumber: serial };
  }

  // ISO/IEC 15459 agency path: leading segment starts with a letter
  if (/^[A-Z]/i.test(first)) {
    const issuingAgencyCode = decodeURIComponent(first).toUpperCase();
    const primaryId = decodeURIComponent(segments[1]);
    const serial = segments[2] ? decodeURIComponent(segments[2]) : undefined;
    const raw = [issuingAgencyCode, primaryId, serial].filter(Boolean).join("/");
    return {
      scheme: "iso15459",
      issuingAgencyCode,
      primaryId,
      serial,
      raw,
    };
  }

  return null;
}

/**
 * A canonical string key for deduplication and map-key use.
 *
 * The key is stable and unique within its scheme domain. DOI keys are
 * lower-cased (DOI identifiers are case-insensitive per the DOI Handbook).
 */
export function identifierKey(id: ProductIdentifier): string {
  switch (id.scheme) {
    case "gs1":
      return `gs1:${id.gtin}:${id.serialNumber}`;

    case "iso15459":
      return `iso15459:${id.issuingAgencyCode}:${id.primaryId}:${id.serial ?? ""}`;

    case "iec61406":
      return `iec61406:${id.uri}`;

    case "did":
      return `did:${id.did}`;

    case "doi":
      return `doi:${id.doi.toLowerCase()}`;

    default: {
      const _exhaustive: never = id;
      void _exhaustive;
      return `unknown:${JSON.stringify(id)}`;
    }
  }
}
