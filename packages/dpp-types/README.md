<div align="center">
<a href="https://www.tracepass.eu"><img src="https://www.tracepass.eu/tracepass-logo.svg" alt="TracePass" height="72"></a>

# @tracepass/dpp-types

**TypeScript types for EU Digital Product Passports. Types only — compiles to nothing.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-success)](#)

Part of [**tracepass-open**](https://github.com/malinoto/tracepass-open) · Maintained by [TracePass](https://www.tracepass.eu)
</div>

---

Shared types for a Digital Product Passport under the EU's Ecodesign for Sustainable
Products Regulation, **(EU) 2024/1781**: the category `Template` (its field spec), the
filled-in `Passport`, the economic-operator `Party`, and traceability events.

```bash
npm install --save-dev @tracepass/dpp-types
```

```ts
import type { Template, Passport, TemplateField } from "@tracepass/dpp-types";
```

## Identifiers are opaque

`Id` is a `string`. Nothing in these packages parses it, so a passport that came from
MongoDB, Postgres, or a JSON file works unchanged. Storage engines disagree about what an
id is; the passport logic doesn't need to care.

## Product and operator identifiers (EN 18219)

`Passport.identifier` carries a `ProductIdentifier` — a discriminated union over the five
schemes EN 18219 defines for Digital Product Passports:

```ts
import type { ProductIdentifier, OperatorIdentifier, FacilityIdentifier } from "@tracepass/dpp-types";

// GS1 Digital Link (scheme 1)
const gs1: ProductIdentifier = { scheme: "gs1", gtin: "05449000000996", serialNumber: "SN-001" };

// ISO/IEC 15459 — any issuing agency (scheme 1)
const iso: ProductIdentifier = { scheme: "iso15459", issuingAgencyCode: "MH", primaryId: "BAT-001", raw: "MHBAT-001" };

// IEC 61406 digital nameplate URL (scheme 2)
const iec: ProductIdentifier = { scheme: "iec61406", uri: "https://id.example.com/asset/42" };

// W3C Decentralised Identifier (scheme 3)
const did: ProductIdentifier = { scheme: "did", method: "web", did: "did:web:example.com" };

// DOI (scheme 5)
const doi: ProductIdentifier = { scheme: "doi", doi: "10.1234/my-passport" };
```

`Party.identifiers` carries `OperatorIdentifier[]` — ISO 6523 (GLN, LEI, DUNS), standalone
GLN, DID, or DOI. `FacilityIdentifier` is GLN-only (EN 18219 scheme 7).

The legacy `Passport.gs1` field is still present but **`@deprecated`** — use
`identifier: { scheme: "gs1", ... }` instead.

Validation is in [`@tracepass/dpp-identifiers`](../dpp-identifiers).

## Types model the file, not the database

`Template` describes the shape of a published template JSON file. It deliberately has no
`_id`, no `createdAt`, and its `regulation.effectiveDate` is an **ISO date string**, not a
`Date` — because that is what's actually in the file. `JSON.parse(readFileSync(...))`
type-checks without a cast.

Optional values are `T | null`, not omitted. A field with no unit carries `unit: null`; a
bound that doesn't apply carries `max: null`. Treat `null` as *no constraint* — and take
care not to coerce it to `0`.

## Related

- [`@tracepass/dpp-validate`](../dpp-validate) — compliance verdicts over these types
- [`@tracepass/dpp-identifiers`](../dpp-identifiers) — validate/parse identifiers per EN 18219
- [`tracepass-dpp-schemas`](https://github.com/malinoto/tracepass-dpp-schemas) — the field specs themselves

## License

[Apache-2.0](../../LICENSE)
