# tools

Standalone verification scripts. These are **not** part of any published package —
they live here so anyone can clone the repo and check our claims themselves.

## `gs1-conformance-check.ts`

Exercises the functional requirements of the **GS1 Digital Link v2.0** spec against
a *live* resolver over plain HTTP. It imports nothing from TracePass — only
`node:fs` and `node:path` — so it runs against any resolver, ours or a competitor's.

```bash
npx tsx tools/gs1-conformance-check.ts \
  --base https://id.tracepass.eu \
  --gtin 99999999999997 \
  --serial 6B27A0000001
```

Checks: the `/.well-known/gs1resolver` service description and its shape; HTML on a
default `Accept`; JSON-LD under `Accept: application/ld+json`; `linkset+json` output;
the JSON-LD body shape (schema.org `Product` + identifier); the parties block; the
`Vary: Accept` header; and a 404 on an unknown serial.

Writes `out/gs1-conformance-result.json` alongside the console summary. Our current
run against `id.tracepass.eu` is published at
<https://www.tracepass.eu/gs1-conformance-result.json>.

**Pick a serial that exists.** The unknown-serial check resolves a serial it expects
to 404. If you point `--serial` at one that has a redirect (a renamed demo passport,
say), the check follows it to a live passport, sees 200, and reports a failure that
is really a stale fixture.

GS1's own URI-grammar validator lives at <https://id.gs1.org/dl-validator/> and
covers a different surface — grammar rather than resolver behaviour.
