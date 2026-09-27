<div align="center">
<a href="https://www.tracepass.eu"><img src="https://www.tracepass.eu/tracepass-logo.svg" alt="TracePass" height="72"></a>

# @tracepass/dpp-identifiers

**Validate and parse EU Digital Product Passport identifiers per EN 18219 — GS1, ISO/IEC 15459, IEC 61406, DID, DOI. Pure functions, no network, no third-party runtime dependencies.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE)
[![Dependencies](https://img.shields.io/badge/third--party%20runtime%20deps-0-success)](#)

Part of [**tracepass-open**](https://github.com/malinoto/tracepass-open) · Maintained by [TracePass](https://www.tracepass.eu)
</div>

---

```bash
npm install @tracepass/dpp-identifiers
```

Validate any identifier scheme EN 18219 permits for a Digital Product Passport, and
build/parse the resolver paths they map to.

## Validate a product identifier

```ts
import { validateProductIdentifier } from "@tracepass/dpp-identifiers";
import type { ProductIdentifier } from "@tracepass/dpp-types";

// GS1 Digital Link — normalises GTIN-8/12/13 to 14 digits
const gs1: ProductIdentifier = {
  scheme: "gs1",
  gtin: "5449000000996",   // GTIN-13 — normalised to "05449000000996"
  serialNumber: "SN-001",
};
const r = validateProductIdentifier(gs1);
// r.ok === true; r.value.gtin === "05449000000996"

// ISO/IEC 15459 — required for battery passports (Art. 77(3))
const iso15459: ProductIdentifier = {
  scheme: "iso15459",
  issuingAgencyCode: "MH",   // starts with a letter (GS1 holds the digit range)
  primaryId: "BATT-2026-001",
  raw: "MHBATT-2026-001",
};
validateProductIdentifier(iso15459).ok;  // true

// Battery passports: only gs1 and iso15459 are allowed
validateProductIdentifier(
  { scheme: "did", did: "did:web:example.com", method: "web" },
  { category: "battery" },
).ok;  // false — Battery Regulation Art. 77(3) requires ISO/IEC 15459
```

### Supported schemes (EN 18219)

| `scheme`    | EN 18219 | Notes |
|---|---|---|
| `gs1`       | scheme 1 | GTIN-8/12/13/14 accepted; always normalised to 14 digits |
| `iso15459`  | scheme 1 | Non-GS1 issuing agency. Agency code first char must be a letter |
| `iec61406`  | scheme 2 | https URL, ASCII-only, RFC 3986-valid |
| `did`       | scheme 3 | W3C DID Core syntax only; no method allow-list |
| `doi`       | scheme 5 | `10.<registrant>/<suffix>`; accepts `doi:` / `https://doi.org/` prefixes |

**Battery passports** accept only `gs1` and `iso15459`: Battery Regulation Art. 77(3)
requires ISO/IEC 15459 until a delegated act replaces it with EN 18219.

**LEI is not a product identifier.** EN 18219 clause 5.1 names schemes 1–5 for
products; LEI does not appear. Pass LEI as an *operator* identifier instead:
`{ scheme: "iso6523", icd: "0199", value: "<20-char LEI>" }`.

## Validate operator and facility identifiers

```ts
import { validateOperatorIdentifier, validateFacilityIdentifier } from "@tracepass/dpp-identifiers";

// ISO 7064 MOD 97-10 check for LEI
validateOperatorIdentifier({ scheme: "iso6523", icd: "0199", value: "5493001KJTIIGC8Y1R12" }).ok;  // true

// GLN (icd 0088) validated with GS1 mod-10
validateOperatorIdentifier({ scheme: "iso6523", icd: "0088", value: "5412345000013" }).ok;  // true

// Facility — GLN only (EN 18219 scheme 7)
validateFacilityIdentifier({ scheme: "gln", gln: "5412345000013" }).ok;  // true
validateFacilityIdentifier({ scheme: "gln", gln: "5412345000013", extension: "DOCK-1" }).ok;  // true
```

## Build and parse resolver paths

```ts
import { identifierToUri, identifierOwnUrl, parseResolverPath, identifierKey } from "@tracepass/dpp-identifiers";

const gs1 = { scheme: "gs1", gtin: "05449000000996", serialNumber: "SN-001" } as const;

// Build a resolver URL
identifierToUri(gs1, "id.example.com");
// "https://id.example.com/01/05449000000996/21/SN-001"

// Parse back
parseResolverPath("/01/05449000000996/21/SN-001");
// { scheme: "gs1", gtin: "05449000000996", serialNumber: "SN-001" }

// A DOI carries its own URL; no resolver needed
identifierOwnUrl({ scheme: "doi", doi: "10.1234/my-passport" });
// "https://doi.org/10.1234/my-passport"

// Canonical key for deduplication
identifierKey(gs1);  // "gs1:05449000000996:SN-001"
```

`identifierToUri` returns `null` for `iec61406`, `did` and `doi` — those carry their own
canonical URL (use `identifierOwnUrl` instead).

## Character constraint (EN 18219 clause 4.3.2)

All identifier fields must use ISO/IEC 646 characters — printable ASCII (0x20–0x7E).
Non-ASCII input is rejected with an error naming the offending field.

## Zero dependencies

This package is pure TypeScript over plain objects. It imports only two sibling packages
(`@tracepass/dpp-types` for types and `@tracepass/gs1-utils` for GTIN/GLN arithmetic),
neither of which adds a third-party runtime dependency.

## Not yet modelled

- **EN 18219 scheme 4** ("identification for products and product groups") — clause
  5.4.2 onward is not yet publicly readable.
- **DID method allow-list** — EN 18219 5.4.1 names did:web, did:ethr and did:ebsi as
  examples, not a closed list. Any DID Core syntax is accepted.
- **ISO/IEC 18975 path form** for iso15459 resolver paths — 18975 is paywalled. The
  path emitted by `identifierToUri` is a TracePass resolver route, not a conformance
  claim against 18975.

## License

[Apache-2.0](../../LICENSE).
