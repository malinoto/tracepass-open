/**
 * EU/EEA membership check for ISO 3166-1 alpha-2 country codes.
 *
 * Used by the compliance engine's cross-cutting economic-operator rule
 * (CC-1): when a manufacturer is established OUTSIDE the EU, Reg (EU)
 * 2019/1020 Art. 4 requires an EU-established operator (importer / AR /
 * fulfilment service provider) to be present. We need to know whether a
 * `Party.country` is inside the Union to decide if that rule fires.
 *
 * EEA (Norway, Iceland, Liechtenstein) is included: the Art. 4 obligation
 * extends to the EEA via the EEA Agreement, and a manufacturer established
 * in an EEA state is treated as in-territory for placing-on-market purposes.
 * Switzerland is NOT in the EEA → treated as third-country.
 *
 * Codes are upper-cased before lookup so callers can pass either case.
 */

/** EU-27 member states (ISO 3166-1 alpha-2). */
const EU_27 = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
] as const;

/** EEA-only states (not EU members but inside the single market). */
const EEA_EXTRA = ["NO", "IS", "LI"] as const;

const EU_EEA_SET = new Set<string>([...EU_27, ...EEA_EXTRA]);

/**
 * True when `country` is an EU or EEA member state. Returns false for
 * undefined / empty / unknown codes — callers treat "unknown origin" as
 * NOT-confirmed-EU and let the engine emit a warning rather than assert
 * compliance on a country it can't place.
 */
export function isEuEeaCountry(country: string | undefined | null): boolean {
  if (!country) return false;
  return EU_EEA_SET.has(country.trim().toUpperCase());
}
