# Changelog

All packages in this monorepo share one version (`npm workspaces`). Breaking changes are
marked **BREAKING** and require a major or minor bump as appropriate.

---

## 0.23.0 — 2026-11-14

### `@tracepass/dpp-validate`

- **New battery rule BAT-CONS: values that contradict each other,** as the platform
  runs it. Ten checks, each a `warning` with the new finding type
  **`inconsistent_values`**:
  - energy vs nominal voltage × rated capacity (off by more than 10 %);
  - energy density vs energy ÷ weight (more than 10 %);
  - minimum < nominal < maximum voltage;
  - each temperature range's min < max;
  - the nominal power implied by the Annex IV Part B(2) ratio vs the maximum allowed
    power (more than 5 % above it);
  - in-service capacity, energy and power vs their original values (more than 5 %
    above);
  - capacity fade vs remaining ÷ rated capacity (more than 3 points);
  - the Art. 8(1) recycled cobalt, lithium and nickel share vs its pre- and
    post-consumer parts (more than 1 point);
  - a physical quantity of exactly 0;
  - a GS1 Digital Link or element string in the passport that names another GTIN or
    serial than the passport's own.

  A check runs only when all its values are present. When the energy itself
  contradicts V × Ah, the checks computed from it are skipped, so one error gives one
  finding. The checks are a platform mirror, `vendor/battery-consistency.ts`, hashed
  in `mirror-manifest.json`.

- **`FindingType` gains `"inconsistent_values"`.** A consumer with an exhaustive
  `switch` over finding types needs a new case. New findings and a wider union, hence
  MINOR.

### All packages

- Version 0.23.0; the `dpp-types` range in `dpp-validate`, `dpp-epcis` and
  `dpp-identifiers` is `^0.23.0`, and the `gs1-utils` range in `dpp-epcis` and
  `dpp-identifiers` is `^0.23.0`. It stood at `^0.22.0`, which a 0.23 release would not
  have matched.

---

## 0.22.1 — 2026-11-08

### All packages

- **No API change.** The code meets the shared `@tracepass/code-standard`: index lookups
  admit a missing value (`noUncheckedIndexedAccess`), guards are explicit instead of
  asserted, and number formatting is explicit. Tooling moved to Node 24. The
  `dpp-types` range in `dpp-validate`, `dpp-epcis` and `dpp-identifiers` is `^0.22.1`.

---

## 0.22.0 — 2026-11-05

### `@tracepass/dpp-validate`

- **BAT-VAL checks the detailed composition (Annex XIII 2(a)),** as the platform does.
  For `cathodeActiveMaterials`, `anodeActiveMaterials` and `electrolyteComposition`, a
  list that names only a chemistry label (`["LFP"]`, `NMC811`) is critical for an LMT,
  EV or industrial > 2 kWh battery from 18 Feb 2027, a warning before that day or while
  `batteryCategory` is unset, and nothing for portable, SLI or industrial ≤ 2 kWh.
  Shares are optional; one outside 0–100 %, or a total over 100 %, is a warning. The
  analyser is a platform mirror, `vendor/composition-detail.ts`, hashed in
  `mirror-manifest.json`. New findings, hence MINOR.

---

## 0.21.0 — 2026-11-05

### `@tracepass/dpp-validate`

- **CHEM-1, SVHC in articles, as a warning.** REACH Art. 33(1) and Waste Framework
  Directive Art. 9(1)(i) (SCIP) put no information in a passport, so CHEM-1 only
  checks what a passport already records, and only where a field exists that clears it:
  - electronics: `svhcPresent` true and no `scipNotificationId`;
  - steel: `svhcPresent` true and no `svhcCandidateListSubstances`;
  - furniture: `svhcCandidateListSubstances` listed and no `scipNotificationNumber`.

  Never critical, and never on detergents or paints, which are mixtures. Furniture now
  reports `conditionalCoverage: "evaluated"`. New findings, hence MINOR.

---

## 0.20.0 — 2026-11-05

### `@tracepass/dpp-validate`

- **CON-1 matches the platform, and cites the law that binds today.** A construction
  product that references a harmonised technical specification:
  - with no `ceMarkingStatus` recorded, is now a warning (`unverifiable_conditional`):
    the obligation cannot be evaluated. It was a critical. Behaviour change, hence MINOR.
  - with `ceMarkingStatus: "not_applicable"`, is now critical: coverage is exactly what
    engages the declaration of performance and the CE mark.
  - The finding cites Regulation (EU) No 305/2011 Arts. 4(1) and 8(2). Regulation
    (EU) 2024/3110 keeps those articles for products under the standards already cited
    (Art. 95(3), (8)); its own economic-operator obligations reach a product family only
    one year after an Art. 5(8) or 6(1) implementing act covers it (Art. 95(9)), and
    none is adopted.

