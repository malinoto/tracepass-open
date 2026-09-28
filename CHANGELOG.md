# Changelog

All packages in this monorepo share one version (`npm workspaces`). Breaking changes are
marked **BREAKING** and require a major or minor bump as appropriate.

---

## 0.9.0 — 2026-09-28

### New package: `@tracepass/dpp-identifiers`

Pure validators and parsers for the five product identifier schemes EN 18219 defines for
Digital Product Passports, plus operator and facility identifiers. No third-party runtime
dependencies.

**Exports:**
- `validateProductIdentifier(id, opts?)` — validates a `ProductIdentifier` discriminated
  union; `opts.category = "battery"` enforces the Art. 77(3) ISO/IEC 15459 restriction
- `validateOperatorIdentifier(id)` — ISO 6523 (GLN/LEI/DUNS/generic), GLN, DID, DOI
- `validateFacilityIdentifier(id)` — GLN ± extension (EN 18219 scheme 7)
- `identifierToUri(id, resolverBase)` — resolver URL for gs1 and iso15459 schemes
- `identifierOwnUrl(id)` — canonical URL for iec61406 (`uri`) and doi schemes
- `parseResolverPath(path)` — parse a resolver path back to a `ProductIdentifier`
- `identifierKey(id)` — canonical deduplication key
- `normalizeDoi(input)` — strip `doi:`/`https://doi.org/` prefix; returns `null` on
  invalid syntax

All identifier string fields must be ISO/IEC 646 (printable ASCII). Non-ASCII input is
rejected with an error naming the offending field.

### `@tracepass/dpp-types` — additive (new types, one deprecation)

- Added `ProductIdentifier` discriminated union with five variants: `Gs1Identifier`,
  `Iso15459Identifier`, `Iec61406Identifier`, `DidIdentifier`, `DoiIdentifier`
- Added `Iso6523Identifier`, `OperatorIdentifier`, `FacilityIdentifier` types
- `Passport.identifier?: ProductIdentifier` — new primary product-identifier field
- `Party.identifiers?: OperatorIdentifier[]` — operator/facility identifiers for a party
- `Passport.gs1` marked **`@deprecated`** — migrate to `identifier: { scheme: "gs1", ... }`

### `@tracepass/gs1-utils` — additive

- `normalizeGtin(input)` — accepts GTIN-8/12/13/14; left-pads then validates the check
  digit; returns 14-digit string or `null`
- `toGtin14` — alias for `normalizeGtin`
- `buildDigitalLinkUri` now accepts GTIN-8/12/13 and always emits 14 digits in the URI
- `parseDigitalLinkUri` now parses GTIN-8/12/13 from the path and normalises to 14 digits
- `buildDigitalLinkSegments` follows the same normalisation

### `@tracepass/dpp-epcis` — **BREAKING** (GLN API change)

The fourth argument of `buildCommissioningEvent` changed from `manufacturerGln: string |
null` to `glns: { facilityGln?, operatorGln? } | null`. The `gln` field on
`SupplyChainEventInput` and `SupplierReportedEvent` is replaced by `facilityGln` and
`operatorGln`.

**Migration:**
```ts
// Before
buildCommissioningEvent(date, epc, passportId, "5012345678900");

// After
buildCommissioningEvent(date, epc, passportId, { facilityGln: "5012345678900" });
```

**Which GLN goes where:** `facilityGln` is for a **physical site** (a factory, warehouse,
or other location — GS1 AI 414 SGLN). If the GLN you previously passed identified the
**manufacturer as a legal entity** (not a specific site), it belongs in `operatorGln`
(GS1 AI 417 PGLN), not `facilityGln`. If you only have an operator GLN and no site GLN,
pass `{ operatorGln: "5012345000000" }` and omit `facilityGln`.

**New exports:**
- `partyUri(gln)` — builds a GS1 AI 417 PGLN URI (`https://id.gs1.org/417/<gln>`) for
  the economic operator; returns `null` for invalid or absent GLN
- `CBV_SOURCE_DEST_TYPE_URI` — object with `owning_party`, `possessing_party`, `location`
  CBV source/destination type URIs

**Semantic change:** when `operatorGln` is provided, the commissioning event emits a
`destinationList` entry (AI 417, typed `owning_party`); transformation and supply-chain
events emit a `sourceList` entry (typed `possessing_party`). This aligns with GS1 EPCIS
2.0 CBV: AI 414 is the physical location (readPoint/bizLocation), AI 417 is the economic
operator (source/destination party).

### `@tracepass/dpp-validate` — applicability follows the Battery Regulation text

Minor: rules start and stop firing on some batteries, so consumers see different findings.

- **State of health and Annex VII data follow Art. 14.** For industrial (>2 kWh)
  batteries, state of health applies only to a stationary battery energy storage
  system with a BMS, and the Annex VII Part A cluster (remaining capacity, self-discharge
  …) and Part B expected-lifetime data (throughputs, date of putting into service) apply
  only to stationary storage. EV batteries no longer get the Part A/B parameters.
  The gates read `batteryProfile.isStationaryBess`; an unconfirmed flag yields
  `unknown`, never a hidden field.
- **The recycled-content exemption is industrial-only (Art. 8(1)).** A battery flagged
  external-storage-only is exempt only when it is an industrial battery >2 kWh; EV and
  LMT batteries always owe the recycled-content data.
- **BAT-APP ignores platform-written values** (`source: "system"`: template defaults,
  derived values), and adds the stationary-storage hint only to the gates that depend on
  it. BAT-APP and BAT-VAL messages name the field by its label with the key in
  parentheses.
- **BAT-1** fix text updated to cite ISO/IEC 15459 and Battery Regulation Art. 77(3)
  explicitly, naming GS1 Digital Link as an example only. The previous text named "EN 18219
  schemes" which was premature — Art. 77(3) requires ISO/IEC 15459 until a delegated act
  replaces it.

---

*See git tags for released versions.*
