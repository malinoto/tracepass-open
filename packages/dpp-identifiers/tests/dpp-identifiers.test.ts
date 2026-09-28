import { describe, it, expect } from "vitest";
import {
  validateProductIdentifier,
  validateOperatorIdentifier,
  validateFacilityIdentifier,
  identifierToUri,
  identifierOwnUrl,
  parseResolverPath,
  parseDiQuery,
  diQueryCandidateKeys,
  identifierKey,
  normalizeDoi,
  resolveProductIdentifier,
} from "../src/index.js";
import type { ProductIdentifier, OperatorIdentifier, FacilityIdentifier, Passport } from "@tracepass/dpp-types";

// ── GS1 product identifier ────────────────────────────────────────────────────

describe("validateProductIdentifier — gs1", () => {
  it("accepts a valid GTIN-14 with serial", () => {
    const id: ProductIdentifier = { scheme: "gs1", gtin: "05449000000996", serialNumber: "SN-1" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ scheme: "gs1", gtin: "05449000000996" });
  });

  it("normalises GTIN-13 to 14 digits", () => {
    // 5449000000996 is a valid EAN-13; left-padded → 05449000000996
    const id: ProductIdentifier = { scheme: "gs1", gtin: "5449000000996", serialNumber: "SN-1" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { gtin: string }).gtin).toBe("05449000000996");
  });

  it("normalises GTIN-12 to 14 digits", () => {
    // 012345678905 is a valid UPC-A; as GTIN-14: 00012345678905
    const id: ProductIdentifier = { scheme: "gs1", gtin: "012345678905", serialNumber: "X" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { gtin: string }).gtin).toBe("00012345678905");
  });

  it("normalises GTIN-8 to 14 digits", () => {
    // 96385074 is a valid GTIN-8 (check digit 4); as GTIN-14: 00000096385074
    const id: ProductIdentifier = { scheme: "gs1", gtin: "96385074", serialNumber: "X" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { gtin: string }).gtin).toBe("00000096385074");
  });

  it("rejects a bad GTIN-14 check digit", () => {
    const id: ProductIdentifier = { scheme: "gs1", gtin: "05449000000997", serialNumber: "SN-1" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/check digit/i);
  });

  it("rejects a GTIN with non-numeric characters", () => {
    const id: ProductIdentifier = { scheme: "gs1", gtin: "054490X0000996", serialNumber: "S" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid GTIN length (e.g. 11 digits)", () => {
    const id: ProductIdentifier = { scheme: "gs1", gtin: "05449000009", serialNumber: "S" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(false);
  });

  it("rejects a serial with non-ASCII characters", () => {
    const id: ProductIdentifier = { scheme: "gs1", gtin: "05449000000996", serialNumber: "SNé" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /ascii/i.test(e))).toBe(true);
  });
});

// ── ISO 15459 product identifier ──────────────────────────────────────────────

describe("validateProductIdentifier — iso15459", () => {
  it("accepts a valid iso15459 identifier", () => {
    const id: ProductIdentifier = {
      scheme: "iso15459",
      issuingAgencyCode: "MH",
      primaryId: "ABC123",
      raw: "MHABC123",
    };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(true);
  });

  it("accepts an agency code of 1 character", () => {
    const id: ProductIdentifier = {
      scheme: "iso15459",
      issuingAgencyCode: "A",
      primaryId: "X1",
      raw: "AX1",
    };
    expect(validateProductIdentifier(id).ok).toBe(true);
  });

  it("rejects an agency code starting with a digit", () => {
    const id: ProductIdentifier = {
      scheme: "iso15459",
      issuingAgencyCode: "1A",
      primaryId: "X",
      raw: "1AX",
    };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /letter/i.test(e) || /digit/i.test(e))).toBe(true);
  });

  it("rejects an agency code longer than 3 characters", () => {
    const id: ProductIdentifier = {
      scheme: "iso15459",
      issuingAgencyCode: "ABCD",
      primaryId: "X",
      raw: "ABCDX",
    };
    expect(validateProductIdentifier(id).ok).toBe(false);
  });

  it("rejects an empty primaryId", () => {
    const id: ProductIdentifier = {
      scheme: "iso15459",
      issuingAgencyCode: "MH",
      primaryId: "",
      raw: "MH",
    };
    expect(validateProductIdentifier(id).ok).toBe(false);
  });
});

