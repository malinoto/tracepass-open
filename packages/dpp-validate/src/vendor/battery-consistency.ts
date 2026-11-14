/**
 * Battery cross-field consistency checks (rule BAT-CONS).
 *
 * Several battery passport values are tied to each other by physics or by
 * definition, so a mistyped, mis-extracted or wrongly-unitised value can pass
 * every single-field check while contradicting its neighbours. Each check
 * here compares values that are all present and reports the contradiction;
 * an absent value skips the check (presence is the static tier's job).
 *
 * Spec: knowledgebase `decisions/battery-consistency-checks-spec.md`
 * (owner-approved tolerances). Every result is a warning for the reviewer,
 * never a publish block: the reviewer owns the value, and a datasheet can be
 * right where a rule is approximate.
 *
 * ⚠️ PURE AND IMPORT-FREE ON PURPOSE. This file is mirrored byte-for-byte into
 * the public `@tracepass/dpp-validate` (tracepass-open
 * `packages/dpp-validate/src/vendor/battery-consistency.ts`), gated by that
 * repo's mirror manifest. After changing it, copy it there and run
 * `node scripts/build-mirror-manifest.mjs && npm run check:mirrors`.
 */

/** Which of the ten checks produced an issue. */
export type ConsistencyCheck =
  | "energy"
  | "energy_density"
  | "voltage_order"
  | "temperature_range"
  | "power_ratio"
  | "ageing"
  | "capacity_fade"
  | "recycled_split"
  | "impossible_zero"
  | "identifier_conflict";

/** One contradiction found between passport values. */
export interface ConsistencyIssue {
  check: ConsistencyCheck;
  /** The field the reviewer should look at first. */
  target: string;
  why: string;
  fix: string;
}

/** What the checks read from a passport, supplied by each engine. */
export interface ConsistencyInput {
  /** A field's value as a finite number, or undefined when absent or not numeric. */
  num: (key: string) => number | undefined;
  /** A field's value as a non-empty string, or undefined. */
  str: (key: string) => string | undefined;
  /** The field's English label for messages. */
  label: (key: string) => string;
  /** The passport's own GS1 identifier, when it has one. */
  ownGs1?: { gtin: string; serialNumber: string };
}

/** Relative tolerance for energy vs V × Ah and for energy density (spec §7). */
export const ENERGY_TOLERANCE = 0.1;
/** Margin for the power-ratio bound and for in-service values above the original. */
export const UPPER_BOUND_MARGIN = 0.05;
/** Percentage-point tolerance for capacity fade vs remaining capacity. */
export const FADE_TOLERANCE_POINTS = 3;
/** Percentage-point tolerance for pre- + post-consumer vs total recycled share. */
export const RECYCLED_TOLERANCE_POINTS = 1;

/** Physical quantities that can never be exactly 0. */
export const NONZERO_FIELDS = [
  "ratedCapacity",
  "nominalVoltage",
  "minimumVoltage",
  "maximumVoltage",
  "batteryEnergyTotal",
  "batteryWeight",
  "originalPowerCapability",
  "maximumAllowedBatteryPower",
  "initialInternalResistancePack",
  "initialInternalResistanceCell",
  "initialInternalResistanceModule",
  "currentInternalResistancePack",
  "dynamicInternalResistance",
  "expectedLifetimeCycles",
  "energyDensity",
  "initialEnergyRoundTripEfficiency",
] as const;

/** Each temperature range, as the prefix of its `…Min` / `…Max` pair. */
export const TEMPERATURE_RANGE_PREFIXES = [
  "nominalVoltageTemperatureRange",
  "minimumVoltageTemperatureRange",
  "maximumVoltageTemperatureRange",
  "maximumAllowedBatteryPowerTemperatureRange",
  "temperatureRangeIdle",
] as const;

/** In-service value → the original value it cannot exceed. */
export const AGEING_PAIRS = [
  ["remainingCapacity", "ratedCapacity"],
  ["dynamicRatedCapacity", "ratedCapacity"],
  ["remainingEnergy", "batteryEnergyTotal"],
  ["remainingPowerCapability", "originalPowerCapability"],
  ["remainingPowerCapabilityAt80Soc", "originalPowerCapabilityAt80Soc"],
  ["remainingPowerCapabilityAt20Soc", "originalPowerCapabilityAt20Soc"],
] as const;

