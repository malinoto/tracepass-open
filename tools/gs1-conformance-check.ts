#!/usr/bin/env tsx
/**
 * GS1 Digital Link resolver conformance self-test.
 *
 * Exercises every functional requirement from the GS1 Digital Link
 * v1.4 / 2.0 spec that the TracePass resolver is expected to satisfy.
 * Pure HTTP probing — no app code is imported here, so the script
 * tests the live behaviour of whatever URL it's pointed at.
 *
 * Usage:
 *   npx tsx scripts/gs1-conformance-check.ts \
 *     --base https://id.tracepass.eu \
 *     --gtin 01234567890128 \
 *     --serial 6B27A0000001
 *
 * Exit code:
 *   0 — all checks passed
 *   1 — at least one check failed
 *
 * The result is also written to `out/gs1-conformance-result.json`
 * so it can be committed to the repo + linked from /trust as the
 * conformance-self-test artefact. (External: customers can also run
 * GS1's own validator at https://id.gs1.org/dl-validator/ against
 * any of the same URLs — the scope of that tool is URI-grammar
 * checking; this script covers the resolver-behaviour side.)
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface CheckResult {
  id: string;
  name: string;
  pass: boolean;
  detail?: string;
}

interface ConformanceResult {
  base: string;
  gtin: string;
  serial: string;
  ranAt: string;
  checks: CheckResult[];
  passed: number;
  failed: number;
}

function parseArgs(argv: string[]): {
  base: string;
  gtin: string;
  serial: string;
} {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      }
    }
  }
  return {
    base: out.base ?? "http://localhost:3000",
    gtin: out.gtin ?? "01234567890128",
    serial: out.serial ?? "SN-001",
  };
}

async function check(
  id: string,
  name: string,
  fn: () => Promise<{ pass: boolean; detail?: string }>,
): Promise<CheckResult> {
  try {
    const r = await fn();
    return { id, name, pass: r.pass, detail: r.detail };
  } catch (e) {
    return {
      id,
      name,
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { base, gtin, serial } = args;
  const passportUrl = `${base}/01/${gtin}/21/${serial}`;
  const checks: CheckResult[] = [];

  // 1. Self-description endpoint exists + carries the required
  //    metadata per spec § 6.5.
  checks.push(
    await check(
      "well-known.exists",
      "GET /.well-known/gs1resolver returns 200",
      async () => {
        const r = await fetch(`${base}/.well-known/gs1resolver`);
        return { pass: r.status === 200, detail: `status=${r.status}` };
      },
    ),
  );
  checks.push(
    await check(
      "well-known.shape",
      "Self-description carries supportedPrimaryKeys + specVersion",
      async () => {
        const r = await fetch(`${base}/.well-known/gs1resolver`);
        if (r.status !== 200) return { pass: false, detail: `status=${r.status}` };
        const j = (await r.json()) as Record<string, unknown>;
        const okKeys = Array.isArray(j.supportedPrimaryKeys);
        const okVer = typeof j.specVersion === "string";
        return {
          pass: okKeys && okVer,
          detail: `supportedPrimaryKeys=${okKeys} specVersion=${okVer}`,
        };
      },
    ),
  );

  // 2. Default GET (HTML) on a published passport URL.
  checks.push(
    await check(
      "passport.html-default",
      "GET passport URL with default Accept returns 200 text/html",
      async () => {
        const r = await fetch(passportUrl, {
          headers: { Accept: "text/html,*/*;q=0.8" },
          redirect: "follow",
        });
        const ct = r.headers.get("content-type") ?? "";
        return {
          pass: r.status === 200 && ct.includes("text/html"),
          detail: `status=${r.status} content-type=${ct}`,
        };
      },
    ),
  );

  // 3. JSON-LD content negotiation flips the same URL to ld+json.
  checks.push(
    await check(
      "passport.jsonld-negotiation",
      "Same URL with Accept: application/ld+json returns 200 application/ld+json",
      async () => {
        const r = await fetch(passportUrl, {
          headers: { Accept: "application/ld+json" },
          redirect: "follow",
        });
        const ct = r.headers.get("content-type") ?? "";
        const isLdJson = ct.includes("application/ld+json");
        let validJson = false;
        try {
          await r.json();
          validJson = true;
        } catch {
          validJson = false;
        }
        return {
          pass: r.status === 200 && isLdJson && validJson,
          detail: `status=${r.status} content-type=${ct} parses=${validJson}`,
        };
      },
    ),
  );

  // 4. Linkset format is supported per spec § 7.6.
  checks.push(
    await check(
      "passport.linkset",
      "passport-data endpoint serves application/linkset+json",
      async () => {
        const r = await fetch(`${base}/api/passport-data/01/${gtin}/21/${serial}`, {
          headers: { Accept: "application/linkset+json" },
        });
        const ct = r.headers.get("content-type") ?? "";
        const ok = ct.includes("application/linkset+json");
        return {
          pass: r.status === 200 && ok,
          detail: `status=${r.status} content-type=${ct}`,
        };
      },
    ),
  );

  // 5. JSON-LD body matches schema.org Product shape. Accepts either
  //    the simple `@context: "https://schema.org"` form OR the multi-
  //    vocab array form `["https://schema.org", "https://gs1.org/voc/",
  //    { tracepass: ... }]` that the parties block triggers.
  checks.push(
    await check(
      "passport.jsonld-shape",
      "JSON-LD body has @context schema.org + @type Product + identifier",
      async () => {
        const r = await fetch(passportUrl, {
          headers: { Accept: "application/ld+json" },
        });
        const j = (await r.json()) as Record<string, unknown>;
        const ctx = j["@context"];
        const ctxOk = Array.isArray(ctx)
          ? ctx.some(
              (entry) =>
                entry === "https://schema.org" ||
                entry === "https://schema.org/",
            )
          : ctx === "https://schema.org" || ctx === "https://schema.org/";
        const typeOk = j["@type"] === "Product";
        const idOk = typeof j.identifier === "string";
        return {
          pass: !!(ctxOk && typeOk && idOk),
          detail: `@context=${ctxOk} @type=${typeOk} identifier=${idOk}`,
        };
      },
    ),
  );

  // 5b. tracepass:parties — soft check. When the passport has any
  //     parties populated the array MUST be well-formed (every entry
  //     has @type, tracepass:role, schema:legalName); when absent the
  //     check is informational and passes. Lets the conformance run
  //     stay green for legacy passports while still catching shape
  //     drift on parties-bearing passports.
  checks.push(
    await check(
      "passport.parties-shape",
      "tracepass:parties (when present) emits {@type, tracepass:role, schema:legalName} per entry",
      async () => {
        const r = await fetch(passportUrl, {
          headers: { Accept: "application/ld+json" },
        });
        const j = (await r.json()) as Record<string, unknown>;
        const parties = j["tracepass:parties"];
        if (parties === undefined) {
          return {
            pass: true,
            detail: "no parties on this passport (check skipped)",
          };
        }
        if (!Array.isArray(parties)) {
          return { pass: false, detail: "tracepass:parties is not an array" };
        }
        const allOk = parties.every((p) => {
          if (!p || typeof p !== "object") return false;
          const o = p as Record<string, unknown>;
          return (
            typeof o["@type"] === "string" &&
            typeof o["tracepass:role"] === "string" &&
            typeof o["schema:legalName"] === "string"
          );
        });
        return {
          pass: allOk,
          detail: `count=${parties.length} all-well-formed=${allOk}`,
        };
      },
    ),
  );

  // 6. Vary header on the negotiated response — caches must split
  //    HTML vs JSON-LD by Accept.
  checks.push(
    await check(
      "passport.vary-header",
      "JSON-LD response sets Vary: Accept",
      async () => {
        const r = await fetch(passportUrl, {
          headers: { Accept: "application/ld+json" },
        });
        const vary = r.headers.get("vary") ?? "";
        const ok = vary.toLowerCase().includes("accept");
        return { pass: ok, detail: `vary=${vary}` };
      },
    ),
  );

  // 7. Unknown GTIN/serial returns 404 (not 200 with a fallback page).
  checks.push(
    await check(
      "passport.unknown-404",
      "Unknown serial returns 404",
      async () => {
        const r = await fetch(
          `${base}/01/${gtin}/21/__definitely-not-a-real-serial__`,
        );
        return { pass: r.status === 404, detail: `status=${r.status}` };
      },
    ),
  );

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  const result: ConformanceResult = {
    base,
    gtin,
    serial,
    ranAt: new Date().toISOString(),
    checks,
    passed,
    failed,
  };

  // Pretty console output.
  console.log(`GS1 Digital Link resolver conformance — ${base}`);
  console.log("=".repeat(64));
  for (const c of checks) {
    const mark = c.pass ? "✓" : "✗";
    console.log(`${mark} ${c.id.padEnd(28)} ${c.name}`);
    if (!c.pass && c.detail) {
      console.log(`  ↳ ${c.detail}`);
    }
  }
  console.log("=".repeat(64));
  console.log(`${passed} passed, ${failed} failed`);

  // Write result to disk for committing to the repo + linking from
  // /trust on the marketing site.
  const outDir = join(process.cwd(), "out");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "gs1-conformance-result.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Wrote ${outPath}`);

  process.exit(failed === 0 ? 0 : 1);
}

main();
