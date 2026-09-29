# Changelog

All packages in this monorepo share one version (`npm workspaces`). Breaking changes are
marked **BREAKING** and require a major or minor bump as appropriate.

---

## 0.14.0 — 2026-09-29

Phase 2 conditional duties: detergents and toys gate registry, date-guard.

### `@tracepass/dpp-validate`

- `battery-applicability` (vendor mirror): extended `FieldGate` with optional `mandatoryFrom` date
  string. When `categoryFieldApplicability` is called before a gate's `mandatoryFrom` date, it
  returns `"unknown"` for all fields in that gate — no hard block before the law applies.
- Added `DETERGENTS_FIELD_GATES` (two gates): `microorganisms` via `microorganismsAdded` flag
  (Reg (EU) 2026/405 Annex VI Part A(i), mandatory from 2029-09-23), and `ingredients` via
  `sdsProvided` flag (Annex VI Part A(h)).
- Added `TOYS_FIELD_GATES` (three gates): `allergenicFragrances` via `containsAllergenicFragrances`
  flag (Reg (EU) 2025/2509 Annex VI Part I(l)), `replacesDeclarationOfConformity` via
  `alsoUnderOtherActs` flag (Annex VI Part I(h)), and `notifiedBodyCertificateReference`
  field-derived from `notifiedBody` — all mandatory from 2030-08-01.
- Extended `CATEGORY_FIELD_GATES` with `detergents` and `toys` entries.
- `publish-gate` (vendor mirror): path 2 in `evaluateFieldRequirements` — a gate that returns
  `"applies"` on a field with no `requiredBy` and `required: false` is now a hard publish block,
  enabling gate-only enforcement for toys fields that carry no subcategory map.
- Exported `DETERGENTS_PASSPORT_MANDATORY_FROM` and `TOYS_PASSPORT_MANDATORY_FROM` date constants.
- `Triggers` interface: phase 2 fields (`microorganismsAdded`, `sdsProvided`,
  `containsAllergenicFragrances`, `alsoUnderOtherActs`, `fieldPresent`) are optional for
  backward compatibility with tests that call `gate.decide()` directly.

## 0.13.1 — 2026-09-29

- `@tracepass/dpp-types`: `RegulationRef` declares the keys every template carries:
  `instrument`, `provision`, `kind`, `source`, `standards` and `obligations`
  (`RegulationObligation`). The type under-described the published templates.
- 0.13.0 was tagged but never published; the CI typecheck failed on the missing
  `instrument` key. 0.13.1 is the first release carrying the 0.13.0 changes below.

## 0.13.0 — 2026-09-29 (not published)

Conditional duties become enforceable (platform ADR: condition flags).

### `@tracepass/dpp-types`

- `ConditionFlag` and `Passport.conditionProfile`: reviewer-approved yes/no flags per
  category, each with an audit trail. They generalise `batteryProfile`, which stays
  readable.

### `@tracepass/dpp-validate`

- Evaluates condition-gated duties like the platform. The vendored applicability engine
  (`battery-applicability`, `condition-profile`, both hash-gated mirrors) feeds the
  publish gate. An **approved** flag whose gate applies makes a `conditional` field
  required: an empty value, or one not yet approved, is a critical
  `gate:conditional` finding and a hard `conditional_missing` block. An absent or
  pending flag never blocks. A caller that passes no `conditionProfile` gets no
  conditional enforcement: it under-reports and never over-reports.

Other packages: version bump only (shared version).

---

## 0.12.0 — 2026-09-29

### `@tracepass/dpp-types`

- `RegulationRef.verifiedAgainstPrimaryText?: { on, celex?, by }` — set when a person
  has checked the cited provision in the official EUR-Lex text (tracepass-dpp-schemas
  1.12.0). Optional; no field carries it yet.

Other packages: version bump only (shared version).

---

## 0.11.0 — 2026-09-28

### `@tracepass/dpp-types`

- **BREAKING:** `Party.identifiers?: OperatorIdentifier[]` (the plural array field) is
  replaced by two singular fields: `Party.operatorIdentifier?: OperatorIdentifier` and
  `Party.facilityIdentifier?: FacilityIdentifier`. Any code that read `party.identifiers`
  must migrate to the singular fields. The platform never populated the array field;
  the change aligns the public types with the platform's actual storage shape.
- A `gln`-scheme `operatorIdentifier` also fills `gln`, and the two must match. A
  facility identifier never fills `gln`. EN 18219 clauses 6.2–6.5.

Other packages: version bump only (shared version).

---

## 0.10.0 — 2026-09-28

Conformance with the full text of EN 18219:2026.

### `@tracepass/dpp-identifiers`

- **Changed:** `identifierToUri` emits the ISO/IEC 18975 query form for `iso15459`,
  `https://<resolver>/?.25P=<IAC+primaryId>[&.S=<serial>]` (EN 18219 Table B.12). It
  replaces the `/<AGENCY>/<primaryId>/<serial>` path, which was not scheme-1 conformant.
  `parseResolverPath` still reads the old path.
- **New:** `parseDiQuery(queryString)` and `diQueryCandidateKeys(dot25P, serial?)` to
  resolve the query form. The agency code has no separator, so the lookup tries each
  1–3 character split and treats more than one match as ambiguous.
- **BREAKING:** a `doi` product identifier requires `granularity` (`model` | `batch` |
  `item`), per clause 5.6.2(b).
- `validateFacilityIdentifier` accepts `iso6523`, `gln`, `did` and `doi` (clauses 6.2–6.5
  cover facilities as well as operators).

### `@tracepass/dpp-types`

- `DoiIdentifier.granularity` added. It is optional in the type, so stored identifiers
  without it still type-check; validation requires it.
- `FacilityIdentifier` widened to the four operator schemes.

Other packages: version bump only (shared version).

## 0.9.1 — 2026-09-28

### `@tracepass/dpp-identifiers` — fix

- `identifierToUri` emits the GTIN-14 form for a GS1 identifier given as GTIN-8, -12 or
  -13 (zero-padded; the check digit is unchanged). A 13-digit EAN previously produced a
  non-canonical Digital Link path. Other packages: version bump only (shared version).

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
