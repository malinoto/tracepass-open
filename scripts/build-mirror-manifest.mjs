/**
 * Regenerate `mirror-manifest.json` — the committed record of which files in
 * this repo are hand-copies of platform modules, and what each one hashed to
 * when it was last reconciled.
 *
 * WHY A MANIFEST AND NOT A DIRECT DIFF. `tracepass-open` is public;
 * `tracepass-platform` is private. CI here cannot read the platform without a
 * cross-repo token in a public workflow, which is a worse problem than the
 * drift. So the platform side is committed here as a hash — the same
 * snapshot-plus-gate shape as `rule-surface.json` and the marketing site's
 * `template-field-counts.json`.
 *
 * Run from a machine with BOTH repos checked out, whenever a mirrored file
 * changes on either side:
 *
 *   node scripts/build-mirror-manifest.mjs
 *   node scripts/build-mirror-manifest.mjs --platform ../elsewhere
 *
 * Then run `npm run check:mirrors` and commit the manifest with the code.
 *
 * NORMALISATION. These files are not byte-identical by design, and `normalise()`
 * accounts for exactly two differences and nothing else:
 *
 *   1. Import specifiers — the platform imports through its `@/` path alias,
 *      this repo through the published package names.
 *   2. The ⚠️ MIRRORED-INTO block in each platform file's docblock. That note
 *      tells a platform developer to regenerate this manifest; it is meaningless
 *      to a consumer of the public package, so it is stripped rather than copied
 *      across. Without this, every mirror notice would read as drift forever.
 *
 * Everything else — logic, comments, ordering, whitespace — still moves the
 * hash. The normalisation is deliberately narrow: anything it cannot account
 * for SHOULD fail.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

const argv = process.argv.slice(2);
const i = argv.indexOf("--platform");
const PLATFORM = resolve(REPO, i !== -1 ? argv[i + 1] : "../tracepass-platform");

/**
 * The mirrors. `open` is relative to this repo, `platform` to the platform repo.
 * Add a pair here when a new platform module is vendored in.
 */
export const MIRRORS = [
  // gs1-utils — byte-identical today; the platform imports no aliased types here.
  { open: "packages/gs1-utils/src/digital-link.ts", platform: "src/lib/gs1/digital-link.ts" },
  { open: "packages/gs1-utils/src/gtin.ts", platform: "src/lib/gs1/gtin.ts" },
  { open: "packages/gs1-utils/src/gln.ts", platform: "src/lib/gs1/gln.ts" },
  { open: "packages/gs1-utils/src/language.ts", platform: "src/lib/gs1/language.ts" },
  { open: "packages/gs1-utils/src/qr.ts", platform: "src/lib/gs1/qr.ts" },

  // dpp-validate vendored copies — differ only by the import specifier.
  {
    open: "packages/dpp-validate/src/vendor/required-roles.ts",
    platform: "src/lib/parties/required-roles.ts",
  },
  { open: "packages/dpp-validate/src/vendor/counts.ts", platform: "src/lib/passports/counts.ts" },

  // publish-gate and the two pure helpers it needs. Previously a recorded
  // divergence: this copy read `validation.required` directly while the
  // platform resolved `requiredBy` per battery category, so it demanded Annex
  // XIII fields from a battery that owes no passport. Now ported in full.
  {
    open: "packages/dpp-validate/src/vendor/publish-gate.ts",
    platform: "src/lib/passports/publish-gate.ts",
  },
  {
    open: "packages/dpp-validate/src/vendor/battery-scope.ts",
    platform: "src/lib/compliance/battery-scope.ts",
  },
  {
    open: "packages/dpp-validate/src/vendor/field-emptiness.ts",
    platform: "src/lib/passports/field-emptiness.ts",
  },
];

/**
 * Strip the platform-only "⚠️ MIRRORED INTO..." docblock note, from the warning
 * line through the blank comment line that closes it. Anchored to that exact
 * marker so it cannot swallow real content.
 */
function stripMirrorNotice(source) {
  return source.replace(
    / \*\n \* ⚠️ MIRRORED INTO THE PUBLIC npm PACKAGE[\s\S]*?commit `mirror-manifest\.json` with the code\.\n/g,
    "",
  );
}

/** Account for the legitimate differences between the repos. See the header. */
export function normalise(source) {
  return (
    stripMirrorNotice(source)
      .replace(/from\s+"@\/types"/g, 'from "@tracepass/dpp-types"')
      // A vendored module importing a sibling: the platform resolves it through
      // its `@/lib/...` alias, this repo through a relative ESM specifier. Both
      // name the same file, so collapse each to its basename.
      .replace(/from\s+"@\/lib\/[^"]*\/([\w-]+)"/g, 'from "./$1"')
      .replace(/from\s+"\.\/([\w-]+)\.js"/g, 'from "./$1"')
      .replace(/\r\n/g, "\n")
  );
}

export function hash(source) {
  return createHash("sha256").update(normalise(source)).digest("hex").slice(0, 16);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // This generator is the ONLY place that can see both repos, so it — not the
  // CI gate — is where a platform-side change must be caught. Refusing to
  // record a platform hash that this repo's copy does not match is what stops
  // "regenerate the manifest" from becoming a way to rubber-stamp drift into
  // green CI. Use --accept-divergence only to record a gap deliberately, and
  // say why in MIRRORS.
  const accept = argv.includes("--accept-divergence");
  const unreconciled = [];

  const files = MIRRORS.map((m) => {
    const platformSrc = readFileSync(join(PLATFORM, m.platform), "utf8");
    const openSrc = readFileSync(join(REPO, m.open), "utf8");
    const platformHash = hash(platformSrc);
    const openHash = hash(openSrc);

    const entry = { open: m.open, platform: m.platform, platformHash };
    if (m.allowDivergence) {
      entry.allowDivergence = m.allowDivergence;
      entry.openHash = openHash; // pin BOTH sides so either moving is caught
    } else if (platformHash !== openHash) {
      unreconciled.push({ ...m, platformHash, openHash });
    }
    return entry;
  });

  if (unreconciled.length && !accept) {
    console.error(
      "✖ Refusing to write the manifest — these mirrors do not match the platform:\n",
    );
    for (const u of unreconciled) {
      console.error(`  • ${u.open}\n    vs ${u.platform}`);
      console.error(`    diff <(sed 's|@/types|@tracepass/dpp-types|' ${join(PLATFORM, u.platform)}) \\\n         ${join(REPO, u.open)}\n`);
    }
    console.error(
      "  Port the change into this repo first, then regenerate. Recording the new\n" +
        "  platform hash without porting would make CI green while the published\n" +
        "  package stays wrong — the exact failure this gate exists to prevent.\n" +
        "  To record a gap DELIBERATELY, add `allowDivergence` to its MIRRORS entry\n" +
        "  (with the reason) or re-run with --accept-divergence.\n",
    );
    process.exit(1);
  }

  const manifest = {
    $comment:
      "Hashes of tracepass-platform modules hand-mirrored into this repo. " +
      "Regenerate with `node scripts/build-mirror-manifest.mjs`; gate with " +
      "`npm run check:mirrors`. Do not hand-edit.",
    files,
  };

  writeFileSync(join(REPO, "mirror-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const diverged = files.filter((f) => f.allowDivergence).length;
  console.log(
    `Wrote mirror-manifest.json — ${files.length} mirrored files` +
      (diverged ? `, ${diverged} with a recorded divergence.` : "."),
  );
}
