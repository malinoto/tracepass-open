<div align="center">
<a href="https://www.tracepass.eu"><img src="https://www.tracepass.eu/tracepass-logo.svg" alt="TracePass" height="72"></a>

# @tracepass/dpp-epcis

**Map Digital Product Passport events to GS1 EPCIS 2.0, with a CBV vocabulary extended for steel. No third-party runtime dependencies.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE)
[![Dependencies](https://img.shields.io/badge/third--party%20runtime%20deps-0-success)](#)

Part of [**tracepass-open**](https://github.com/malinoto/tracepass-open) · Maintained by [TracePass](https://www.tracepass.eu)
</div>

---

Build conformant **GS1 EPCIS 2.0** events from passport data — commissioning, service,
ownership transfer, and supply-chain transformation — as pure functions over plain
objects.

```bash
npm install @tracepass/dpp-epcis
```

```ts
import {
  buildCommissioningEvent,
  validateEpcisDocument,
  EPCIS_JSONLD_CONTEXT,
  partyUri,
  CBV_SOURCE_DEST_TYPE_URI,
} from "@tracepass/dpp-epcis";

const event = buildCommissioningEvent(
  new Date("2026-01-01T00:00:00Z"),        // publishedAt
  "urn:epc:id:sgtin:0952012.345678.SN1",   // product EPC
  "passport-1",
  {
    facilityGln:  "5012345678900",          // GS1 AI 414 — physical location
    operatorGln:  "5012345000000",          // GS1 AI 417 — owning economic operator
  },
);

const doc = {
  "@context": EPCIS_JSONLD_CONTEXT,
  type: "EPCISDocument",
  schemaVersion: "2.0",
  creationDate: new Date().toISOString(),
  epcisBody: { eventList: [event] },
};

validateEpcisDocument(doc).valid;  // true

// Build a party URI (PGLN / AI 417) independently
partyUri("5012345000000");
// "https://id.gs1.org/417/5012345000000"

// CBV source/destination type URIs
CBV_SOURCE_DEST_TYPE_URI.owning_party;
// "https://ref.gs1.org/cbv/SDT-owning_party"
```

The commissioning event carries:
- `bizLocation`: GS1 AI 414 SGLN URI for the **facility** (`facilityGln`)
- `destinationList`: GS1 AI 417 PGLN URI for the **economic operator** (`operatorGln`),
  typed as `CBV_SOURCE_DEST_TYPE_URI.owning_party`

Transformation and supply-chain events follow the same pattern, using `sourceList` with
`possessing_party` for the originating operator.

### Migration from the single-`gln` API

The fourth argument to `buildCommissioningEvent` changed from a bare `string | null`
to an object `{ facilityGln?, operatorGln? }`:

```ts
// Before (v0.7 and earlier)
buildCommissioningEvent(date, epc, passportId, "5012345678900");

// After (v0.8+) — physical site GLN (AI 414)
buildCommissioningEvent(date, epc, passportId, { facilityGln: "5012345678900" });

// After (v0.8+) — legal-entity operator GLN only, no physical site (AI 417)
buildCommissioningEvent(date, epc, passportId, { operatorGln: "5012345000000" });
```

**Which GLN goes where:**
- `facilityGln` is for a **physical site** (factory, warehouse, specific location) — emitted
  as GS1 AI 414 SGLN in `bizLocation`.
- `operatorGln` is for a **legal entity / economic operator** (the manufacturer as a company)
  — emitted as GS1 AI 417 PGLN in `destinationList` / `sourceList`.

If your previous single GLN identified the manufacturer as a company rather than a specific
site, map it to `operatorGln`. If you had a site-specific GLN, map it to `facilityGln`.
Both can be provided when you have both.

`SupplyChainEventInput.gln` and `SupplierReportedEvent.gln` fields are renamed to
`facilityGln` / `operatorGln` in the same release.

## Extending CBV for steel

Core Business Vocabulary 2.0 has no business steps for several steel production stages.
Rather than misuse an unrelated step, this package coins them under a vendor namespace —
the extension pattern GS1 sanctions for exactly this case:

```
https://tracepass.eu/voc/cbv/bizstep/smelting
https://tracepass.eu/voc/cbv/bizstep/casting
https://tracepass.eu/voc/cbv/bizstep/rolling
```

Standard steps are used wherever one exists. `validateEpcisDocument` is a structural
check — envelope, event type, event time — not a full JSON Schema validation.

Background: [What is EPCIS 2.0?](https://www.tracepass.eu/glossary/epcis) — the GS1
supply-chain event standard this package emits.

## License

[Apache-2.0](../../LICENSE)