---

## 0.19.0 — 2026-11-02

### `@tracepass/dpp-validate`

- **One copy of the battery gates.** The package exported, and its conditional rules
  used, an older hand-written `battery-applicability.ts`, while the verdict engine used
  the platform mirror in `vendor/`. The old copy had 8 gates and no recycled-content
  start date, so `BATTERY_FIELD_GATES`, `batteryFieldApplicability` and the conditional
  rules could disagree with the verdict and with the platform. Every export and rule now
  uses the vendor mirror, whose hashes `mirror-manifest.json` records, and the old file
  is gone.
- Behaviour change, hence MINOR: before 18 Aug 2028, the recycled-content fields now
  answer `"unknown"` from the exported functions as well, never `"applies"` or
  `"not_applicable"`.

### `@tracepass/dpp-types`

- `Template.modelVersion?: string`: the SemVer data-model version that
  `@tracepass/dpp-schemas` 1.31.0 adds to every template. The integer `version` is
  documented as a legacy label.

---

## 0.16.0 — 2026-10-27

The pre- and post-consumer recycled-content split shares are no longer a publish duty
for any battery.

### `@tracepass/dpp-validate`

- `battery-applicability` (the package's own module and the vendor mirror): the six
  `preConsumerRecycled*Share` / `postConsumerRecycled*Share` fields leave the
  recycled-content gate.
  - Battery Regulation Art. 8(1) documents one share per metal, "recovered from battery
    manufacturing waste or post-consumer waste", and Annex XIII 1(e) carries only that
    documentation. The DG GROW data-point guidance (v2.0 and v3.2) has no split data
    point.
  - Before, an EV or LMT battery could not publish without them. They are now a
    voluntary breakdown.
- Vendor mirror: the recycled-content gate carries `mandatoryFrom: "2028-08-18"`, the
  earliest date Art. 8(1) applies (`BATTERY_RECYCLED_CONTENT_EARLIEST`), so before that
  date it answers `"unknown"` and cannot block.

---

## 0.14.2 — 2026-09-30

`stateOfHealth` is no longer a publish duty for any battery.

### `@tracepass/dpp-validate`

- `battery-applicability` (vendor mirror): new `FieldGate.promotes?: false`.
  - With it, `categoryFieldApplicability` leaves an `"applies"` verdict out of the
    map, so `evaluateFieldRequirements` never promotes the field's `conditional`
    entry to a hard block.
  - `"not_applicable"` and `"unknown"` still flow through, so warnings and editor
    collapse keep working.
  - The `stateOfHealth` gate sets it. The DG GROW battery-passport data-point
    guidance (v2.0) has no stand-alone state-of-health data point: Annex XIII 4(b)
    is DP 61 (SOCE, EV) and DP 62–66 (LMT / stationary storage). Before, an EV,
    LMT or stationary battery with a BMS could not publish without it.

---

## 0.14.1 — 2026-09-30

A battery confirmed to have no battery management system (BMS) is no longer
required to carry Art. 14 state-of-health data.

### `@tracepass/dpp-validate`

- `battery-applicability` (vendor mirror): an approved `hasBMS: false` now resolves the following
  gates to `not_applicable`. Before, only `stateOfHealth` honoured the flag.
  - `stateOfCertifiedEnergy` (EV);
  - the Annex VII Part A cluster (`remainingCapacity`, `remainingPowerCapability`,
    `remainingRoundTripEfficiency`, `evolutionOfSelfDischargeRate`,
    `currentInternalResistancePack`, `initialSelfDischargeRate`);
  - the Part B cluster (`capacityThroughput`, `energyThroughput`, `dateOfServiceEntry`).

  Legal basis: Reg (EU) 2023/1542 Art. 14(1) places this data "in the battery management
  system", and recital 333 scopes it to batteries "using a battery management system". The
  Commission battery FAQ (1st ed., Sep 2026) §8.5 says state-of-health requirements apply only
  where the battery has a BMS. An unset or unapproved flag changes nothing.

- `publish-gate` (vendor mirror): in `evaluateFieldRequirements`, a confirmed `not_applicable`
  verdict now outranks the template's static `requiredBy[category] === "required"`. Before, an
  LMT battery without a BMS could not pass the gate.

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

_See git tags for released versions._
