/**
 * How detailed a battery composition list is.
 *
 * Annex XIII 2(a) of Reg (EU) 2023/1542 (guidance DP 46) requires the
 * "detailed composition, including materials used in the cathode, anode and
 * electrolyte". It asks for the materials, not their quantities: neither the
 * annex nor DP 46 carries a share. The Commission Battery Passport FAQ (1st ed.,
 * Sep 2026) §7.7 treats a 1 % (DIN SPEC) or 0.1 % (draft CEN TS) threshold as
 * potentially reasonable for which materials to list, "provided the resulting
 * indication of detailed composition is sufficiently detailed and not merely a
 * general indication of chemistry such as 'LFP'". So an entry needs a material;
 * a share is optional, and checked only when given.
 *
 * Entries are objects or strings. The canonical object shape is the template's
 * `entryProperties`: `{substanceName, casNumber, massPercent?}`, with
 * `massPercent` as a share of the battery's total mass. Older data used
 * `{name, weightPercent}` or `{substance, …}`; every known alias is still
 * accepted here, so correct data is never flagged for its key names.
 */

const NAME_KEYS = ["name", "substance", "substanceName", "material"] as const;
const SHARE_KEYS = ["weightPercent", "massPercent", "concentrationPercent", "sharePercent"] as const;

/** A general indication of chemistry rather than a material (FAQ §7.7's "LFP"). */
const CHEMISTRY_LABEL =
  /^(li[- ]?ion|lithium[- ]ion|lfp|lmfp|nmc\s*\d*|ncm\s*\d*|nca|lco|lmo|lto|ni[- ]?mh|nicd|ni[- ]?cd|lead[- ]acid|na[- ]?ion|sodium[- ]ion)$/i;

export const COMPOSITION_FIELDS = [
  "cathodeActiveMaterials",
  "anodeActiveMaterials",
  "electrolyteComposition",
] as const;

export interface CompositionAnalysis {
  /** Number of entries in the list. */
  entries: number;
  /** Entries naming a material that is not a bare chemistry label. */
  materials: number;
  /** Entries naming only a chemistry label such as "LFP" or "NMC811". */
  chemistryLabels: number;
  /** Entries with a numeric share in (0, 100]. */
  withShare: number;
  /** Numeric shares outside (0, 100]. */
  outOfRange: number;
  /** Sum of the valid numeric shares. */
  shareSum: number;
}

function readName(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry.trim() || undefined;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const e = entry as Record<string, unknown>;
  for (const k of NAME_KEYS) {
    const v = e[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function readShare(entry: unknown): number | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const e = entry as Record<string, unknown>;
  for (const k of SHARE_KEYS) {
    const v = e[k];
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** `undefined` when the value is not a non-empty list (nothing to judge). */
export function analyzeComposition(value: unknown): CompositionAnalysis | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const out: CompositionAnalysis = {
    entries: value.length,
    materials: 0,
    chemistryLabels: 0,
    withShare: 0,
    outOfRange: 0,
    shareSum: 0,
  };
  for (const entry of value) {
    const name = readName(entry);
    if (name) {
      if (CHEMISTRY_LABEL.test(name)) out.chemistryLabels++;
      else out.materials++;
    }
    const share = readShare(entry);
    if (share === undefined) continue;
    if (share <= 0 || share > 100) {
      out.outOfRange++;
      continue;
    }
    out.withShare++;
    out.shareSum += share;
  }
  return out;
}

/** Shares may be rounded; allow half a point before calling a sum impossible. */
export const SHARE_SUM_TOLERANCE = 0.5;
