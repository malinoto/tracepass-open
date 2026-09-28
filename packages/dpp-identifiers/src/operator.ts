/**
 * Operator and facility identifier validation per EN 18219.
 *
 * validateOperatorIdentifier — EN 18219 schemes 6–9:
 *   iso6523:  icd 4 digits; special ICDs validated:
 *     0199 (LEI)  — 20 chars [A-Z0-9]{18}[0-9]{2}, ISO 7064 MOD 97-10 check.
 *     0088 (GLN)  — 13 digits, GS1 mod-10 check digit.
 *     0060 (DUNS) — 9 digits (no check digit).
 *     others      — non-empty value.
 *   gln:      13 digits, GS1 mod-10 check digit (via gs1-utils).
 *   did:      W3C DID Core syntax (method [a-z0-9]+, method-specific-id valid).
 *   doi:      prefix 10.<registrant>/<suffix>, accepts doi:/https://doi.org/ prefixes.
 *
 * validateFacilityIdentifier — EN 18219 §6.1–6.5: schemes 6 (ISO/IEC 6523),
 * 7 (GLN via ISO/IEC 15418), 8 (DID) and 9 (DOI) all cover BOTH economic
 * operators AND facilities. Reuses the operator validator for the shared
 * schemes; the GLN scheme additionally accepts an `extension` component
 * (a GS1 SGLN sub-location).
 */

import type { OperatorIdentifier, FacilityIdentifier } from "@tracepass/dpp-types";
import { validateGln } from "@tracepass/gs1-utils";
import type { ValidationResult } from "./product.js";
import { normalizeDoi } from "./product.js";

// ── ISO 7064 MOD 97-10 check for LEI ─────────────────────────────────────────

/**
 * Verify an LEI's ISO 7064 MOD 97-10 check digits.
 *
 * LEI format: [A-Z0-9]{18}[0-9]{2}
 * Conversion: each letter → its ordinal (A=10, B=11, …, Z=35); each digit stays.
 * The concatenated number mod 97 must equal 1.
 *
 * Processing in digit-by-digit chunks avoids BigInt or a full string-to-number
 * conversion (a 20-char LEI expands to up to 34 decimal digits).
 */
function verifyLeiCheckDigits(lei: string): boolean {
  // Build the full digit string (letters → 2-digit ordinals, digits → as-is)
  const digits = lei
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0);
      // A–Z (65–90) → 10–35; 0–9 (48–57) → 0–9
      return code >= 65 ? String(code - 55) : c;
    })
    .join("");

  // Compute the large number mod 97 by iterating one digit at a time
  let remainder = 0;
  for (let i = 0; i < digits.length; i++) {
    remainder = (remainder * 10 + Number(digits[i])) % 97;
  }
  return remainder === 1;
}

// ── DID validation (shared with product.ts but not exported there) ────────────

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
    errors.push(`DID method '${method}' must match [a-z0-9]+`);
  }
  if (!methodSpecificId) {
    errors.push("DID method-specific-id is empty");
    return errors;
  }
  if (methodSpecificId.endsWith(":")) {
    errors.push("DID method-specific-id must not end with ':'");
  }
  for (const seg of methodSpecificId.split(":")) {
    if (!isValidDidSegment(seg)) {
      errors.push(`DID method-specific-id segment '${seg}' contains invalid characters`);
    }
  }
  return errors;
}

// ── iso6523 ───────────────────────────────────────────────────────────────────

