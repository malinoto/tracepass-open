/**
 * Identifier URI construction and parsing for the EN 18219 resolver path.
 *
 * identifierToUri   — build a resolver URL from any ProductIdentifier.
 *   gs1     → Digital Link path `/01/<gtin14>/21/<encoded-serial>`
 *   iso15459 → ISO/IEC 18975 query form `/?` `.25P=<encodeURIComponent(iac+primaryId)>[&.S=<encodeURIComponent(serial)>]`
 *             (EN 18219 §5.2.2 + Table B.12; the `.25P` DI concatenates IAC + CIN + product number
 *             with no separators; `.S` is the optional serial)
 *   iec61406 / did / doi → null (they carry their own canonical URL)
 *
 * identifierOwnUrl  — the identifier's own URL form, when it has one.
 *   iec61406 → the Identification Link uri
 *   doi      → `https://doi.org/<doi>` (§5.6.2(c): lowercase `doi.org`)
 *   did      → null (resolution is method-specific; the DID itself is not a URL)
 *   gs1/iso15459 → null (no URL intrinsic to the identifier; use identifierToUri)
 *
 * parseResolverPath — inverse of identifierToUri for GS1 only; also parses the
 *   legacy ISO/IEC 15459 agency path `/<AGENCY>/<primaryId>[/<serial>]` for
 *   backward compatibility with QR codes minted before the conformant query form.
 *
 *   Leading digits in the first path segment → GS1 AI path (AI 01 + AI 21).
 *   A 1–3 char uppercase `[A-Z][A-Z0-9]{0,2}` first segment → ISO/IEC 15459 agency path (legacy alias).
 *   Otherwise → null.
 *
 *   ⚠️  Consumers MUST match their own reserved app routes (/p, /api, /docs, …)
 *   BEFORE delegating to parseResolverPath. A 1–3 char uppercase route (e.g. /P)
 *   is indistinguishable from a 1-char ISO/IEC 15459 agency code — the function
 *   cannot tell them apart and will return a spurious iso15459 result. Pre-empt
 *   all known app routes first, then call parseResolverPath for the remainder.
 *
 * parseDiQuery — parse an ISO/IEC 18975 query string (from a `/?` `.25P=…&.S=…` URL)
 *   into `{ concatenated25P, serial? }`. Returns `null` when the query string does not
 *   carry a `.25P` parameter or when its value is empty.
 *
 * diQueryCandidateKeys — given a `.25P` concatenated value, return up to three
 *   candidate `identifierKey` strings (one per possible IAC length 1–3) for a
 *   MongoDB `{ identifierKey: { $in: candidates } }` lookup. The IAC must match
 *   `[A-Z][A-Z0-9]{0,2}`. An empty or too-short `.25P` value returns `[]`.
 *
 * identifierKey     — a canonical string for deduplication / map keys.
 *   gs1      → `gs1:<gtin14>:<serial>`
 *   iso15459 → `iso15459:<agency>:<primaryId>:<serial|>` (empty string if no serial)
 *   iec61406 → `iec61406:<uri>`
 *   did      → `did:<did>`
 *   doi      → `doi:<lowercased-bare>`
 *
 * Conformance note: the ISO/IEC 15459 resolver path that `identifierToUri` previously
 * emitted (`/<AGENCY>/<primaryId>`) was a TracePass vendor route, not conformant with
 * the ISO/IEC 18975 resolver query form that EN 18219 §5.2.2 references. The query form
 * `/?` `.25P=<IAC+primaryId>[&.S=<serial>]` is what EN 18219 Table B.12 shows as the
 * conformant non-GS1 web URI. The old path form still parses and resolves as an alias
 * (zero live iso15459 passports in prod as of this change, so no migration needed).
 *
 * ⚠️ MIRRORED INTO THE PUBLIC npm PACKAGE @tracepass/dpp-identifiers.
 * `tracepass-open/packages/dpp-identifiers/src/uri.ts` is a hand-copy of this
 * file — nothing generates one from the other, and a stale copy fails silently
 * (it still compiles and still returns a plausible answer). tracepass-open
 * gates on a hash of this file in CI, so after changing it:
 *
 *   cd ../tracepass-open && node scripts/build-mirror-manifest.mjs \
 *     && npm run check:mirrors
 *
 * and commit `mirror-manifest.json` with the code.
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
    case "gs1": {
      // A Digital Link carries the GTIN-14 form: left-pad a GTIN-8/12/13 with
      // zeros (the check digit is unchanged by padding). Anything else is left
      // as given; validation belongs to validateProductIdentifier.
      const gtin = /^\d{8}$|^\d{12,13}$/.test(id.gtin) ? id.gtin.padStart(14, "0") : id.gtin;
      return `https://${base}/01/${gtin}/21/${encodeURIComponent(id.serialNumber)}`;
    }

    case "iso15459": {
      // EN 18219 §5.2.2 + Table B.12: the conformant non-GS1 web URI for
      // ASC MH10.8.2 Data Identifiers uses the ISO/IEC 18975 query form.
      // `.25P` carries the IAC + primaryId concatenated (no separator).
      // `.S` carries the optional serial number.
      const dot25P = encodeURIComponent(id.issuingAgencyCode + id.primaryId);
      const serialPart = id.serial ? `&.S=${encodeURIComponent(id.serial)}` : "";
      return `https://${base}/?.25P=${dot25P}${serialPart}`;
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
 *   - `/<AGENCY>/<encoded-primaryId>[/<encoded-serial>]` → `{scheme: "iso15459", …}`
 *
 * Returns `null` for any path that doesn't match, including:
 *   - "/about/team"  — first segment "about" is 5 chars, exceeds the 3-char limit
 *   - "/api/v1/…"   — first segment "api" is lowercase
 *   - "/mh/ABC"     — first segment "mh" is lowercase (ISO/IEC 15459 agency codes
 *                     are always uppercase per EN 18219; `identifierToUri` always
 *                     emits uppercase)
 *
 * ⚠️  The agency-code shape check (1–3 chars, `[A-Z][A-Z0-9]{0,2}`) cannot
 * distinguish a short app route from a valid agency code. For example, "/P/x"
 * is indistinguishable from a passport with agency "P" and primaryId "x" — it
 * will parse. Consumers MUST match their own reserved routes (/P, /API, /DOCS, …)
 * BEFORE delegating to `parseResolverPath`.
 *
 * The first path segment determines the scheme: a digit-only segment is a GS1
 * Application Identifier (we only emit `01`); a 1–3 char uppercase segment is
 * an ISO/IEC 15459 issuing agency code.
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
    let serial: string;
    try {
      serial = decodeURIComponent(segments[3]);
    } catch {
      // Malformed percent-sequence (e.g. bare %) → treat as not found, not 500.
      return null;
    }
    return { scheme: "gs1", gtin, serialNumber: serial };
  }

  // ISO/IEC 15459 agency path: exactly 1–3 chars, uppercase [A-Z][A-Z0-9]{0,2}.
  // identifierToUri always emits uppercase agency codes; lowercase paths are
  // rejected (the caller may uppercase and retry if needed).
  if (/^[A-Z][A-Z0-9]{0,2}$/.test(first)) {
    let issuingAgencyCode: string;
    let primaryId: string;
    let serial: string | undefined;
    try {
      issuingAgencyCode = decodeURIComponent(first).toUpperCase();
      primaryId = decodeURIComponent(segments[1]);
      serial = segments[2] ? decodeURIComponent(segments[2]) : undefined;
    } catch {
      return null;
    }
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
 * Parse an ISO/IEC 18975 query string (e.g. from `/?` `.25P=QCELMI12345&.S=654321`)
 * into its components. Accepts a raw `URLSearchParams`-parseable string or the full
 * query string starting with `?`.
 *
 * Returns `null` when:
 *   - the query string contains no `.25P` parameter
 *   - the `.25P` value is empty after decoding
 *
 * The `concatenated25P` value is the raw decoded string — IAC + primaryId, with
 * no separator. Use `diQueryCandidateKeys` to split it into candidate identifierKey
 * strings for a DB lookup.
 */
