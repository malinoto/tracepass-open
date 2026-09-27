/**
 * GS1 GTIN validation and check digit calculation.
 *
 * A GTIN-14 is a 14-digit string. The last digit is a check digit computed
 * using the GS1 modulo-10 algorithm (alternating ×3/×1 from the right).
 */

/**
 * Calculate the GS1 check digit for the first 13 digits of a GTIN-14.
 * @param gtin13 - exactly 13 numeric characters
 * @returns the single check-digit character ("0"-"9")
 */
export function calculateCheckDigit(gtin13: string): string {
  if (!/^\d{13}$/.test(gtin13)) {
    throw new Error("calculateCheckDigit expects exactly 13 digits");
  }

  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = Number(gtin13[i]);
    // positions 0,2,4,… get ×3; positions 1,3,5,… get ×1 (from left,
    // for a 14-digit number the even-indexed positions are multiplied by 3)
    sum += i % 2 === 0 ? digit * 3 : digit * 1;
  }

  const remainder = sum % 10;
  return remainder === 0 ? "0" : String(10 - remainder);
}

/**
 * Validate a 14-digit GTIN string (GTIN-14).
 * Returns true only when the string is 14 numeric characters and the check
 * digit matches.
 */
export function validateGtin(gtin: string): boolean {
  if (!/^\d{14}$/.test(gtin)) {
    return false;
  }

  const expected = calculateCheckDigit(gtin.slice(0, 13));
  return gtin[13] === expected;
}

/**
 * Normalise a GTIN of any standard length (8, 12, 13, or 14 digits) to 14 digits
 * by left-padding with zeros.
 *
 * GS1 guarantees that any GTIN format becomes a valid GTIN-14 when left-padded
 * to 14 digits — the mod-10 check digit is preserved. Returns null when:
 *   - the input is not a string or not all digits
 *   - the length is not one of 8, 12, 13, or 14
 *   - the mod-10 check digit does not match after padding
 */
export function normalizeGtin(input: string): string | null {
  if (typeof input !== "string") return null;
  if (!/^\d+$/.test(input)) return null;

  let gtin14: string;
  switch (input.length) {
    case 8:  gtin14 = "000000" + input; break;
    case 12: gtin14 = "00"     + input; break;
    case 13: gtin14 = "0"      + input; break;
    case 14: gtin14 = input;            break;
    default: return null;
  }

  return validateGtin(gtin14) ? gtin14 : null;
}

/**
 * Alias for {@link normalizeGtin}. Returns the GTIN-14 form or null on invalid
 * length or bad check digit.
 */
export const toGtin14 = normalizeGtin;
