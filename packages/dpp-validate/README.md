<div align="center">
<a href="https://www.tracepass.eu"><img src="https://www.tracepass.eu/tracepass-logo.svg" alt="TracePass" height="72"></a>

# @tracepass/dpp-validate

**Evaluate an EU Digital Product Passport against its category field spec. Pure functions, zero dependencies, 28 tests.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-success)](#)

Part of [**tracepass-open**](https://github.com/malinoto/tracepass-open) · Maintained by [TracePass](https://www.tracepass.eu)
</div>

---

Given a passport and the template for its product category, `evaluateCompliance` returns a
three-tier verdict with findings that cite the article of EU law each one rests on. It
reads no database, opens no socket, and consults no clock.

```bash
npm install @tracepass/dpp-validate @tracepass/dpp-schemas
```

```ts
import { evaluateCompliance } from "@tracepass/dpp-validate";

const result = evaluateCompliance(passport, batteryTemplate, "battery");

result.verdict;               // "compliant" | "compliant_with_warnings" | "incomplete"
result.critical;              // findings that block
result.warnings;              // findings that don't
result.conditionalCoverage;   // "evaluated" | "static-only"
result.checkedRules;          // ["static:required-fields", ..., "BAT-1", "CC-1"]
```

## Three tiers

**Static** — required fields are present and approved, required economic operators are
identified, values match their datatype, enum, pattern, and bounds.

**Conditional** — obligations that only fire under a condition. Battery carbon-footprint
fields apply only to rechargeable batteries; REACH Article 33 disclosure triggers above
0.1% w/w of an SVHC. Three categories carry these rules — battery, chemicals,
construction — plus one cross-cutting rule for every category.

**Coverage** — the engine reports whether it evaluated conditionals at all. For the other
nine categories `conditionalCoverage` is `"static-only"`, so silence is never mistaken for
a compliance claim.

## It will not pass what it could not check

When the field that decides a conditional is absent, the result is an
`unverifiable_conditional` warning naming what could not be determined — never a quiet
pass:

```jsonc
{
  "type": "unverifiable_conditional",
  "ruleId": "BAT-1",
  "target": "batteryCategory",
  "article": "Art. 77(1)",
  "why": "Battery category isn't set, so battery-passport scope couldn't be evaluated.",
  "fix": "Set batteryCategory. Portable and SLI batteries are out of scope; LMT, EV and industrial >2 kWh require a battery passport."
}
```

The same principle governs the battery applicability gates: an unknown classifier shows
the dependent field and warns. A mis-classified battery must never silently lose a
legally-required field.

## Not legal advice

A `compliant` verdict means *this passport satisfies the rules encoded here* — not *this
product may be placed on the market*. Delegated acts are still landing. Verify against
[EUR-Lex](https://eur-lex.europa.eu).

## License

[Apache-2.0](../../LICENSE)
