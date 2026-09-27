import { describe, it, expect } from "vitest";
import {
  validateGtin,
  normalizeGtin,
  toGtin14,
  calculateGtinCheckDigit,
  validateGln,
  calculateGlnCheckDigit,
  normalizeGln,
  buildDigitalLinkUri,
  parseDigitalLinkUri,
  buildDigitalLinkSegments,
  parseAcceptLanguage,
  detectLanguage,
} from "../src/index.js";

// Reference values are real GS1 identifiers whose check digits are fixed by the
// mod-10 algorithm, so these assertions pin the arithmetic, not an arbitrary
// snapshot. Coca-Cola's GTIN-13 5449000000996 becomes GTIN-14 05449000000996;
// 5412345000013 is a standard GLN worked example.

describe("GTIN", () => {
  it("computes the mod-10 check digit for a 13-digit body", () => {
    expect(calculateGtinCheckDigit("0544900000099")).toBe("6");
    expect(calculateGtinCheckDigit("0400638133393")).toBe("1");
  });

  it("accepts a valid GTIN-14 and rejects a wrong check digit", () => {
    expect(validateGtin("05449000000996")).toBe(true);
    expect(validateGtin("05449000000997")).toBe(false);
  });

  it("rejects anything that is not 14 numeric digits", () => {
    expect(validateGtin("5449000000996")).toBe(false); // 13 digits
    expect(validateGtin("054490000009960")).toBe(false); // 15 digits
    expect(validateGtin("0544900000099X")).toBe(false); // non-numeric
    expect(validateGtin("")).toBe(false);
  });

  it("throws when the check-digit body is not exactly 13 digits", () => {
    expect(() => calculateGtinCheckDigit("123")).toThrow();
  });
});

describe("GLN", () => {
  it("computes the mod-10 check digit for a 12-digit body", () => {
    expect(calculateGlnCheckDigit("541234500001")).toBe("3");
  });

  it("accepts a valid GLN-13 and rejects a wrong check digit", () => {
    expect(validateGln("5412345000013")).toBe(true);
    expect(validateGln("5412345000014")).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(validateGln("541234500001")).toBe(false); // 12 digits
    expect(validateGln("54123450000130")).toBe(false); // 14 digits
  });

  it("normalizeGln returns a canonical 13-digit GLN or null", () => {
    expect(normalizeGln("5412345000013")).toBe("5412345000013");
    expect(normalizeGln(" 5412345000013 ")).toBe("5412345000013");
    expect(normalizeGln("5412345000014")).toBeNull(); // bad check digit
    expect(normalizeGln("not-a-gln")).toBeNull();
  });
});

