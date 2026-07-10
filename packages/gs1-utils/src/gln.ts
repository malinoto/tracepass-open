/**
 * GS1 GLN (Global Location Number) validation and check digit calculation.
 *
 * A GLN is a 13-digit string where the last digit is a check digit computed
 * using the GS1 modulo-10 algorithm (alternating ×3/×1 from the right).
 *
 * Where GTIN identifies a *product*, GLN identifies a *party or place* —
 * a legal entity, a physical site, or a functional role within an organisation.
 * GLN is the GS1 Digital Link primary key for the `/414/{gln}` resolver path,
 * and the canonical identifier for economic operators in EU compliance contexts
 * (Battery Regulation 2023/1542 Articles 47–50, PPWR 2025/40 Article 11, etc.).
 *
 * The check-digit algorithm itself is identical to GTIN's, but because the
 * data length is even (12 digits + 1 check digit = 13) instead of odd (13 + 1
 * for GTIN-14), the ×3/×1 weight pattern is inverted relative to GTIN: the
 * left-most data digit gets ×1 here, where GTIN-14's left-most gets ×3.
 */

/**
 * Calculate the GS1 check digit for the first 12 digits of a GLN.
 * @param gln12 - exactly 12 numeric characters
 * @returns the single check-digit character ("0"-"9")
 */
export function calculateCheckDigit(gln12: string): string {
  if (!/^\d{12}$/.test(gln12)) {
    throw new Error("calculateCheckDigit expects exactly 12 digits");
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(gln12[i]);
    // Counted from the right, the rightmost data digit gets ×3, next ×1, etc.
    // For 12 input digits the parity flips relative to GTIN-14: position 0
    // (left-most) is at distance 11 from the right (odd) → ×1; position 1
    // is at distance 10 (even) → ×3.
    sum += i % 2 === 0 ? digit * 1 : digit * 3;
  }

  const remainder = sum % 10;
  return remainder === 0 ? "0" : String(10 - remainder);
}

/**
 * Validate a 13-digit GLN string.
 * Returns true only when the string is 13 numeric characters and the check
 * digit matches.
 */
export function validateGln(gln: string): boolean {
  if (!/^\d{13}$/.test(gln)) {
    return false;
  }

  const expected = calculateCheckDigit(gln.slice(0, 12));
  return gln[12] === expected;
}

/**
 * Coerce common user-input shapes into a clean 13-digit GLN string, or null
 * if the cleaned value isn't a valid GLN.
 *
 * Handles:
 *   - leading/trailing whitespace
 *   - "GLN:" / "GLN " prefix (case-insensitive — Battery passport datasheets
 *     often write "GLN: 7610999999990" in body copy)
 *   - internal whitespace (some EDI feeds emit "7610 9999 9999 0")
 *   - hyphens used as visual separators (less common but seen)
 *
 * Does NOT auto-fix typos — the check digit must validate. A 13-digit string
 * with a wrong check digit returns null, not a "corrected" GLN.
 */
export function normalizeGln(input: string): string | null {
  if (typeof input !== "string") return null;

  const cleaned = input
    .trim()
    .replace(/^gln[:\s]+/i, "") // strip leading "GLN:" / "GLN " prefix
    .replace(/[\s-]/g, "");      // strip whitespace + hyphens

  return validateGln(cleaned) ? cleaned : null;
}
