/**
 * Product identifier validation per EN 18219.
 *
 * `validateProductIdentifier` accepts any of the five product schemes and
 * returns a normalised value on success or a list of errors on failure.
 *
 * Scheme constraints:
 *   - gs1:      GTIN-8/12/13/14 + non-empty serial; GTIN normalised to 14 digits.
 *   - iso15459: issuingAgencyCode 1–3 upper-case alphanumerics, first char a letter;
 *               non-empty primaryId.
 *   - iec61406: https URL, ASCII-only, RFC 3986-valid.
 *   - did:      W3C DID Core ABNF — method [a-z0-9]+, method-specific-id valid chars.
 *   - doi:      prefix 10.<registrant>/<suffix>; accepts doi:/https://doi.org/ prefixes
 *               and normalises to bare form.
 *
 * Cross-cutting (EN 18219 clause 4.3.2): all identifier fields must use
 * ISO/IEC 646 characters (printable ASCII, codepoints 0x20–0x7E only).
 *
 * Category restriction: `category: "battery"` allows only gs1 and iso15459
 * (Battery Regulation Art. 77(3) requires ISO/IEC 15459 until a delegated
 * act replaces it with EN 18219).
 */

import type {
  ProductIdentifier,
  Gs1Identifier,
  Iso15459Identifier,
  Iec61406Identifier,
  DidIdentifier,
  DoiIdentifier,
} from "@tracepass/dpp-types";
import { normalizeGtin } from "@tracepass/gs1-utils";

/** Validation result — either a normalised identifier or an error list. */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