/** The metals whose recycled share is split into pre- and post-consumer parts. */
export const RECYCLED_METALS = ["Cobalt", "Lithium", "Nickel"] as const;

/**
 * A number for a message: four significant digits, no float noise.
 * @param n the number
 * @returns its short decimal form
 */
function fmt(n: number): string {
  return String(Number(n.toPrecision(4)));
}

/**
 * A GTIN in its 14-digit form, for comparison.
 * @param gtin 8, 12, 13 or 14 digits
 * @returns the GTIN left-padded with zeros to 14 digits
 */
function gtin14(gtin: string): string {
  return gtin.padStart(14, "0");
}

/**
 * The GTIN and serial a GS1 Digital Link URI carries.
 * @param uri e.g. `https://id.example.eu/01/09506000134352/21/ABC`
 * @returns the parts, or undefined when the string is no Digital Link
 */
export function parseDigitalLinkParts(
  uri: string,
): { gtin: string; serialNumber?: string } | undefined {
  const m = /\/01\/(\d{8,14})(?:\/21\/([^/?#]+))?/.exec(uri);
  const gtin = m?.[1];
  if (gtin === undefined) return undefined;
  const raw = m?.[2];
  if (raw === undefined) return { gtin };
  try {
    return { gtin, serialNumber: decodeURIComponent(raw) };
  } catch {
    return { gtin, serialNumber: raw };
  }
}

/**
 * The GTIN and serial a GS1 element string carries (AI 01 then AI 21).
 * @param s e.g. `0109506000134352` + `21ABC`, with or without parentheses
 * @returns the parts, or undefined when the string does not start with AI 01
 */
export function parseElementStringParts(
  s: string,
): { gtin: string; serialNumber?: string } | undefined {
  const flat = s.replace(/[()\s]/g, "");
  const m = /^01(\d{14})(?:21(.+))?/.exec(flat);
  const gtin = m?.[1];
  if (gtin === undefined) return undefined;
  // A variable-length serial ends at the GS separator (FNC1), when one follows.
  const serialNumber = m?.[2]?.split(String.fromCharCode(29))[0];
  return serialNumber === undefined || serialNumber === "" ? { gtin } : { gtin, serialNumber };
}

/**
 * Relative deviation of a stated value from the value implied by others.
 * @param stated the value on the passport
 * @param expected the value the related fields imply (> 0)
 * @returns |stated − expected| / expected
 */
function deviation(stated: number, expected: number): number {
  return Math.abs(stated - expected) / expected;
}

/**
 * Energy vs nominal voltage × rated capacity, and energy density vs energy / mass.
 * @param input the passport accessors
 * @param out the issue list to append to
 * @returns false when the energy itself contradicts V × Ah, so checks built on
 *   it should be skipped
 */
function checkEnergy(input: ConsistencyInput, out: ConsistencyIssue[]): boolean {
  const { num, label } = input;
  const energy = num("batteryEnergyTotal");
  const voltage = num("nominalVoltage");
  const capacity = num("ratedCapacity");
  if (energy !== undefined && voltage !== undefined && capacity !== undefined) {
    const expected = (voltage * capacity) / 1000;
    if (energy > 0 && expected > 0 && deviation(energy, expected) > ENERGY_TOLERANCE) {
      out.push({
        check: "energy",
        target: "batteryEnergyTotal",
        why: `${label("batteryEnergyTotal")} is ${fmt(energy)} kWh, but nominal voltage × rated capacity gives ${fmt(expected)} kWh (${fmt(voltage)} V × ${fmt(capacity)} Ah).`,
        fix: `Check ${label("batteryEnergyTotal")} and its unit first (a Wh value entered as kWh is 1000× off), then the nominal voltage and rated capacity.`,
      });
      // The density and power-ratio checks divide by this energy; with the
      // energy itself in doubt they would only repeat the same error.
      return false;
    }
  }
  const density = num("energyDensity");
  const mass = num("batteryWeight");
  if (density !== undefined && energy !== undefined && mass !== undefined) {
    const expected = (energy * 1000) / mass;
    if (density > 0 && expected > 0 && deviation(density, expected) > ENERGY_TOLERANCE) {
      out.push({
        check: "energy_density",
        target: "energyDensity",
        why: `${label("energyDensity")} is ${fmt(density)} Wh/kg, but the battery's energy divided by its weight gives ${fmt(expected)} Wh/kg (${fmt(energy)} kWh ÷ ${fmt(mass)} kg).`,
        fix: `Check ${label("energyDensity")}: a datasheet often states the cell's density, which is higher than the battery's. Then check the weight and energy.`,
      });
    }
  }
  return true;
}

/**
 * Minimum < nominal < maximum voltage, and each temperature range's min < max.
 * @param input the passport accessors
 * @param out the issue list to append to
 */
function checkOrdering(input: ConsistencyInput, out: ConsistencyIssue[]): void {
  const { num, label } = input;
  const order = ["minimumVoltage", "nominalVoltage", "maximumVoltage"] as const;
  const present = order.flatMap((key) => {
    const v = num(key);
    return v === undefined ? [] : [{ key, v }];
  });
  const broken = present.some((p, i) => i > 0 && p.v <= (present[i - 1]?.v ?? -Infinity));
  if (broken && present.length >= 2) {
    out.push({
      check: "voltage_order",
      target: "nominalVoltage",
      why: `The voltages are not in order: ${present.map((p) => `${label(p.key)} ${fmt(p.v)} V`).join(", ")}. The minimum must be below the nominal, and the nominal below the maximum.`,
      fix: "Check which voltage was entered in the wrong field or with the wrong value.",
    });
  }
  for (const prefix of TEMPERATURE_RANGE_PREFIXES) {
    const min = num(`${prefix}Min`);
    const max = num(`${prefix}Max`);
    if (min !== undefined && max !== undefined && min >= max) {
      out.push({
        check: "temperature_range",
        target: `${prefix}Max`,
        why: `${label(`${prefix}Min`)} is ${fmt(min)} °C, not below ${label(`${prefix}Max`)} at ${fmt(max)} °C.`,
        fix: "Check whether the two ends of the range were swapped.",
      });
    }
  }
}

/**
 * The Annex IV Part B(2) ratio's implied nominal power ≤ maximum allowed power,
 * and in-service values ≤ their original values.
 * @param input the passport accessors
 * @param out the issue list to append to
 * @param energyTrusted false when the energy contradicts V × Ah (ratio skipped)
 */
function checkUpperBounds(
  input: ConsistencyInput,
  out: ConsistencyIssue[],
  energyTrusted: boolean,
): void {
  const { num, label } = input;
  const ratio = num("ratioMaxPowerMaxEnergy");
  const energy = energyTrusted ? num("batteryEnergyTotal") : undefined;
  const maxPower = num("maximumAllowedBatteryPower");
  if (ratio !== undefined && energy !== undefined && maxPower !== undefined && maxPower > 0) {
    const implied = ratio * energy * 1000;
    if (implied > maxPower * (1 + UPPER_BOUND_MARGIN)) {
      out.push({
        check: "power_ratio",
        target: "ratioMaxPowerMaxEnergy",
        why: `${label("ratioMaxPowerMaxEnergy")} is ${fmt(ratio)}, which with ${fmt(energy)} kWh implies a nominal power of ${fmt(implied)} W, above ${label("maximumAllowedBatteryPower")} (${fmt(maxPower)} W).`,
        fix: "The ratio divides nominal power (W) by energy (Wh). Check it was not computed from kWh, or from a higher power figure.",
      });
    }
  }
  for (const [current, original] of AGEING_PAIRS) {
    if (original === "batteryEnergyTotal" && !energyTrusted) continue;
    const now = num(current);
    const was = num(original);
    if (now !== undefined && was !== undefined && was > 0 && now > was * (1 + UPPER_BOUND_MARGIN)) {
      out.push({
        check: "ageing",
        target: current,
        why: `${label(current)} is ${fmt(now)}, above ${label(original)} at ${fmt(was)}. A battery does not gain capacity, energy or power with use.`,
        fix: `Check ${label(current)} and its unit, then ${label(original)}.`,
      });
    }
  }
  const fade = num("capacityFade");
  const remaining = num("remainingCapacity");
  const rated = num("ratedCapacity");
  if (fade !== undefined && remaining !== undefined && rated !== undefined && rated > 0) {
    const expected = (1 - remaining / rated) * 100;
    if (Math.abs(fade - expected) > FADE_TOLERANCE_POINTS) {
      out.push({
        check: "capacity_fade",
        target: "capacityFade",
        why: `${label("capacityFade")} is ${fmt(fade)} %, but remaining capacity against rated capacity gives ${fmt(expected)} % (${fmt(remaining)} Ah of ${fmt(rated)} Ah).`,
        fix: `Check ${label("capacityFade")}, then the remaining and rated capacity.`,
      });
    }
  }
}

/**
 * Recycled share = pre-consumer + post-consumer share (Art. 8(1)), per metal.
 * @param input the passport accessors
 * @param out the issue list to append to
 */
function checkRecycledSplit(input: ConsistencyInput, out: ConsistencyIssue[]): void {
  const { num, label } = input;
  for (const metal of RECYCLED_METALS) {
    const totalKey = `recycledContent${metal}`;
    const preKey = `preConsumerRecycled${metal}Share`;
    const postKey = `postConsumerRecycled${metal}Share`;
    const total = num(totalKey);
    const pre = num(preKey);
    const post = num(postKey);
    if (total === undefined || (pre === undefined && post === undefined)) continue;
    const parts = (pre ?? 0) + (post ?? 0);
    const bothGiven = pre !== undefined && post !== undefined;
    const off = bothGiven
      ? Math.abs(parts - total) > RECYCLED_TOLERANCE_POINTS
      : parts > total + RECYCLED_TOLERANCE_POINTS;
    if (off) {
      out.push({
        check: "recycled_split",
        target: totalKey,
        why: `${label(totalKey)} is ${fmt(total)} %, but the pre-consumer and post-consumer shares${bothGiven ? " add up to" : " already reach"} ${fmt(parts)} %. The recycled share is the part recovered from manufacturing waste plus the part recovered from post-consumer waste.`,
        fix: `Check ${label(totalKey)} against ${label(preKey)} and ${label(postKey)}.`,
      });
    }
  }
}

/**
 * Physical quantities that are exactly 0.
 * @param input the passport accessors
 * @param out the issue list to append to
 */
function checkZeros(input: ConsistencyInput, out: ConsistencyIssue[]): void {
  for (const key of NONZERO_FIELDS) {
    if (input.num(key) === 0) {
      out.push({
        check: "impossible_zero",
        target: key,
        why: `${input.label(key)} is 0, which no battery can have.`,
        fix: `Enter the measured value of ${input.label(key)}, checking its unit (for example mΩ written as Ω), or leave it empty until it is known.`,
      });
    }
  }
}

/**
 * The GS1 identifiers inside the passport name the passport's own unit.
 * @param input the passport accessors
 * @param out the issue list to append to
 */
function checkIdentifiers(input: ConsistencyInput, out: ConsistencyIssue[]): void {
  const own = input.ownGs1;
  if (own === undefined) return;
  const sources = [
    ["batteryUniqueIdentifier", parseDigitalLinkParts],
    ["batteryIdDmcCode", parseElementStringParts],
  ] as const;
  for (const [key, parse] of sources) {
    const raw = input.str(key);
    const parts = raw === undefined ? undefined : parse(raw);
    if (parts === undefined) continue;
    const gtinDiffers = gtin14(parts.gtin) !== gtin14(own.gtin);
    const serialDiffers =
      parts.serialNumber !== undefined && parts.serialNumber !== own.serialNumber;
    if (gtinDiffers || serialDiffers) {
      out.push({
        check: "identifier_conflict",
        target: key,
        why: `${input.label(key)} names GTIN ${parts.gtin}${parts.serialNumber === undefined ? "" : `, serial ${parts.serialNumber}`}, but this passport is GTIN ${own.gtin}, serial ${own.serialNumber}.`,
        fix: `Correct ${input.label(key)} to this unit's identifier, or check the passport was created for the right unit.`,
      });
    }
  }
}

/**
 * Run every battery consistency check.
 * @param input the passport accessors
 * @returns one issue per contradiction found, in check order
 */
export function checkBatteryConsistency(input: ConsistencyInput): ConsistencyIssue[] {
  const out: ConsistencyIssue[] = [];
  const energyTrusted = checkEnergy(input, out);
  checkOrdering(input, out);
  checkUpperBounds(input, out, energyTrusted);
  checkRecycledSplit(input, out);
  checkZeros(input, out);
  checkIdentifiers(input, out);
  return out;
}