describe("normalizeGtin / toGtin14", () => {
  it("returns a valid GTIN-14 unchanged", () => {
    expect(normalizeGtin("05449000000996")).toBe("05449000000996");
  });

  it("normalises a valid GTIN-13 to 14 digits", () => {
    // EAN-13 5449000000996 → GTIN-14 05449000000996
    expect(normalizeGtin("5449000000996")).toBe("05449000000996");
  });

  it("normalises a valid GTIN-12 (UPC-A) to 14 digits", () => {
    // 012345678905 is a valid UPC-A; as GTIN-14: 00012345678905
    expect(normalizeGtin("012345678905")).toBe("00012345678905");
  });

  it("normalises a valid GTIN-8 to 14 digits", () => {
    // 96385074 is a valid GTIN-8 (check digit: 4); as GTIN-14: 00000096385074
    expect(normalizeGtin("96385074")).toBe("00000096385074");
  });

  it("returns null for a bad check digit after padding", () => {
    // Flip the last digit of a valid GTIN-13
    expect(normalizeGtin("5449000000997")).toBeNull();
  });

  it("returns null for an invalid length (e.g. 11 digits)", () => {
    expect(normalizeGtin("05449000009")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(normalizeGtin("054490000009X")).toBeNull();
    expect(normalizeGtin("")).toBeNull();
  });

  it("toGtin14 is an alias for normalizeGtin", () => {
    expect(toGtin14("5449000000996")).toBe(normalizeGtin("5449000000996"));
    expect(toGtin14("05449000000997")).toBeNull();
  });
});

describe("Digital Link", () => {
  it("builds a /01/{gtin}/21/{serial} URI and strips a trailing slash on the domain", () => {
    const uri = buildDigitalLinkUri("id.tracepass.eu/", "05449000000996", "SN-123");
    expect(uri).toBe("https://id.tracepass.eu/01/05449000000996/21/SN-123");
  });

  it("normalises a GTIN-13 input to 14 digits in the URI", () => {
    const uri = buildDigitalLinkUri("id.tracepass.eu", "5449000000996", "SN-1");
    expect(uri).toBe("https://id.tracepass.eu/01/05449000000996/21/SN-1");
  });

  it("normalises a GTIN-12 input to 14 digits in the URI", () => {
    const uri = buildDigitalLinkUri("id.tracepass.eu", "012345678905", "SN-1");
    expect(uri).toBe("https://id.tracepass.eu/01/00012345678905/21/SN-1");
  });

  it("normalises a GTIN-8 input to 14 digits in the URI", () => {
    const uri = buildDigitalLinkUri("id.tracepass.eu", "40700719", "SN-1");
    expect(uri).toBe("https://id.tracepass.eu/01/00000040700719/21/SN-1");
  });

  it("parses a URI with GTIN-13 in the path and normalises to 14 digits", () => {
    const parsed = parseDigitalLinkUri("https://id.example.com/01/5449000000996/21/SN-1");
    expect(parsed?.gtin).toBe("05449000000996");
    expect(parsed?.serialNumber).toBe("SN-1");
  });

  it("round-trips gtin + serial through build then parse", () => {
    const uri = buildDigitalLinkUri("id.tracepass.eu", "05449000000996", "SN-123");
    expect(parseDigitalLinkUri(uri)).toEqual({
      gtin: "05449000000996",
      serialNumber: "SN-123",
    });
  });

  it("percent-encodes and decodes a serial with reserved characters", () => {
    const uri = buildDigitalLinkUri("id.tracepass.eu", "05449000000996", "A/B C");
    expect(parseDigitalLinkUri(uri)?.serialNumber).toBe("A/B C");
  });

  it("parses a bare path without a scheme, and returns null on a non-Digital-Link URI", () => {
    expect(parseDigitalLinkUri("/01/05449000000996/21/X")?.gtin).toBe("05449000000996");
    expect(parseDigitalLinkUri("https://id.tracepass.eu/about")).toBeNull();
  });

  it("buildDigitalLinkSegments returns the catch-all route segments", () => {
    expect(buildDigitalLinkSegments("05449000000996", "SN-123")).toEqual([
      "01",
      "05449000000996",
      "21",
      "SN-123",
    ]);
  });
});

describe("language", () => {
  it("parses an Accept-Language header into q-ordered tags, preserving the region", () => {
    // Sorted by q descending; the region subtag is kept verbatim (de-DE, not de).
    expect(parseAcceptLanguage("en;q=0.8,de-DE,de;q=0.9")).toEqual([
      "de-DE",
      "de",
      "en",
    ]);
  });

  it("detects the top language from a Request's Accept-Language header", () => {
    const req = new Request("https://id.tracepass.eu/", {
      headers: { "accept-language": "de-DE,de;q=0.9,en;q=0.8" },
    });
    expect(detectLanguage(req)).toBe("de");
  });

  it("prefers an explicit ?lang= query parameter over the header", () => {
    const req = new Request("https://id.tracepass.eu/?lang=bg", {
      headers: { "accept-language": "de-DE" },
    });
    expect(detectLanguage(req)).toBe("bg");
  });
});