export function parseDiQuery(
  queryString: string,
): { concatenated25P: string; serial?: string } | null {
  // Strip a leading "?" so both "?.25P=..." and ".25P=..." are accepted.
  const qs = queryString.startsWith("?") ? queryString.slice(1) : queryString;
  const params = new URLSearchParams(qs);
  const raw25P = params.get(".25P");
  if (!raw25P) return null;

  const serial = params.get(".S") ?? undefined;
  return {
    concatenated25P: raw25P,
    ...(serial ? { serial } : {}),
  };
}

/**
 * Given the concatenated `.25P` value (`IAC + primaryId`, no separator), generate
 * up to three candidate `identifierKey` strings — one per possible IAC length (1, 2, 3).
 *
 * The IAC (issuing agency code) is 1–3 upper-case alphanumeric characters with the
 * first character being a letter (`[A-Z][A-Z0-9]{0,2}`). Since the value is
 * concatenated without a separator, ambiguity exists when the `.25P` is parsed. The
 * caller resolves ambiguity by querying the DB with `identifierKey: {$in: candidates}`:
 *   - exactly one match → that passport
 *   - more than one match → ambiguous (caller must treat as not found)
 *   - zero matches → not found
 *
 * Returns `[]` when the input does not start with a letter (invalid for any IAC length).
 *
 * @param concatenated25P - the decoded `.25P` value, e.g. `"QCELMI12345"` or `"MI12345"`
 * @param serial           - the decoded `.S` value, if present (same as Iso15459Identifier.serial)
 */
export function diQueryCandidateKeys(
  concatenated25P: string,
  serial?: string,
): string[] {
  if (!concatenated25P || !/^[A-Z]/.test(concatenated25P)) return [];

  const IAC_PATTERN = /^[A-Z][A-Z0-9]{0,2}$/;
  const candidates: string[] = [];

  for (const len of [1, 2, 3] as const) {
    if (concatenated25P.length <= len) continue; // primaryId must be non-empty

    const candidateIac = concatenated25P.slice(0, len);
    if (!IAC_PATTERN.test(candidateIac)) continue;

    const primaryId = concatenated25P.slice(len);
    // identifierKey format: iso15459:<agency>:<primaryId>:<serial|>
    candidates.push(`iso15459:${candidateIac}:${primaryId}:${serial ?? ""}`);
  }

  return candidates;
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
