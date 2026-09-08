/**
 * Regenerate `rule-surface.json` — the committed snapshot of the PLATFORM's
 * compliance-rule surface, which `check-rule-drift.mjs` gates against.
 *
 * WHY A SNAPSHOT AND NOT A DIRECT READ. `tracepass-open` is public;
 * `tracepass-platform` is private. CI here cannot read the platform without
 * putting a cross-repo token into a public workflow, which is a worse problem
 * than the drift. So the platform's surface is committed here as data — the
 * same shape as the marketing site's `template-field-counts.json` gate.
 *
 * Run this from a machine that has BOTH repos checked out, whenever the
 * platform's rule set changes:
 *
 *   node scripts/build-rule-surface.mjs
 *   node scripts/build-rule-surface.mjs --platform ../some/other/path
 *
 * Then run `npm run check:rule-drift` and commit both files together.
 *
 * WHAT IT EXTRACTS, and why by regex rather than by importing the module:
 * the platform's `rules.ts` imports `@/`-aliased modules and Mongo-shaped
 * types, so it cannot be imported from here without pulling in the platform's
 * whole build. The surface we need is small and declarative — rule IDs and the
 * registry's category keys — so a targeted parse is sufficient and keeps this
 * script dependency-free. It fails loudly if the shapes it expects are gone,
 * rather than silently recording an empty surface.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

const argv = process.argv.slice(2);
const platformArg = argv.indexOf("--platform");
const PLATFORM = resolve(
  REPO,
  platformArg !== -1 ? argv[platformArg + 1] : "../tracepass-platform",
);

const RULES_TS = join(PLATFORM, "src/lib/compliance/rules.ts");
const OUT = join(REPO, "rule-surface.json");

/** Pull `id: "XXX-N"` declarations — the rule identifiers the engine emits. */
function ruleIds(source) {
  const ids = [...source.matchAll(/\bid:\s*"([A-Z]+-[A-Z0-9]+)"/g)].map((m) => m[1]);
  if (ids.length === 0) {
    throw new Error(`No rule ids found in ${RULES_TS} — the shape changed; fix this script.`);
  }
  return [...new Set(ids)].sort();
}

/** Pull the category keys of CONDITIONAL_RULES, plus which rules each carries. */
function registry(source) {
  const marker = "CONDITIONAL_RULES: Record<string, ConditionalRule[]> = {";
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`CONDITIONAL_RULES not found in ${RULES_TS} — the shape changed; fix this script.`);
  }
  const body = source.slice(start + marker.length).split("\n};")[0];

  const out = {};
  for (const m of body.matchAll(/^\s*"?([a-z][a-z-]*)"?\s*:\s*\[([^\]]*)\]/gm)) {
    // Map the const identifiers in the array to the rule IDs they declare.
    out[m[1]] = m[2]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Object.keys(out).length === 0) {
    throw new Error("CONDITIONAL_RULES parsed to zero categories — refusing to write an empty surface.");
  }
  return out;
}

/**
 * Resolve `const NAME: ConditionalRule = { id: "X-1"` so the snapshot records
 * rule IDs rather than local variable names — the variable name is an
 * implementation detail, the ID is what a consumer sees in a finding.
 */
function constToId(source) {
  const map = {};
  for (const m of source.matchAll(
    /const\s+([A-Za-z0-9_]+)\s*:\s*ConditionalRule\s*=\s*\{\s*\n?\s*id:\s*"([A-Z]+-[A-Z0-9]+)"/g,
  )) {
    map[m[1]] = m[2];
  }
  return map;
}

const source = readFileSync(RULES_TS, "utf8");
const idOf = constToId(source);
const raw = registry(source);

const categories = {};
for (const [cat, consts] of Object.entries(raw)) {
  categories[cat] = consts.map((c) => idOf[c] ?? c).sort();
}

const surface = {
  $comment:
    "Snapshot of tracepass-platform src/lib/compliance/rules.ts. Regenerate with " +
    "`node scripts/build-rule-surface.mjs`; gate with `npm run check:rule-drift`. " +
    "Do not hand-edit.",
  ruleIds: ruleIds(source),
  categories: Object.fromEntries(Object.entries(categories).sort()),
};

writeFileSync(OUT, JSON.stringify(surface, null, 2) + "\n");
console.log(
  `Wrote rule-surface.json — ${surface.ruleIds.length} rules, ${Object.keys(surface.categories).length} categories.`,
);
