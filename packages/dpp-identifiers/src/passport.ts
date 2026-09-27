/**
 * Helpers that operate on a Passport object and its identifier fields.
 *
 * `resolveProductIdentifier` — read the canonical product identifier from a
 * passport, handling the `identifier`/`gs1` precedence without the caller
 * having to repeat it. Precedence (highest first):
 *   1. `passport.identifier` — the scheme-tagged EN 18219 field (new primary).
 *   2. `passport.gs1` — the legacy GS1-only field, lifted into a `Gs1Identifier`.
 *   3. `undefined` — no identifier is set.
 */

import type { Passport, ProductIdentifier, Gs1Identifier } from "@tracepass/dpp-types";

/**
 * Return the canonical `ProductIdentifier` for a passport.
 *
 * Prefers the scheme-tagged `identifier` field (EN 18219). Falls back to
 * lifting the deprecated `gs1` field into a `Gs1Identifier`. Returns
 * `undefined` when neither is set.
 *
 * Use this instead of reading `passport.identifier ?? liftGs1(passport.gs1)`
 * directly — it centralises the precedence rule so callers stay correct when
 * new fallback logic is added.
 *
 * @example
 * ```ts
 * const id = resolveProductIdentifier(passport);
 * if (!id) throw new Error("Passport has no product identifier");
 * ```
 */
export function resolveProductIdentifier(passport: Passport): ProductIdentifier | undefined {
  // 1. New scheme-tagged field (EN 18219) — always preferred.
  if (passport.identifier) return passport.identifier;

  // 2. Legacy GS1-only field — lifted into the ProductIdentifier union.
  if (passport.gs1) {
    const lifted: Gs1Identifier = {
      scheme: "gs1",
      gtin: passport.gs1.gtin,
      serialNumber: passport.gs1.serialNumber,
    };
    if (passport.gs1.digitalLinkUri !== undefined) {
      lifted.digitalLinkUri = passport.gs1.digitalLinkUri;
    }
    return lifted;
  }

  return undefined;
}
