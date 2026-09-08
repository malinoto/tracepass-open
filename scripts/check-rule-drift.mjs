/**
 * Rule-drift gate. Fails (exit 1) when this package's compliance-rule surface
 * disagrees with `rule-surface.json` — the committed snapshot of the platform's
 * `src/lib/compliance/rules.ts`.
 *
 * WHY THIS EXISTS. `dpp-validate` is extracted from the platform's compliance
 * engine by hand. Nothing generates one from the other and nothing checked
 * them, and the copies have already drifted twice in ways no other gate could
 * see:
 *
 *   1. `CONDITIONAL_RULES` kept the key `chemicals` after the category was
 *      split into `detergents` + `paints-coatings`. The lookup missed, so
 *      CHEM-1 (REACH Art. 33) ran for NO category while both successors were
 *      reported `static-only`.
 *   2. CE-1 existed on the platform for five categories and was absent here
 *      entirely, because the package was seeded before CE-1 landed.
 *
 * Both share one shape, and it is why a normal test suite cannot catch them:
 * **a missing registry key is indistinguishable from a category that genuinely
 * has no conditional rules.** Nothing throws. The engine reports
 * `conditionalCoverage: "static-only"`, which is a legitimate value — it tells
 * a consumer "the template's required fields are the whole obligation". When
 * the platform knows a rule applies and this package does not, that sentence is
 * false, and it is published to npm. A silent under-report is the worst failure
 * this package can have, because its stated promise is that it never passes
 * what it could not check.
 *
 * WHAT IT COMPARES, and why against the BUILT registry rather than the source:
 * reading `src/rules.ts` as text would re-implement the parse and could agree
 * with a file that does not actually behave that way. Importing `dist/` checks
 * what consumers really get, so the gate runs after `npm run build`.
 *
 * A category present here but absent from the platform is reported too — an
 * over-claim is also drift, and this package must never assert a rule the
 * platform does not stand behind.
 *
 * WHEN THE PLATFORM CHANGES ITS RULES, this SHOULD fail. That is the gate
 * working. Port the change, then regenerate the snapshot and commit both:
 *
 *   node scripts/build-rule-surface.mjs && npm run check:rule-drift
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

const surface = JSON.parse(readFileSync(join(REPO, "rule-surface.json"), "utf8"));

const DIST = join(REPO, "packages/dpp-validate/dist/rules.js");
let CONDITIONAL_RULES;
try {
  ({ CONDITIONAL_RULES } = await import(`file://${DIST}`));
} catch (err) {
  console.error(
    `✖ Could not import ${DIST}\n` +
      `  Run \`npm run build\` first — this gate checks the BUILT registry, ` +
      `which is what consumers actually get.\n  ${err.message}`,
  );
  process.exit(1);
}

const problems = [];

// ── Registry keys ────────────────────────────────────────────────
const expected = Object.keys(surface.categories).sort();
const actual = Object.keys(CONDITIONAL_RULES).sort();

for (const cat of expected) {
  if (!actual.includes(cat)) {
    problems.push(
      `MISSING category "${cat}" — the platform runs [${surface.categories[cat].join(", ")}] here.\n` +
        `    This package reports "${cat}" as static-only, telling consumers no conditional applies.`,
    );
  }
}
for (const cat of actual) {
  if (!expected.includes(cat)) {
    problems.push(
      `EXTRA category "${cat}" — not in the platform's registry.\n` +
        `    Either it is a stale key (the split-category failure), or the platform lost a rule.`,
    );
  }
}

// ── Per-category rule sets ───────────────────────────────────────
for (const cat of expected.filter((c) => actual.includes(c))) {
  const want = surface.categories[cat];
  const have = CONDITIONAL_RULES[cat].map((r) => r.id).sort();
  const missing = want.filter((r) => !have.includes(r));
  const extra = have.filter((r) => !want.includes(r));
  if (missing.length) problems.push(`"${cat}" is missing rule(s): ${missing.join(", ")}`);
  if (extra.length) problems.push(`"${cat}" has rule(s) the platform does not: ${extra.join(", ")}`);
}

// ── Rule IDs overall ─────────────────────────────────────────────
// Catches a rule that exists on the platform but was never ported, even if no
// category references it yet.
const haveIds = [
  ...new Set(Object.values(CONDITIONAL_RULES).flatMap((rs) => rs.map((r) => r.id))),
].sort();
const notPorted = surface.ruleIds.filter(
  (id) => !haveIds.includes(id) && id !== "CC-1", // CC-1 is cross-cutting, not registered per-category
);
if (notPorted.length) {
  problems.push(`Rule(s) on the platform but not in this package: ${notPorted.join(", ")}`);
}

// ── Report ───────────────────────────────────────────────────────
if (problems.length) {
  console.error("✖ Compliance-rule drift vs the platform:\n");
  for (const p of problems) console.error(`  • ${p}`);
  console.error(
    "\n  If the platform changed deliberately, port the change here, then:\n" +
      "    node scripts/build-rule-surface.mjs && npm run check:rule-drift\n" +
      "  and commit rule-surface.json with the code.\n" +
      "  Also update the per-category counts in README.md and\n" +
      "  packages/dpp-validate/README.md — they quote this registry.\n",
  );
  process.exit(1);
}

console.log(
  `✓ Rule surface matches the platform — ${actual.length} categories, ${haveIds.length} rules registered.`,
);
