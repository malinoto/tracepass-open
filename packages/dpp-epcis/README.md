<div align="center">
<a href="https://www.tracepass.eu"><img src="https://www.tracepass.eu/tracepass-logo.svg" alt="TracePass" height="48"></a>

# @tracepass/dpp-epcis

**Map Digital Product Passport events to GS1 EPCIS 2.0, with a CBV vocabulary extended for steel. Zero dependencies.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-success)](#)

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
import { buildCommissioningEvent, validateEpcisDocument, EPCIS_JSONLD_CONTEXT } from "@tracepass/dpp-epcis";

const event = buildCommissioningEvent(
  new Date("2026-01-01T00:00:00Z"),       // publishedAt
  "urn:epc:id:sgtin:0952012.345678.SN1",  // product EPC
  "passport-1",
  "5012345678900",                         // manufacturer GLN
);

const doc = {
  "@context": EPCIS_JSONLD_CONTEXT,
  type: "EPCISDocument",
  schemaVersion: "2.0",
  creationDate: new Date().toISOString(),
  epcisBody: { eventList: [event] },
};

validateEpcisDocument(doc).valid;  // true
```

The event carries a CBV business step (`https://ref.gs1.org/cbv/BizStep-commissioning`)
and a GS1 location reference (`https://id.gs1.org/414/5012345678900`).

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

## License

[Apache-2.0](../../LICENSE)