/** Options for {@link validateProductIdentifier}. */
export interface ValidateProductOptions {
  /**
   * DPP category. Pass `"battery"` to restrict to ISO/IEC 15459-based schemes
   * (gs1 and iso15459), which Battery Regulation Art. 77(3) requires.
   */
  category?: string;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * True when every character in `s` is a printable ASCII character (0x20–0x7E).
 * EN 18219 clause 4.3.2 requires ISO/IEC 646 characters for all identifier fields.
 */
function isAsciiPrintable(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

/**
 * True when `s` is RFC 3986-valid. Uses the platform-global `URL` constructor
 * (available in Node ≥ 18, browsers and Deno) as a lightweight proxy — it
 * throws on obvious syntax errors. The check is intentionally permissive:
 * percent-encoded bytes are accepted so long as the `URL` constructor accepts them.
 */
function isRfc3986Valid(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

// ── DID validation ────────────────────────────────────────────────────────────

/**
 * True when `seg` is a valid DID method-specific-id segment.
 * Per W3C DID Core: idchar = ALPHA / DIGIT / "." / "-" / "_" / pct-encoded.
 */
function isValidDidSegment(seg: string): boolean {
  if (!seg) return false;
  let i = 0;
  while (i < seg.length) {
    const c = seg[i];
    if (/[A-Za-z0-9._\-]/.test(c)) {
      i++;
    } else if (
      c === "%" &&
      i + 2 < seg.length &&
      /^[0-9A-Fa-f]{2}$/.test(seg.slice(i + 1, i + 3))
    ) {
      i += 3;
    } else {
      return false;
    }
  }
  return true;
}

function validateDidString(did: string): string[] {
  const errors: string[] = [];
  if (!did.startsWith("did:")) {
    errors.push("DID must start with 'did:'");
    return errors;
  }
  const rest = did.slice(4);
  const firstColon = rest.indexOf(":");
  if (firstColon <= 0) {
    errors.push("DID must have a method and a method-specific-id separated by ':'");
    return errors;
  }
  const method = rest.slice(0, firstColon);
  const methodSpecificId = rest.slice(firstColon + 1);

  if (!/^[a-z0-9]+$/.test(method)) {
    errors.push(`DID method '${method}' must match [a-z0-9]+ (all lower-case, no hyphens)`);
  }
  if (!methodSpecificId) {
    errors.push("DID method-specific-id is empty");
    return errors;
  }
  if (methodSpecificId.endsWith(":")) {
    errors.push("DID method-specific-id must not end with ':'");
  }
  const segments = methodSpecificId.split(":");
  for (const seg of segments) {
    if (!isValidDidSegment(seg)) {
      errors.push(
        `DID method-specific-id segment '${seg}' contains invalid characters ` +
          "(allowed: ALPHA, DIGIT, '.', '-', '_', pct-encoded)",
      );
    }
  }
  return errors;
}

// ── DOI normalisation ─────────────────────────────────────────────────────────

/**
 * Normalise a DOI to bare form (`10.<registrant>/<suffix>`).
 * Accepts `doi:10.…` and `https://doi.org/10.…` prefixes.
 * Returns null when the bare form does not match the DOI Handbook syntax.
 */
export function normalizeDoi(input: string): string | null {
  let bare = input.trim();

  // Strip known prefixes (case-insensitive per the DOI Handbook)
  if (/^https?:\/\/doi\.org\//i.test(bare)) {
    bare = bare.replace(/^https?:\/\/doi\.org\//i, "");
  } else if (/^doi:/i.test(bare)) {
    bare = bare.replace(/^doi:/i, "");
  }

  // DOI Handbook syntax: prefix = 10.<4-9 digits>, suffix = at least one non-space char.
  // Case-insensitive per the DOI Handbook; stored as lower-case.
  if (!/^10\.\d{4,9}\/\S+$/i.test(bare)) return null;
  return bare.toLowerCase();
}

// ── Per-scheme validators ─────────────────────────────────────────────────────

function validateGs1(id: Gs1Identifier): ValidationResult<Gs1Identifier> {
  const errors: string[] = [];

  const gtin14 = normalizeGtin(id.gtin);
  if (!gtin14) {
    errors.push(
      `gtin '${id.gtin}' is not a valid GTIN-8/12/13/14 (must be all digits with a correct mod-10 check digit)`,
    );
  }

  if (!id.serialNumber) {
    errors.push("serialNumber must not be empty");
  } else if (!isAsciiPrintable(id.serialNumber)) {
    errors.push("serialNumber must contain only printable ASCII characters (ISO/IEC 646)");
  }

  if (id.digitalLinkUri !== undefined && !isAsciiPrintable(id.digitalLinkUri)) {
    errors.push("digitalLinkUri must contain only printable ASCII characters");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...id,
      gtin: gtin14!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
    },
  };
}

function validateIso15459(id: Iso15459Identifier): ValidationResult<Iso15459Identifier> {
  const errors: string[] = [];

  const code = id.issuingAgencyCode;
  if (!code || code.length < 1 || code.length > 3) {
    errors.push("issuingAgencyCode must be 1–3 characters");
  } else if (!/^[A-Z0-9]{1,3}$/.test(code)) {
    errors.push("issuingAgencyCode must be upper-case letters and/or digits only");
  } else if (!/^[A-Z]/.test(code)) {
    // GS1 holds the all-digit issuing agency code range (ISO/IEC 15459-2
    // code allocation rule — unverified against the current register).
    errors.push(
      "issuingAgencyCode first character must be a letter " +
        "(GS1 holds the all-digit range per the ISO/IEC 15459-2 code allocation)",
    );
  }

  if (!id.primaryId) {
    errors.push("primaryId must not be empty");
  } else if (!isAsciiPrintable(id.primaryId)) {
    errors.push("primaryId must contain only printable ASCII characters (ISO/IEC 646)");
  }

  if (id.serial !== undefined) {
    if (!id.serial) {
      errors.push("serial, when present, must not be empty");
    } else if (!isAsciiPrintable(id.serial)) {
      errors.push("serial must contain only printable ASCII characters (ISO/IEC 646)");
    }
  }

  if (!id.raw) {
    errors.push("raw must not be empty");
  } else if (!isAsciiPrintable(id.raw)) {
    errors.push("raw must contain only printable ASCII characters (ISO/IEC 646)");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: id };
}

function validateIec61406(id: Iec61406Identifier): ValidationResult<Iec61406Identifier> {
  const errors: string[] = [];

  if (!id.uri) {
    errors.push("uri must not be empty");
  } else {
    if (!id.uri.startsWith("https://")) {
      errors.push("IEC 61406 uri must be an https URL");
    }
    if (!isAsciiPrintable(id.uri)) {
      errors.push("uri must contain only printable ASCII characters (ISO/IEC 646)");
    }
    if (!isRfc3986Valid(id.uri)) {
      errors.push("uri must be a valid RFC 3986 URL");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: id };
}

function validateDid(id: DidIdentifier): ValidationResult<DidIdentifier> {
  const errors: string[] = [];

  if (!isAsciiPrintable(id.did)) {
    errors.push("did must contain only printable ASCII characters (ISO/IEC 646)");
  }

  const didErrors = validateDidString(id.did);
  errors.push(...didErrors);

  // Verify method field matches the method in the DID string
  if (didErrors.length === 0) {
    const methodInDid = id.did.slice(4, id.did.indexOf(":", 4));
    if (id.method !== methodInDid) {
      errors.push(
        `method field '${id.method}' does not match the method in the did string '${methodInDid}'`,
      );
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: id };
}

function validateDoiId(id: DoiIdentifier): ValidationResult<DoiIdentifier> {
  const errors: string[] = [];

  if (!isAsciiPrintable(id.doi)) {
    errors.push("doi must contain only printable ASCII characters (ISO/IEC 646)");
  }

  const bare = normalizeDoi(id.doi);
  if (!bare) {
    errors.push(
      `doi '${id.doi}' must match 10.<4–9 registrant digits>/<suffix> per the DOI Handbook`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { ...id, doi: bare! } }; // eslint-disable-line @typescript-eslint/no-non-null-assertion
}

// ── Battery category restriction ──────────────────────────────────────────────

const BATTERY_ALLOWED_SCHEMES = new Set<ProductIdentifier["scheme"]>(["gs1", "iso15459"]);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate a `ProductIdentifier` against EN 18219 rules.
 *
 * On success returns `{ ok: true, value }` with the normalised identifier
 * (gtin padded to 14 digits; doi stripped of prefix and lowercased).
 * On failure returns `{ ok: false, errors }` listing every problem found.
 *
 * Pass `{ category: "battery" }` to apply the additional Battery Regulation
 * Art. 77(3) restriction: only `gs1` and `iso15459` are accepted, because
 * DID, DOI and IEC 61406 are not ISO/IEC 15459 identifiers.
 */
export function validateProductIdentifier(
  id: ProductIdentifier,
  options: ValidateProductOptions = {},
): ValidationResult<ProductIdentifier> {
  // Battery Regulation Art. 77(3) restriction
  if (options.category === "battery" && !BATTERY_ALLOWED_SCHEMES.has(id.scheme)) {
    return {
      ok: false,
      errors: [
        `scheme '${id.scheme}' is not permitted for battery passports — ` +
          "Battery Regulation Art. 77(3) requires an ISO/IEC 15459 identifier " +
          "(gs1 or iso15459); DID, DOI and IEC 61406 are not ISO/IEC 15459 identifiers.",
      ],
    };
  }

  switch (id.scheme) {
    case "gs1":      return validateGs1(id);
    case "iso15459": return validateIso15459(id);
    case "iec61406": return validateIec61406(id);
    case "did":      return validateDid(id);
    case "doi":      return validateDoiId(id);
    default: {
      // Exhaustiveness guard — a new scheme added to the union without a
      // validator here becomes a compile error on the line below.
      const _exhaustive: never = id;
      void _exhaustive;
      return { ok: false, errors: ["unknown scheme"] };
    }
  }
}
