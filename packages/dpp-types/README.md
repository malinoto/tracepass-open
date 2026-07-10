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
- [`tracepass-dpp-schemas`](https://github.com/malinoto/tracepass-dpp-schemas) — the field specs themselves

## License

[Apache-2.0](../../LICENSE)
