import { describe, it, expect } from "vitest";
import type { SupplierReportedEvent, SupplyChainEventInput } from "../src/index.js";
import {
  buildCommissioningEvent,
  buildEventId,
  buildSupplierObjectEvent,
  buildTransformationEvent,
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
    expect(buildEventId("p-123", "commissioning")).toBe("urn:tracepass:epcis:p-123:commissioning");
  });

  it("sanitizes unsafe characters in the discriminator", () => {
    expect(buildEventId("p-123", "supplier report #1")).toBe(
      "urn:tracepass:epcis:p-123:supplier-report--1",
    );
  });
});

describe("buildCommissioningEvent", () => {
  it("builds an ObjectEvent with the CBV commissioning bizStep", () => {
    const ev =
      buildCommissioningEvent("2026-07-19T10:00:00Z", "urn:epc:id:sgtin:demo", "p-123") ??
      expect.unreachable("no event built");

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
    const ev =
      buildCommissioningEvent("2026-07-19T10:00:00Z", "urn:epc:id:sgtin:demo", "p-123", {
        facilityGln: "5412345000013",
      }) ?? expect.unreachable("no event built");
    expect(ev.bizLocation).toBeDefined();
    // no operatorGln → no destinationList
    expect(ev.destinationList).toBeUndefined();
  });

  it("adds a destinationList owning_party entry when operatorGln is supplied", () => {
    const ev =
      buildCommissioningEvent("2026-07-19T10:00:00Z", "urn:epc:id:sgtin:demo", "p-123", {
        facilityGln: "5412345000013",
        operatorGln: "5412345000013",
      }) ?? expect.unreachable("no event built");
    expect(ev.bizLocation).toBeDefined();
    expect(ev.destinationList).toBeDefined();
    const dest = ev.destinationList as Array<Record<string, string>>;
    expect(dest).toHaveLength(1);
    expect(dest[0]?.type).toBe(CBV_SOURCE_DEST_TYPE_URI.owning_party);
    expect(dest[0]?.destination).toContain("id.gs1.org/417/");
  });

  it("returns null when the timestamp is missing", () => {
    expect(buildCommissioningEvent(null, "urn:epc:id:sgtin:demo", "p-123")).toBeNull();
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
    const ev = buildCommissioningEvent("2026-07-19T10:00:00Z", "urn:epc:id:sgtin:demo", "p-123");
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
    expect(result.issues.some((i) => i.path === "$.epcisBody.eventList")).toBe(true);
  });
});

describe("validateEpcisDocument issue messages", () => {
  it("shows an object-valued bizStep as JSON, not [object Object]", () => {
    const ev = buildCommissioningEvent("2026-07-19T10:00:00Z", "urn:epc:id:sgtin:demo", "p-123");
    const result = validateEpcisDocument(epcisDocument([{ ...ev, bizStep: { a: 1 } }]));
    const issue =
      result.issues.find((i) => i.path.endsWith(".bizStep")) ??
      expect.unreachable("no bizStep issue was reported");
    expect(issue.message).toContain('bizStep "{"a":1}"');
  });

  it("shows an object-valued disposition as JSON, not [object Object]", () => {
    const ev = buildCommissioningEvent("2026-07-19T10:00:00Z", "urn:epc:id:sgtin:demo", "p-123");
    const result = validateEpcisDocument(epcisDocument([{ ...ev, disposition: ["x"] }]));
    const issue =
      result.issues.find((i) => i.path.endsWith(".disposition")) ??
      expect.unreachable("no disposition issue was reported");
    expect(issue.message).toContain('disposition "["x"]"');
  });
});

describe("event builders tolerate input that ignores the types", () => {
  it("buildSupplierObjectEvent maps a missing or non-string eventType to the unspecified step", () => {
    const missing = JSON.parse(
      '{"timestamp":"2026-07-19T10:00:00Z"}',
    ) as unknown as SupplierReportedEvent;
    const numeric = JSON.parse(
      '{"eventType":42,"timestamp":"2026-07-19T10:00:00Z"}',
    ) as unknown as SupplierReportedEvent;
    for (const report of [missing, numeric]) {
      const ev =
        buildSupplierObjectEvent(report, "urn:epc:id:sgtin:demo", "p-1", 0) ??
        expect.unreachable("no event built");
      expect(ev.bizStep).toBe(mapEventTypeToBizStep("").bizStep);
    }
  });

  it("buildTransformationEvent mints an id when epcisEventId is null, empty or absent", () => {
    const t = '"timestamp":"2026-07-19T10:00:00Z"';
    for (const raw of [`{"epcisEventId":null,${t}}`, `{"epcisEventId":"",${t}}`, `{${t}}`]) {
      const entry = JSON.parse(raw) as unknown as SupplyChainEventInput;
      const ev =
        buildTransformationEvent(entry, "urn:epc:id:sgtin:demo", "p-1", 3) ??
        expect.unreachable("no event built");
      expect(ev.eventID).toBe("urn:tracepass:epcis:p-1:sce-3");
    }
  });

  it("buildTransformationEvent reuses a supplied epcisEventId", () => {
    const ev =
      buildTransformationEvent(
        { timestamp: "2026-07-19T10:00:00Z", epcisEventId: "urn:x:1" },
        "urn:epc:id:sgtin:demo",
        "p-1",
        3,
      ) ?? expect.unreachable("no event built");
    expect(ev.eventID).toBe("urn:x:1");
  });
});
