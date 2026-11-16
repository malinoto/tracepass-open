# tools

Standalone verification scripts. These are **not** part of any published package —
they live here so anyone can clone the repo and check our claims themselves.

## `gs1-conformance-check.ts`

Checks a *live* GS1 Digital Link resolver against the **GS1 Digital Link v2.0** spec
and the **GS1-Conformant Resolver standard 1.2.1**. Its `suite.*` checks send the same
requests GS1's own resolver test suite (<https://ref.gs1.org/test-suites/resolver/>)
sends — HEAD, OPTIONS with an `Origin`, redirects not followed — so it fails where that
suite fails. It imports nothing from TracePass, so it runs against any resolver, ours
or a competitor's. Its only dependency outside Node is `undici`, for HTTP/2: Node's
built-in `fetch` speaks HTTP/1.1, and EN 18216 makes HTTP/2 the minimum, so a resolver
following it may refuse an HTTP/1.1 browser request. Run `npm install` at the repo root
first.

```bash
npx tsx tools/gs1-conformance-check.ts \
  --base https://id.tracepass.eu \
  --gtin 99999999999997 \
  --serial 6B27A0000001 \
  --battery-subgroup evb
```

Checks: the `/.well-known/gs1resolver` description file (against GS1's schema, with
CORS); HTML on a default `Accept`; JSON-LD under `Accept: application/ld+json`;
`linkset+json` output with exactly one `gs1:defaultLink` and the JSON-LD context
`Link` header; `?linkType=` redirects (query passed on) and 404 for a missing type; 400
for a malformed URI; one trailing slash tolerated; OPTIONS and CORS; HTTP/1.1 handling;
the `Vary: Accept` header; and a 404 on an unknown serial. `--battery-subgroup evb`
tells it the passport is an in-scope battery, whose plain JSON is the Commission
publication document rather than JSON-LD.

Two checks carry a `knownGap` reason: they mirror GS1 suite criteria that TracePass's
resolver deliberately does not meet — a plain scan is served at the scanned URI instead
of redirecting to the default link, and a batch-only URI (no serial) answers 404,
because TracePass passports exist per serial. A failing known gap is printed with `~`
and does not fail the run, so when you test another resolver, read those two lines
yourself.

This file is the same script TracePass runs on every resolver deploy (a hand-copy
gated by `npm run check:mirrors`), so the published run below is reproducible with it.

Writes `out/gs1-conformance-result.json` alongside the console summary. Our current
run against `id.tracepass.eu` is published at
<https://www.tracepass.eu/gs1-conformance-result.json>.

**Pick a serial that exists.** The unknown-serial check resolves a serial it expects
to 404. If you point `--serial` at one that has a redirect (a renamed demo passport,
say), the check follows it to a live passport, sees 200, and reports a failure that
is really a stale fixture.

GS1's own URI-grammar validator lives at <https://id.gs1.org/dl-validator/> and
covers a different surface — grammar rather than resolver behaviour.