function validateIso6523(
  icd: string,
  value: string,
): ValidationResult<Extract<OperatorIdentifier, { scheme: "iso6523" }>> {
  const errors: string[] = [];

  if (!/^\d{4}$/.test(icd)) {
    errors.push("iso6523 icd must be exactly 4 digits");
  }

  if (!value) {
    errors.push("iso6523 value must not be empty");
    return { ok: false, errors };
  }

  // ICD-specific rules
  if (icd === "0199") {
    // LEI (ISO 17442): [A-Z0-9]{18}[0-9]{2}, ISO 7064 MOD 97-10 check
    if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(value)) {
      errors.push(
        "LEI (icd 0199) must be 20 characters: 18 upper-case alphanumerics followed by 2 digits",
      );
    } else if (!verifyLeiCheckDigits(value)) {
      errors.push("LEI (icd 0199) check digits fail ISO 7064 MOD 97-10 verification");
    }
  } else if (icd === "0088") {
    // GLN (ISO/IEC 15418 GS1 AI 414/417): 13 digits, mod-10 check
    if (!validateGln(value)) {
      errors.push("GLN (icd 0088) must be a valid 13-digit GLN with a correct mod-10 check digit");
    }
  } else if (icd === "0060") {
    // DUNS: 9 digits (no check digit defined in the public spec)
    if (!/^\d{9}$/.test(value)) {
      errors.push("DUNS (icd 0060) must be exactly 9 digits");
    }
  }
  // All other ICDs: non-empty value is sufficient (already checked above).

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { scheme: "iso6523", icd, value } };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate a `OperatorIdentifier` against EN 18219 rules.
 * Returns the normalised identifier on success or an error list on failure.
 */
export function validateOperatorIdentifier(
  id: OperatorIdentifier,
): ValidationResult<OperatorIdentifier> {
  switch (id.scheme) {
    case "iso6523":
      return validateIso6523(id.icd, id.value);

    case "gln": {
      if (!validateGln(id.gln)) {
        return {
          ok: false,
          errors: ["gln must be a valid 13-digit GLN with a correct mod-10 check digit"],
        };
      }
      return { ok: true, value: id };
    }

    case "did": {
      const didErrors = validateDidString(id.did);
      if (didErrors.length > 0) return { ok: false, errors: didErrors };
      return { ok: true, value: id };
    }

    case "doi": {
      const bare = normalizeDoi(id.doi);
      if (!bare) {
        return {
          ok: false,
          errors: [
            `doi '${id.doi}' must match 10.<4–9 registrant digits>/<suffix> per the DOI Handbook`,
          ],
        };
      }
      return { ok: true, value: { ...id, doi: bare } };
    }

    default: {
      // Exhaustiveness guard
      const _exhaustive: never = id;
      void _exhaustive;
      return { ok: false, errors: ["unknown operator identifier scheme"] };
    }
  }
}

/**
 * Validate a `FacilityIdentifier` against EN 18219 §6.1–6.5 rules.
 *
 * EN 18219 §6.1–6.5 specifies the same four schemes for facilities as for
 * operators: ISO/IEC 6523, GLN/ISO 15418, DID, and DOI. All four are validated
 * here. The GLN `extension` field is a GS1 SGLN sub-location component.
 */
export function validateFacilityIdentifier(
  id: FacilityIdentifier,
): ValidationResult<FacilityIdentifier> {
  switch (id.scheme) {
    case "gln": {
      const errors: string[] = [];
      if (!validateGln(id.gln)) {
        errors.push("gln must be a valid 13-digit GLN with a correct mod-10 check digit");
      }
      if (id.extension !== undefined && !id.extension) {
        errors.push("extension, when present, must not be empty");
      }
      if (errors.length > 0) return { ok: false, errors };
      return { ok: true, value: id };
    }

    case "iso6523":
      return validateIso6523(id.icd, id.value) as ValidationResult<FacilityIdentifier>;

    case "did": {
      const didErrors = validateDidString(id.did);
      if (didErrors.length > 0) return { ok: false, errors: didErrors };
      return { ok: true, value: id };
    }

    case "doi": {
      const bare = normalizeDoi(id.doi);
      if (!bare) {
        return {
          ok: false,
          errors: [`doi '${id.doi}' must match 10.<4–9 registrant digits>/<suffix>`],
        };
      }
      return { ok: true, value: { ...id, doi: bare } };
    }

    default: {
      const _exhaustive: never = id;
      void _exhaustive;
      return { ok: false, errors: ["unknown facility identifier scheme"] };
    }
  }
}