// ── IEC 61406 product identifier ──────────────────────────────────────────────

describe("validateProductIdentifier — iec61406", () => {
  it("accepts a valid https Identification Link", () => {
    const id: ProductIdentifier = {
      scheme: "iec61406",
      uri: "https://example.com/id/product-123",
    };
    expect(validateProductIdentifier(id).ok).toBe(true);
  });

  it("rejects an http (non-https) URL", () => {
    const id: ProductIdentifier = {
      scheme: "iec61406",
      uri: "http://example.com/id/product-123",
    };
    expect(validateProductIdentifier(id).ok).toBe(false);
  });

  it("rejects a URI with non-ASCII characters", () => {
    const id: ProductIdentifier = {
      scheme: "iec61406",
      uri: "https://example.com/id/produit-écologique",
    };
    expect(validateProductIdentifier(id).ok).toBe(false);
  });
});

// ── DID product identifier ────────────────────────────────────────────────────

describe("validateProductIdentifier — did", () => {
  it("accepts a well-formed DID", () => {
    const id: ProductIdentifier = {
      scheme: "did",
      did: "did:web:example.com",
      method: "web",
    };
    expect(validateProductIdentifier(id).ok).toBe(true);
  });

  it("accepts a DID with pct-encoded characters in method-specific-id", () => {
    const id: ProductIdentifier = {
      scheme: "did",
      did: "did:web:example.com%3A8080",
      method: "web",
    };
    expect(validateProductIdentifier(id).ok).toBe(true);
  });

  it("accepts a DID with multiple method-specific-id segments", () => {
    const id: ProductIdentifier = {
      scheme: "did",
      did: "did:web:example.com:path:to:resource",
      method: "web",
    };
    expect(validateProductIdentifier(id).ok).toBe(true);
  });

  it("rejects a DID with uppercase method", () => {
    const id: ProductIdentifier = {
      scheme: "did",
      did: "did:WEB:example.com",
      method: "WEB",
    };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /method/i.test(e) && /lower/i.test(e))).toBe(true);
  });

  it("rejects a DID whose method-specific-id ends with ':'", () => {
    const id: ProductIdentifier = {
      scheme: "did",
      did: "did:web:example.com:",
      method: "web",
    };
    expect(validateProductIdentifier(id).ok).toBe(false);
  });

  it("rejects a DID with no method-specific-id", () => {
    const id: ProductIdentifier = {
      scheme: "did",
      did: "did:web:",
      method: "web",
    };
    expect(validateProductIdentifier(id).ok).toBe(false);
  });

  it("rejects a non-ASCII character in the DID", () => {
    const id: ProductIdentifier = {
      scheme: "did",
      did: "did:web:exémple.com",
      method: "web",
    };
    expect(validateProductIdentifier(id).ok).toBe(false);
  });
});

// ── DOI product identifier ────────────────────────────────────────────────────

describe("validateProductIdentifier — doi", () => {
  it("accepts a valid bare DOI with granularity", () => {
    const id: ProductIdentifier = { scheme: "doi", doi: "10.1234/example-suffix", granularity: "item" };
    expect(validateProductIdentifier(id).ok).toBe(true);
  });

  it("rejects a doi without granularity (EN 18219 §5.6.2(b))", () => {
    const id: ProductIdentifier = { scheme: "doi", doi: "10.1234/example-suffix" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/granularity/i);
  });

  it("accepts and normalises a doi: prefixed form", () => {
    const id: ProductIdentifier = { scheme: "doi", doi: "doi:10.1234/suffix", granularity: "model" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { doi: string }).doi).toBe("10.1234/suffix");
  });

  it("accepts and normalises an https://doi.org/ prefixed form", () => {
    const id: ProductIdentifier = { scheme: "doi", doi: "https://doi.org/10.1234/suffix", granularity: "batch" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { doi: string }).doi).toBe("10.1234/suffix");
  });

  it("normalises to lower-case", () => {
    const id: ProductIdentifier = { scheme: "doi", doi: "10.1234/UPPER-SUFFIX", granularity: "item" };
    const r = validateProductIdentifier(id);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { doi: string }).doi).toBe("10.1234/upper-suffix");
  });

  it("rejects a DOI with a short registrant (< 4 digits)", () => {
    const id: ProductIdentifier = { scheme: "doi", doi: "10.12/suffix" };
    expect(validateProductIdentifier(id).ok).toBe(false);
  });

  it("rejects a DOI with no suffix after '/'", () => {
    const id: ProductIdentifier = { scheme: "doi", doi: "10.1234/" };
    expect(validateProductIdentifier(id).ok).toBe(false);
  });
});

