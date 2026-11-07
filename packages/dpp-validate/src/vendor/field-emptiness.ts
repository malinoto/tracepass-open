/**
 * Is a passport field's value absent?
 *
 * This looks trivial and is not — the same question is asked in a dozen places
 * (publish gate, compliance verdict, bulk approve, gap reports, the extraction
 * pipeline, the review UI) and getting it subtly wrong has already cost real
 * data twice.
 *
 * ── An empty ARRAY is an answer, not a gap ──
 *
 * `hazardousSubstances: []` asserts "we checked, there are none" — a positive
 * compliance claim, the same kind as `svhcPresent: false`. Treating it as
 * absent discards a declared finding and re-queues settled work.
 *
 * The trap is that **`String([]) === ""`**. Any check written as
 * `String(v).trim() === ""` therefore swallows every empty array silently. A
 * repair pass built that way flagged 60 of them, two on PUBLISHED passports,
 * and would have wiped genuine "none apply" declarations.
 *
 * ── `false` and `0` are values ──
 *
 * `svhcPresent: false` is the ECHA register's actual answer.
 * `recycledContentPercent: 0` is a measurement. `if (!value)` discards both,
 * which is why that shortcut is never correct here.
 *
 * ── Whitespace is absent ──
 *
 * `"   "` is what an empty form field or a trimmed-to-nothing extraction
 * leaves behind. The long-standing inline checks used `value === ""` and so
 * counted a whitespace string as filled — enough to satisfy a required field
 * in the publish gate.
 */

import type { Passport, PassportField } from "@tracepass/dpp-types";

/**
 * True when the field holds no value.
 *
 * Absent: `null`, `undefined`, `""`, whitespace-only strings.
 * Present: `false`, `0`, `[]`, `{}`, and every non-blank scalar.
 *
 * Note `[]` and `{}` count as PRESENT. An empty collection is a declaration
 * that the collection is empty; callers that need "no entries" should test
 * `.length` themselves, which reads as the different question it is.
 * @param value - the field value to test
 * @returns whether the value counts as absent
 */
export function isFieldValueAbsent(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/**
 * Convenience for the common `!field || absent(field.value)` shape.
 * @param field - the field, if it exists
 * @returns whether the field is missing or holds an absent value
 */
export function isFieldAbsent(field: { value?: unknown } | undefined | null): boolean {
  return !field || isFieldValueAbsent(field.value);
}

/**
 * Look up a passport field by key. The type promises every key is present, but
 * a passport read from JSON need not have it, so the result may be undefined.
 * @param passport - the passport to read
 * @param key - the field key
 * @returns the field, or undefined when the passport has none under that key
 */
export function fieldAt(passport: Passport, key: string): PassportField | undefined {
  return passport.fields[key];
}

/**
 * Read one field's value from a field map that may itself be missing, such as
 * the `fields` of a passport built by hand.
 * @param fields - the field map, if any
 * @param key - the field key
 * @returns the field's value, or undefined when the map or the field is absent
 */
export function optionalFieldValue(
  fields: Readonly<Record<string, { value?: unknown } | undefined>> | undefined,
  key: string,
): unknown {
  return fields?.[key]?.value;
}
