import { describe, it, expect } from "vitest";
import {
  buildCommissioningEvent,
  buildEventId,
  mapEventTypeToBizStep,
  normalizeStepToken,
  validateEpcisDocument,
  CBV_BIZSTEP_URI,
  CBV_SOURCE_DEST_TYPE_URI,
  EPCIS_CONTEXT_URL,
  partyUri,
} from "../src/index.js";

// A well-formed EPCIS 2.0 document wrapper around one or more events.
function epcisDocument(events: unknown[]): Record<string, unknown> {
  return {
    "@context": EPCIS_CONTEXT_URL,
    type: "EPCISDocument",
    schemaVersion: "2.0",
    creationDate: "2026-07-19T10:00:00Z",
    epcisBody: { eventList: events },
  };
}

describe("event ids", () => {
  it("builds a stable urn from passport id + discriminator", () => {
    expect(buildEventId("p-123", "commissioning")).toBe(
      "urn:tracepass:epcis:p-123:commissioning",
    );
  });

  it("sanitizes unsafe characters in the discriminator", () => {
    expect(buildEventId("p-123", "supplier report #1")).toBe(
      "urn:tracepass:epcis:p-123:supplier-report--1",
    );
  });
});

describe("buildCommissioningEvent", () => {
  it("builds an ObjectEvent with the CBV commissioning bizStep", () => {
    const ev = buildCommissioningEvent(
      "2026-07-19T10:00:00Z",
      "urn:epc:id:sgtin:demo",
      "p-123",
    ) as Record<string, unknown>;

    expect(ev).not.toBeNull();
    expect(ev.type).toBe("ObjectEvent");
    expect(ev.action).toBe("ADD");
    expect(ev.eventID).toBe("urn:tracepass:epcis:p-123:commissioning");
    expect(ev.bizStep).toBe(CBV_BIZSTEP_URI.commissioning);
    expect(ev.epcList).toEqual(["urn:epc:id:sgtin:demo"]);
    // no GLNs passed → no bizLocation, no destinationList
    expect(ev.bizLocation).toBeUndefined();
    expect(ev.destinationList).toBeUndefined();
  });

  it("adds a bizLocation when a facilityGln is supplied", () => {
    const ev = buildCommissioningEvent(
      "2026-07-19T10:00:00Z",
      "urn:epc:id:sgtin:demo",
      "p-123",
      { facilityGln: "5412345000013" },
    ) as Record<string, unknown>;
    expect(ev.bizLocation).toBeDefined();
    // no operatorGln → no destinationList
    expect(ev.destinationList).toBeUndefined();
  });

  it("adds a destinationList owning_party entry when operatorGln is supplied", () => {
    const ev = buildCommissioningEvent(
      "2026-07-19T10:00:00Z",
      "urn:epc:id:sgtin:demo",
      "p-123",
      { facilityGln: "5412345000013", operatorGln: "5412345000013" },
    ) as Record<string, unknown>;
    expect(ev.bizLocation).toBeDefined();
    expect(ev.destinationList).toBeDefined();
    const dest = ev.destinationList as Array<Record<string, string>>;
    expect(dest).toHaveLength(1);
    expect(dest[0].type).toBe(CBV_SOURCE_DEST_TYPE_URI.owning_party);
    expect(dest[0].destination).toContain("id.gs1.org/417/");
  });

  it("returns null when the timestamp is missing", () => {
    expect(
      buildCommissioningEvent(null, "urn:epc:id:sgtin:demo", "p-123"),
    ).toBeNull();
  });
});

describe("partyUri", () => {
  it("builds an AI 417 PGLN URI for a valid GLN", () => {
    expect(partyUri("5412345000013")).toBe("https://id.gs1.org/417/5412345000013");
  });

  it("returns null for an invalid GLN", () => {
    expect(partyUri("5412345000014")).toBeNull();
    expect(partyUri(null)).toBeNull();
    expect(partyUri(undefined)).toBeNull();
  });
});

describe("CBV bizStep mapping", () => {
  it("normalizes free-text step tokens", () => {
    expect(normalizeStepToken("  Shipping ")).toBe("shipping");
    expect(normalizeStepToken("hot-rolling")).toBe("hot_rolling");
  });

  it("maps a standard CBV step to a ref.gs1.org URI marked standard", () => {
    const m = mapEventTypeToBizStep("shipping");
    expect(m.standard).toBe(true);
    expect(m.bizStep).toBe(CBV_BIZSTEP_URI.shipping);
  });

  it("mints a stable tracepass extension URI for a non-CBV step", () => {
    const m = mapEventTypeToBizStep("hot rolling");
    expect(m.standard).toBe(false);
    expect(m.bizStep).toContain("tracepass.eu/voc/");
    expect(m.bizStep).toContain("hot_rolling");
  });
});

describe("validateEpcisDocument", () => {
  it("accepts a well-formed EPCIS 2.0 document", () => {
    const ev = buildCommissioningEvent(
      "2026-07-19T10:00:00Z",
      "urn:epc:id:sgtin:demo",
      "p-123",
    );
    const result = validateEpcisDocument(epcisDocument([ev]));
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("flags a missing schemaVersion", () => {
    const doc = epcisDocument([]);
    delete doc.schemaVersion;
    const result = validateEpcisDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "$.schemaVersion")).toBe(true);
  });

  it("flags the wrong document type", () => {
    const doc = epcisDocument([]);
    doc.type = "NotADocument";
    const result = validateEpcisDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "$.type")).toBe(true);
  });

  it("rejects a non-object entirely", () => {
    expect(validateEpcisDocument("nope").valid).toBe(false);
    expect(validateEpcisDocument(null).valid).toBe(false);
  });

  it("flags a non-array eventList", () => {
    const doc = epcisDocument([]);
    (doc.epcisBody as Record<string, unknown>).eventList = "not-an-array";
    const result = validateEpcisDocument(doc);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.path === "$.epcisBody.eventList"),
    ).toBe(true);
  });
});
