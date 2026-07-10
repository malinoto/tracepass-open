<div align="center">

<a href="https://www.tracepass.eu">
  <img src="https://www.tracepass.eu/tracepass-logo.svg" alt="TracePass" height="96">
</a>

# Open building blocks for EU Digital Product Passports

**A compliance validator, an EPCIS 2.0 event mapper, and GS1 identifier utilities — pure functions over plain objects, with no database, no network, and no dependencies.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-28%20passing-success)](./packages/dpp-validate/tests)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-success)](#zero-dependencies-is-a-design-constraint)
[![Types](https://img.shields.io/badge/TypeScript-strict-3178c6)](./tsconfig.base.json)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933)](https://nodejs.org)

Maintained by **[TracePass](https://www.tracepass.eu)** · [Platform](https://app.tracepass.eu) · [API docs](https://www.tracepass.eu/docs)

</div>

---

## What is a Digital Product Passport?

A **Digital Product Passport (DPP)** is a structured, machine-readable record of a
product's composition, origin, environmental performance, and end-of-life handling,
reachable by scanning a data carrier — usually a QR code — on the product itself.

It is mandated by the EU's **Ecodesign for Sustainable Products Regulation (ESPR),
Regulation (EU) 2024/1781**, and by product-specific instruments such as the **EU
Battery Regulation (EU) 2023/1542**, under which battery passports become mandatory on
**18 February 2027**.

Building one means answering three questions. *Which fields does my category require?*
*Is this passport complete enough to publish?* *How do I express what happened to this
product as an interoperable supply-chain event?* These packages answer the second and
third. The first is answered by
[**tracepass-dpp-schemas**](https://github.com/malinoto/tracepass-dpp-schemas), which
publishes the field specifications for 12 categories.

## Packages

| Package | What it does | Runtime deps |
|---|---|---|
| [`@tracepass/dpp-validate`](./packages/dpp-validate) | Evaluate a passport against its category spec → a three-tier verdict with regulation-cited findings | none |
| [`@tracepass/dpp-epcis`](./packages/dpp-epcis) | Map passport events to GS1 **EPCIS 2.0**, with a CBV 2.0 vocabulary extended for steel | none |
| [`@tracepass/gs1-utils`](./packages/gs1-utils) | GTIN and GLN check digits, GS1 Digital Link build/parse | none¹ |
| [`@tracepass/dpp-types`](./packages/dpp-types) | The shared types. Types only — compiles to nothing | none |

¹ QR rendering lives at the `@tracepass/gs1-utils/qr` subpath and declares `qrcode` as an
optional peer dependency, so the core stays dependency-free.

## Is this passport compliant?

```ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { evaluateCompliance } from "@tracepass/dpp-validate";

const require = createRequire(import.meta.url);
const battery = JSON.parse(
  readFileSync(require.resolve("@tracepass/dpp-schemas/templates/battery.json"), "utf8"),
);

const passport = {
  status: "draft",
  fields: {
    ratedCapacity: { value: 3.4, status: "approved" },
    // ... the other 93 fields Annex XIII requires
  },
  parties: {
    manufacturer: { legalName: "Acme Cells GmbH", country: "DE" },
  },
};

const result = evaluateCompliance(passport, battery, "battery");

result.verdict;              // "incomplete"
result.conditionalCoverage;  // "evaluated"
result.checkedRules;         // ["static:required-fields", "static:required-parties",
                             //  "static:format", "BAT-1", "BAT-APP", "BAT-VAL", "CC-1"]

for (const f of result.critical) {
  console.log(`${f.target}: ${f.why}  [${f.article}]`);
}
// batteryUniqueIdentifier: Required field "batteryUniqueIdentifier" has no value.  [Art. 77]
```

The verdict is one of `compliant`, `compliant_with_warnings`, or `incomplete`. Findings
are split into `critical` (which block) and `warnings` (which don't), and each carries the
article that mandates it — so a report can cite its source rather than assert it.

### The engine never asserts compliance on data it could not read

Some obligations are conditional. A battery's carbon-footprint fields apply only if it is
rechargeable; REACH Article 33 disclosure triggers above 0.1% w/w of an SVHC. When the
field that *decides* a condition is absent, the engine will not quietly pass — it emits an
`unverifiable_conditional` warning that says what it could not determine, and how to fix
it:

```jsonc
{
  "type": "unverifiable_conditional",
  "severity": "warning",
  "ruleId": "BAT-1",
  "target": "batteryCategory",
  "regulation": "(EU) 2023/1542",
  "article": "Art. 77(1)",
  "why": "Battery category isn't set, so battery-passport scope (LMT / EV / industrial >2 kWh) couldn't be evaluated.",
  "fix": "Set batteryCategory. Portable and SLI batteries are out of scope; LMT, EV and industrial >2 kWh require a battery passport."
}
```

It also reports its own coverage, so silence is never mistaken for a compliance claim.
Three categories carry binding conditional rules — battery, chemicals, construction —
plus one cross-cutting rule that applies to every category. For the other nine,
`conditionalCoverage` is `"static-only"`: the template's required fields are the whole
obligation, and the engine says so rather than implying it checked more.

## Emit a GS1 EPCIS 2.0 event

```ts
import {
  buildCommissioningEvent,
  validateEpcisDocument,
  EPCIS_JSONLD_CONTEXT,
} from "@tracepass/dpp-epcis";

const event = buildCommissioningEvent(
  new Date("2026-01-01T00:00:00Z"),        // publishedAt
  "urn:epc:id:sgtin:0952012.345678.SN1",   // product EPC
  "passport-1",
  "5012345678900",                          // manufacturer GLN
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

The event carries a proper CBV business step
(`https://ref.gs1.org/cbv/BizStep-commissioning`) and a GS1 location reference
(`https://id.gs1.org/414/5012345678900`).

Standard CBV 2.0 has no business steps for several steel production stages, so this
package coins them under `https://tracepass.eu/voc/cbv/bizstep/` — `smelting`, `casting`,
`rolling`, and others — following the extension pattern GS1 sanctions for exactly this.

## GS1 identifiers

```ts
import { validateGtin, buildDigitalLinkUri } from "@tracepass/gs1-utils";

validateGtin("09520123456788");  // true  (mod-10 check digit)
validateGtin("09520123456780");  // false

buildDigitalLinkUri("id.example.com", "09520123456788", "SN-1");
// "https://id.example.com/01/09520123456788/21/SN-1"
```

`buildDigitalLinkUri` takes a **bare domain**, not a URL — pass `id.example.com`, not
`https://id.example.com`.

## Zero dependencies is a design constraint

Every package here is a pure function over plain objects. Nothing reads a database,
opens a socket, or consults a clock. That is not incidental — it is what lets you run the
compliance engine in a build step, a Lambda, a browser, or a test, and what lets us
promise the whole tree contains no transitive supply-chain surface.

Two decisions enforce it:

**Identifiers are opaque.** `Id` is a `string`. Nothing here parses it, so a passport
sourced from MongoDB, Postgres, or a JSON file all work unchanged.

**`verbatimModuleSyntax` is on.** A value-import that is only used as a type becomes a
compile error rather than a silent runtime dependency. This is not theoretical: it is
the exact mistake that made an earlier version of this code carry a hard dependency on a
database driver it never called.

## Install

```bash
npm install @tracepass/dpp-validate @tracepass/dpp-schemas
```

Node ≥ 18. ESM only.

## Develop

```bash
npm install
npm run build     # tsc, per package
npm test          # vitest
```

## Related

- **[tracepass-dpp-schemas](https://github.com/malinoto/tracepass-dpp-schemas)** — the
  field specifications these packages validate against. 12 categories, 910 fields, each
  traced to the article of EU law that mandates it. Pure JSON, any language.

## Provenance and limits

These packages are extracted from the platform that
[TracePass](https://www.tracepass.eu) runs in production, and are maintained because we
depend on them. The compliance rules are hand-authored from the regulations and carry
their citations inline.

They are **not legal advice, and not an official EU artefact.** Delegated acts are still
landing. A `compliant` verdict means *this passport satisfies the rules encoded here*, not
*this product may be placed on the market.* Verify against
[EUR-Lex](https://eur-lex.europa.eu) and take advice before relying on any output for a
market-placement decision.

## Contributing

The most valuable contributions are corrections: a rule that cites the wrong article, a
conditional that fires when it shouldn't, an EPCIS event that a conformance suite rejects.
Open an issue with the source you're citing. Tests are in
[`packages/dpp-validate/tests`](./packages/dpp-validate/tests) and run with `npm test`.

## License

[Apache-2.0](./LICENSE). Use them, fork them, ship them in a commercial product.
