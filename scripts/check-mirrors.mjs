/**
 * Mirror-drift gate. Fails (exit 1) when a file vendored from the platform no
 * longer matches the hash recorded in `mirror-manifest.json`.
 *
 * WHY THIS EXISTS. Several modules here are hand-copies of platform code —
 * the GS1 identifier helpers, the party-role map, the passport count helpers,
 * the publish gate. Nothing generates one from the other and, until this gate,
 * nothing checked them. The copies have already drifted three times, each
 * invisible to every other check:
 *
 *   1. `CATEGORY_PARTY_ROLES` kept a retired `chemicals` key and shipped it to
 *      npm. Both successors returned NO roles: the publish check stopped
 *      warning about a missing manufacturer.
 *   2. CE-1 existed on the platform and was absent here entirely.
 *   3. `publish-gate` still reads `validation.required` directly while the
 *      platform resolves `requiredBy` per battery category — so this copy
 *      demands Annex XIII fields from a portable battery that owes no passport.
 *
 * The shape they share: **nothing throws.** A vendored copy that has fallen
 * behind is still valid TypeScript, still passes its own tests, and still
 * returns a plausible answer — just the wrong one, published to npm.
 *
 * WHAT IT COMPARES — AND THE HALF IT CANNOT SEE. The manifest records the
 * sha256 of each PLATFORM file after normalising the import specifiers that
 * legitimately differ between the two repos (see `normalise` in
 * build-mirror-manifest.mjs). This repo's copy is hashed the same way and must
 * match.
 *
 * That catches **this repo** drifting from the recorded baseline. It cannot
 * catch **the platform** drifting, because CI here has no access to the private
 * repo — the manifest is the only platform truth available, and a stale
 * manifest agrees with a stale copy. The platform direction is caught by
 * `build-mirror-manifest.mjs`, which refuses to write a manifest whose platform
 * hash has moved without this repo's copy moving too, and by the mirror notice
 * in each platform file telling its editor to regenerate. Run the generator
 * from a checkout with both repos to close that half; this gate is the
 * always-on floor, not the whole story.
 *
 * KNOWN DIVERGENCES are recorded explicitly with `allowDivergence` and pin BOTH
 * sides. A divergence that is tracked stays green; one that WIDENS — either file
 * changing — fails. That way an accepted gap cannot quietly become a different,
 * larger gap.
 *
 * WHEN A MIRRORED FILE CHANGES ON EITHER SIDE, this SHOULD fail. That is the
 * gate working. Port the change, then:
 *
 *   node scripts/build-mirror-manifest.mjs && npm run check:mirrors
 *
 * and commit the manifest with the code.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { hash } from "./build-mirror-manifest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

const manifest = JSON.parse(readFileSync(join(REPO, "mirror-manifest.json"), "utf8"));

const problems = [];
let inSync = 0;
let tracked = 0;

for (const entry of manifest.files) {
  let openSrc;
  try {
    openSrc = readFileSync(join(REPO, entry.open), "utf8");
  } catch {
    problems.push(
      `MISSING ${entry.open} — the manifest expects a mirror of ${entry.platform}.\n` +
        `    Either restore it, or drop the entry from MIRRORS in build-mirror-manifest.mjs.`,
    );
    continue;
  }

  const actual = hash(openSrc);

  if (entry.allowDivergence) {
    // A recorded divergence: this copy is knowingly different. Pin it so the
    // gap cannot widen without someone re-affirming it.
    tracked++;
    if (actual !== entry.openHash) {
      problems.push(
        `${entry.open} changed, and it carries a RECORDED DIVERGENCE from ${entry.platform}:\n` +
          `      "${entry.allowDivergence}"\n` +
          `    Re-check whether that note is still accurate, then regenerate the manifest.`,
      );
    }
    continue;
  }

  if (actual !== entry.platformHash) {
    problems.push(
      `DRIFT ${entry.open}\n` +
        `    does not match ${entry.platform} (expected ${entry.platformHash}, got ${actual}).\n` +
        `    One side changed and the other did not. Diff them, port the change, then\n` +
        `    regenerate the manifest from a checkout that has both repos.`,
    );
    continue;
  }

  inSync++;
}

if (problems.length) {
  console.error("✖ Vendored-file drift vs the platform:\n");
  for (const p of problems) console.error(`  • ${p}`);
  console.error(
    "\n  These files are hand-copies. Nothing generates one from the other, so a\n" +
      "  stale copy fails silently — it still compiles and still returns an answer.\n" +
      "  After reconciling:\n" +
      "    node scripts/build-mirror-manifest.mjs && npm run check:mirrors\n",
  );
  process.exit(1);
}

console.log(
  `✓ Mirrored files match the platform — ${inSync} in sync` +
    (tracked ? `, ${tracked} with a recorded divergence.` : "."),
);