// ── Battery category restriction ──────────────────────────────────────────────

describe("validateProductIdentifier — battery category", () => {
  it("accepts gs1 for battery", () => {
    const id: ProductIdentifier = { scheme: "gs1", gtin: "05449000000996", serialNumber: "SN" };
    expect(validateProductIdentifier(id, { category: "battery" }).ok).toBe(true);
  });

  it("accepts iso15459 for battery", () => {
    const id: ProductIdentifier = {
      scheme: "iso15459",
      issuingAgencyCode: "MH",
      primaryId: "BATT-001",
      raw: "MHBATT-001",
    };
    expect(validateProductIdentifier(id, { category: "battery" }).ok).toBe(true);
  });

  it("rejects did for battery with an explanation citing Art. 77(3)", () => {
    const id: ProductIdentifier = { scheme: "did", did: "did:web:example.com", method: "web" };
    const r = validateProductIdentifier(id, { category: "battery" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Art\. 77\(3\)/);
  });

  it("rejects doi for battery", () => {
    const id: ProductIdentifier = { scheme: "doi", doi: "10.1234/example" };
    expect(validateProductIdentifier(id, { category: "battery" }).ok).toBe(false);
  });

  it("rejects iec61406 for battery", () => {
    const id: ProductIdentifier = {
      scheme: "iec61406",
      uri: "https://example.com/id/x",
    };
    expect(validateProductIdentifier(id, { category: "battery" }).ok).toBe(false);
  });
});

// ── LEI via iso6523 operator identifier ──────────────────────────────────────

describe("validateOperatorIdentifier — LEI (iso6523 icd 0199)", () => {
  // 5493001KJTIIGC8Y1R12 is a known real LEI; MOD 97-10 passes (verified: ≡ 1).
  const validLei = "5493001KJTIIGC8Y1R12";

  it("accepts a valid LEI", () => {
    const id: OperatorIdentifier = { scheme: "iso6523", icd: "0199", value: validLei };
    const r = validateOperatorIdentifier(id);
    expect(r.ok).toBe(true);
  });

  it("verifies LEI check digits in the test itself (MOD 97-10 = 1)", () => {
    // Convert A–Z → 10–35, digits → as-is; the resulting number mod 97 must be 1.
    const digits = validLei
      .split("")
      .map((c) => {
        const code = c.charCodeAt(0);
        return code >= 65 ? String(code - 55) : c;
      })
      .join("");
    let remainder = 0;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
    expect(remainder).toBe(1);
  });

  it("rejects a LEI with a flipped check digit", () => {
    // Flip the last digit: 2 → 3
    const badLei = validLei.slice(0, -1) + "3";
    const id: OperatorIdentifier = { scheme: "iso6523", icd: "0199", value: badLei };
    const r = validateOperatorIdentifier(id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/MOD 97/i);
  });

  it("rejects a LEI with the wrong length", () => {
    const id: OperatorIdentifier = { scheme: "iso6523", icd: "0199", value: "SHORT" };
    expect(validateOperatorIdentifier(id).ok).toBe(false);
  });

  it("rejects an LEI as a product identifier (scheme 'lei' does not exist)", () => {
    // There is no ProductIdentifier with scheme "lei" — the union has no such member.
    // This test demonstrates that passing an object with scheme:"lei" is a type error
    // at compile time. At runtime the exhaustiveness guard returns an error.
    // We cast to ProductIdentifier to verify the runtime path.
    const badId = { scheme: "lei", value: validLei } as unknown as ProductIdentifier;
    const r = validateProductIdentifier(badId);
    expect(r.ok).toBe(false);
  });
});

// ── GLN operator identifier ───────────────────────────────────────────────────

describe("validateOperatorIdentifier — gln", () => {
  it("accepts a valid GLN", () => {
    const id: OperatorIdentifier = { scheme: "gln", gln: "5412345000013" };
    expect(validateOperatorIdentifier(id).ok).toBe(true);
  });

  it("rejects an invalid GLN", () => {
    const id: OperatorIdentifier = { scheme: "gln", gln: "5412345000014" };
    expect(validateOperatorIdentifier(id).ok).toBe(false);
  });
});

// ── GLN facility identifier ───────────────────────────────────────────────────

describe("validateFacilityIdentifier", () => {
  it("accepts a valid GLN", () => {
    expect(validateFacilityIdentifier({ scheme: "gln", gln: "5412345000013" }).ok).toBe(true);
  });

  it("accepts a GLN with an extension", () => {
    expect(
      validateFacilityIdentifier({ scheme: "gln", gln: "5412345000013", extension: "DOCK-1" }).ok,
    ).toBe(true);
  });

  it("rejects an empty extension string", () => {
    expect(
      validateFacilityIdentifier({ scheme: "gln", gln: "5412345000013", extension: "" }).ok,
    ).toBe(false);
  });

  // EN 18219 §6.1–6.5: iso6523, did, doi accepted alongside gln
  it("accepts ISO/IEC 6523 facility identifier (§6.2)", () => {
    const id: FacilityIdentifier = { scheme: "iso6523", icd: "0199", value: "5493001KJTIIGC8Y1R12" };
    expect(validateFacilityIdentifier(id).ok).toBe(true);
  });

  it("accepts DID facility identifier (§6.4)", () => {
    const id: FacilityIdentifier = { scheme: "did", did: "did:web:example.com" };
    expect(validateFacilityIdentifier(id).ok).toBe(true);
  });

  it("accepts DOI facility identifier (§6.5)", () => {
    const id: FacilityIdentifier = { scheme: "doi", doi: "10.1234/facility-a" };
    expect(validateFacilityIdentifier(id).ok).toBe(true);
  });

  it("rejects an invalid DID", () => {
    const id: FacilityIdentifier = { scheme: "did", did: "not-a-did" };
    expect(validateFacilityIdentifier(id).ok).toBe(false);
  });

  it("rejects an invalid DOI", () => {
    const id: FacilityIdentifier = { scheme: "doi", doi: "not-a-doi" };
    expect(validateFacilityIdentifier(id).ok).toBe(false);
  });
});

// ── identifierToUri ───────────────────────────────────────────────────────────

describe("identifierToUri", () => {
  it("emits the GTIN-14 form for a GTIN-8, -12 or -13", () => {
    expect(identifierToUri({ scheme: "gs1", gtin: "4006381333931", serialNumber: "A1" }, "id.example")).toBe(
      "https://id.example/01/04006381333931/21/A1",
    );
    expect(identifierToUri({ scheme: "gs1", gtin: "96385074", serialNumber: "A1" }, "id.example")).toBe(
      "https://id.example/01/00000096385074/21/A1",
    );
    expect(identifierToUri({ scheme: "gs1", gtin: "036000291452", serialNumber: "A1" }, "id.example")).toBe(
      "https://id.example/01/00036000291452/21/A1",
    );
  });

  const RESOLVER = "resolver.example.com";

  it("builds a GS1 Digital Link URI", () => {
    const id: ProductIdentifier = { scheme: "gs1", gtin: "05449000000996", serialNumber: "SN-1" };
    expect(identifierToUri(id, RESOLVER)).toBe(
      "https://resolver.example.com/01/05449000000996/21/SN-1",
    );
  });

  it("percent-encodes a serial with '/' and spaces", () => {
    const id: ProductIdentifier = {
      scheme: "gs1",
      gtin: "05449000000996",
      serialNumber: "SN/1 2",
    };
    expect(identifierToUri(id, RESOLVER)).toBe(
      "https://resolver.example.com/01/05449000000996/21/SN%2F1%202",
    );
  });

  it("builds ISO/IEC 18975 query form for iso15459 (EN 18219 §5.2.2)", () => {
    const id: ProductIdentifier = {
      scheme: "iso15459",
      issuingAgencyCode: "MH",
      primaryId: "ABC123",
      raw: "MHABC123",
    };
    // IAC + primaryId concatenated in .25P; no separator
    expect(identifierToUri(id, RESOLVER)).toBe(
      "https://resolver.example.com/?.25P=MHABC123",
    );
  });

  it("includes serial in .S parameter for iso15459", () => {
    const id: ProductIdentifier = {
      scheme: "iso15459",
      issuingAgencyCode: "MH",
      primaryId: "ABC123",
      serial: "S1",
      raw: "MHABC123.S1",
    };
    expect(identifierToUri(id, RESOLVER)).toBe(
      "https://resolver.example.com/?.25P=MHABC123&.S=S1",
    );
  });

  it("percent-encodes special chars in iso15459 .25P and .S", () => {
    const id: ProductIdentifier = {
      scheme: "iso15459",
      issuingAgencyCode: "MH",
      primaryId: "ABC123",
      serial: "S/1 2",
      raw: "MHABC123.S/1 2",
    };
    const uri = identifierToUri(id, RESOLVER)!;
    const url = new URL(uri);
    // URLSearchParams.get decodes; the raw URI should have encoded the slash+space
    expect(url.searchParams.get(".25P")).toBe("MHABC123");
    expect(url.searchParams.get(".S")).toBe("S/1 2");
    expect(uri).toContain("S%2F1%202");
  });

  it("returns null for iec61406, did, doi (they carry their own URL)", () => {
    expect(
      identifierToUri({ scheme: "iec61406", uri: "https://x.com/id/1" }, RESOLVER),
    ).toBeNull();
    expect(
      identifierToUri({ scheme: "did", did: "did:web:example.com", method: "web" }, RESOLVER),
    ).toBeNull();
    expect(identifierToUri({ scheme: "doi", doi: "10.1234/abc" }, RESOLVER)).toBeNull();
  });

  it("strips a trailing slash from the resolver domain", () => {
    const id: ProductIdentifier = { scheme: "gs1", gtin: "05449000000996", serialNumber: "S" };
    expect(identifierToUri(id, "resolver.example.com/")).toBe(
      "https://resolver.example.com/01/05449000000996/21/S",
    );
  });
});

// ── identifierOwnUrl ──────────────────────────────────────────────────────────

describe("identifierOwnUrl", () => {
  it("returns the uri for iec61406", () => {
    const uri = "https://example.com/id/product-123";
    expect(identifierOwnUrl({ scheme: "iec61406", uri })).toBe(uri);
  });

  it("builds a doi.org URL for doi", () => {
    expect(identifierOwnUrl({ scheme: "doi", doi: "10.1234/test" })).toBe(
      "https://doi.org/10.1234/test",
    );
  });

  it("returns null for did (resolution is method-specific)", () => {
    expect(
      identifierOwnUrl({ scheme: "did", did: "did:web:example.com", method: "web" }),
    ).toBeNull();
  });

  it("returns null for gs1 and iso15459 (use identifierToUri)", () => {
    expect(
      identifierOwnUrl({ scheme: "gs1", gtin: "05449000000996", serialNumber: "S" }),
    ).toBeNull();
    expect(
      identifierOwnUrl({
        scheme: "iso15459",
        issuingAgencyCode: "MH",
        primaryId: "X",
        raw: "MHX",
      }),
    ).toBeNull();
  });
});

// ── parseResolverPath ─────────────────────────────────────────────────────────

describe("parseResolverPath", () => {
  it("round-trips gs1 identifierToUri for a serial with '/' and spaces", () => {
    const RESOLVER = "resolver.example.com";
    const id: ProductIdentifier = {
      scheme: "gs1",
      gtin: "05449000000996",
      serialNumber: "SN/1 2",
    };
    const uri = identifierToUri(id, RESOLVER)!;
    const path = new URL(uri).pathname;
    const parsed = parseResolverPath(path);
    expect(parsed).not.toBeNull();
    expect(parsed?.scheme).toBe("gs1");
    if (parsed?.scheme === "gs1") {
      expect(parsed.gtin).toBe("05449000000996");
      expect(parsed.serialNumber).toBe("SN/1 2");
    }
  });

  it("round-trips iso15459 identifierToUri via parseDiQuery + diQueryCandidateKeys", () => {
    // identifierToUri now emits the ISO/IEC 18975 query form; the round-trip
    // goes through parseDiQuery (not parseResolverPath, which handles the legacy
    // agency-path alias).
    const RESOLVER = "resolver.example.com";
    const id: ProductIdentifier = {
      scheme: "iso15459",
      issuingAgencyCode: "MH",
      primaryId: "ABC123",
      serial: "S/1 2",
      raw: "MHABC123.S/1 2",
    };
    const uri = identifierToUri(id, RESOLVER)!;
    const search = new URL(uri).search;
    const parsed = parseDiQuery(search);
    expect(parsed).not.toBeNull();
    expect(parsed?.concatenated25P).toBe("MHABC123");
    expect(parsed?.serial).toBe("S/1 2");
    // The stored identifierKey "iso15459:MH:ABC123:S/1 2" should be among candidates.
    const candidates = diQueryCandidateKeys(parsed!.concatenated25P, parsed?.serial);
    expect(candidates).toContain("iso15459:MH:ABC123:S/1 2");
  });

  it("returns null for paths it cannot parse", () => {
    expect(parseResolverPath("/about")).toBeNull();
    expect(parseResolverPath("")).toBeNull();
    expect(parseResolverPath("/01/05449000000996")).toBeNull(); // no AI 21
  });

  it("handles leading slash and bare path equally", () => {
    const withSlash = parseResolverPath("/01/05449000000996/21/SN-1");
    const bare = parseResolverPath("01/05449000000996/21/SN-1");
    expect(withSlash?.scheme).toBe("gs1");
    expect(bare?.scheme).toBe("gs1");
    if (withSlash?.scheme === "gs1" && bare?.scheme === "gs1") {
      expect(withSlash.gtin).toEqual(bare.gtin);
    }
  });
});

// ── identifierKey ─────────────────────────────────────────────────────────────

describe("identifierKey", () => {
  it("produces stable keys per scheme", () => {
    expect(
      identifierKey({ scheme: "gs1", gtin: "05449000000996", serialNumber: "SN-1" }),
    ).toBe("gs1:05449000000996:SN-1");

    expect(
      identifierKey({
        scheme: "iso15459",
        issuingAgencyCode: "MH",
        primaryId: "ABC",
        serial: "S1",
        raw: "MHABC.S1",
      }),
    ).toBe("iso15459:MH:ABC:S1");

    expect(
      identifierKey({
        scheme: "iso15459",
        issuingAgencyCode: "MH",
        primaryId: "ABC",
        raw: "MHABC",
      }),
    ).toBe("iso15459:MH:ABC:");

    expect(
      identifierKey({ scheme: "iec61406", uri: "https://example.com/id/x" }),
    ).toBe("iec61406:https://example.com/id/x");

    expect(
      identifierKey({ scheme: "did", did: "did:web:example.com", method: "web" }),
    ).toBe("did:did:web:example.com");

    expect(identifierKey({ scheme: "doi", doi: "10.1234/ABC" })).toBe("doi:10.1234/abc");
  });
});

// ── normalizeDoi ──────────────────────────────────────────────────────────────

describe("normalizeDoi", () => {
  it("strips doi: prefix", () => {
    expect(normalizeDoi("doi:10.1234/test")).toBe("10.1234/test");
  });

  it("strips https://doi.org/ prefix", () => {
    expect(normalizeDoi("https://doi.org/10.1234/test")).toBe("10.1234/test");
  });

  it("strips http://doi.org/ prefix (legacy http)", () => {
    expect(normalizeDoi("http://doi.org/10.1234/test")).toBe("10.1234/test");
  });

  it("strips https://dx.doi.org/ prefix (legacy dx proxy)", () => {
    expect(normalizeDoi("https://dx.doi.org/10.1234/test")).toBe("10.1234/test");
  });

  it("strips http://dx.doi.org/ prefix (legacy dx proxy, http)", () => {
    expect(normalizeDoi("http://dx.doi.org/10.1234/test")).toBe("10.1234/test");
  });

  it("strips doi: prefix case-insensitively", () => {
    expect(normalizeDoi("DOI:10.1234/test")).toBe("10.1234/test");
  });

  it("lower-cases the result", () => {
    expect(normalizeDoi("10.1234/TEST")).toBe("10.1234/test");
  });

  it("returns null for non-ASCII input (ISO/IEC 646 requirement)", () => {
    // Non-ASCII suffix violates EN 18219 clause 4.3.2; normalizeDoi rejects it
    // so both product and operator DOI validators inherit the check.
    expect(normalizeDoi("10.1000/café")).toBeNull();
  });

  it("returns null for invalid syntax", () => {
    expect(normalizeDoi("not-a-doi")).toBeNull();
    expect(normalizeDoi("10.12/short")).toBeNull(); // < 4 digit registrant
    expect(normalizeDoi("10.1234/")).toBeNull(); // empty suffix
  });
});

// ── validateOperatorIdentifier — doi (ASCII check inherited from normalizeDoi) ─

describe("validateOperatorIdentifier — doi non-ASCII rejection", () => {
  it("rejects a doi with a non-ASCII character (café)", () => {
    // Previously normalizeDoi did not check ASCII, so this returned ok: true.
    // The fix moves the ISO/IEC 646 check into normalizeDoi itself.
    const id: OperatorIdentifier = { scheme: "doi", doi: "10.1000/café" };
    const r = validateOperatorIdentifier(id);
    expect(r.ok).toBe(false);
  });

  it("still accepts a valid ASCII operator doi", () => {
    const id: OperatorIdentifier = { scheme: "doi", doi: "10.1000/valid-suffix" };
    expect(validateOperatorIdentifier(id).ok).toBe(true);
  });
});

// ── parseResolverPath — agency-shape enforcement ──────────────────────────────

describe("parseResolverPath — agency-shape enforcement", () => {
  it("returns null for a long first segment like '/about/team'", () => {
    // "about" is 5 chars — exceeds the 3-char ISO/IEC 15459 agency code limit.
    expect(parseResolverPath("/about/team")).toBeNull();
  });

  it("returns null for a lowercase first segment ('/mh/ABC' → null)", () => {
    // identifierToUri always emits uppercase agency codes; lowercase input is
    // rejected. The caller may uppercase and retry if needed.
    expect(parseResolverPath("/mh/ABC")).toBeNull();
    expect(parseResolverPath("/mh/abc")).toBeNull();
  });

  it("still parses '/P/x' — a 1-char uppercase route requires consumer pre-emption", () => {
    // After the agency-shape fix, '/P/x' still parses: 'P' is a valid 1-char
    // uppercase agency code. A consumer serving an app route at /P/ MUST match
    // that route BEFORE calling parseResolverPath, because the function cannot
    // distinguish it from a real passport path.
    const r = parseResolverPath("/P/x");
    expect(r).not.toBeNull();
    expect(r?.scheme).toBe("iso15459");
    if (r?.scheme === "iso15459") {
      expect(r.issuingAgencyCode).toBe("P");
      expect(r.primaryId).toBe("x");
    }
  });
});

// ── resolveProductIdentifier ──────────────────────────────────────────────────

describe("resolveProductIdentifier", () => {
  const minPassport = (overrides: Partial<Passport> = {}): Passport => ({
    status: "draft",
    fields: {},
    ...overrides,
  });

  it("returns identifier when present", () => {
    const id: ProductIdentifier = { scheme: "gs1", gtin: "05449000000996", serialNumber: "S1" };
    const p = minPassport({ identifier: id });
    expect(resolveProductIdentifier(p)).toEqual(id);
  });

  it("lifts gs1 into a Gs1Identifier when identifier is absent", () => {
    const p = minPassport({
      gs1: { gtin: "05449000000996", serialNumber: "S1" },
    });
    const result = resolveProductIdentifier(p);
    expect(result).not.toBeUndefined();
    expect(result?.scheme).toBe("gs1");
    if (result?.scheme === "gs1") {
      expect(result.gtin).toBe("05449000000996");
      expect(result.serialNumber).toBe("S1");
    }
  });

  it("preserves digitalLinkUri when lifting gs1", () => {
    const p = minPassport({
      gs1: { gtin: "05449000000996", serialNumber: "S1", digitalLinkUri: "https://id.x.com/01/..." },
    });
    const result = resolveProductIdentifier(p);
    if (result?.scheme === "gs1") {
      expect(result.digitalLinkUri).toBe("https://id.x.com/01/...");
    }
  });

  it("identifier wins when both identifier and gs1 are present", () => {
    const id: ProductIdentifier = {
      scheme: "iso15459",
      issuingAgencyCode: "MH",
      primaryId: "BATT-001",
      raw: "MHBATT-001",
    };
    const p = minPassport({
      identifier: id,
      gs1: { gtin: "05449000000996", serialNumber: "OLD" },
    });
    const result = resolveProductIdentifier(p);
    expect(result?.scheme).toBe("iso15459");
  });

  it("returns undefined when neither identifier nor gs1 is set", () => {
    const p = minPassport();
    expect(resolveProductIdentifier(p)).toBeUndefined();
  });
});
