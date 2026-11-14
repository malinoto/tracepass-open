/**
 * Every CBV term the EPCIS code emits or accepts must be a term of GS1's Core
 * Business Vocabulary.
 *
 * The anchor is outside the code: GS1's EPCIS 2.0 JSON-LD context, pinned in
 * packages/dpp-epcis/tests/fixtures/epcis-context-2.0.0.jsonld (SHA-256 checked below; source
 * https://ref.gs1.org/standards/epcis/2.0.0/epcis-context.jsonld). It maps every
 * CBV business step, disposition and source/destination type to its
 * `cbv:<Type>-<name>` IRI.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CBV_BIZSTEP_URI, CBV_DISPOSITION_URI, CBV_SOURCE_DEST_TYPE_URI } from "../src/cbv.js";
import { CBV_BIZSTEP_TOKENS, CBV_DISPOSITION_TOKENS } from "../src/validate.js";

const CONTEXT_SHA256 = "e532647e8eb371379b8b0e8602d8981c8566bc60f7351f22c76a5bc865962008";
const bytes = readFileSync(join(__dirname, "fixtures/epcis-context-2.0.0.jsonld"));
const ctx = bytes.toString("utf8");

/**
 * The CBV names of one type that GS1's context defines.
 * @param type the CBV term type: BizStep, Disp or SDT
 * @returns the names after `cbv:<type>-`
 */
function gs1Names(type: string): Set<string> {
  return new Set(
    [...ctx.matchAll(new RegExp(`cbv:${type}-([A-Za-z_]+)`, "g"))].map((m) => m[1] ?? ""),
  );
}

const PREFIX = "https://ref.gs1.org/cbv/";

/**
 * Split our URIs of one type into names, failing on any outside that type's prefix.
 * @param type the CBV term type
 * @param uris our URIs
 * @returns the names
 */
function ourNames(type: string, uris: Record<string, string>): string[] {
  return Object.values(uris).map((u) => {
    expect(u.startsWith(`${PREFIX}${type}-`), u).toBe(true);
    return u.slice(`${PREFIX}${type}-`.length);
  });
}

describe("GS1 EPCIS 2.0 context anchor", () => {
  it("is the pinned file", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(CONTEXT_SHA256);
    expect(gs1Names("BizStep").size).toBeGreaterThan(30);
    expect(gs1Names("Disp").size).toBeGreaterThan(25);
    expect(gs1Names("SDT").size).toBeGreaterThanOrEqual(3);
  });
});

describe("CBV terms against GS1", () => {
  it("every emitted bizStep, disposition and source/destination type is a CBV term", () => {
    const bad = [
      ...ourNames("BizStep", CBV_BIZSTEP_URI).filter((n) => !gs1Names("BizStep").has(n)),
      ...ourNames("Disp", CBV_DISPOSITION_URI).filter((n) => !gs1Names("Disp").has(n)),
      ...ourNames("SDT", CBV_SOURCE_DEST_TYPE_URI).filter((n) => !gs1Names("SDT").has(n)),
    ];
    expect(bad, `not in GS1 CBV: ${bad.join(", ")}`).toEqual([]);
  });

  it("the validator's short-form tokens are exactly GS1's business steps and dispositions", () => {
    expect([...CBV_BIZSTEP_TOKENS].sort()).toEqual([...gs1Names("BizStep")].sort());
    expect([...CBV_DISPOSITION_TOKENS].sort()).toEqual([...gs1Names("Disp")].sort());
  });
});
