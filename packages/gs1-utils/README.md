<div align="center">
<a href="https://www.tracepass.eu"><img src="https://www.tracepass.eu/tracepass-logo.svg" alt="TracePass" height="72"></a>

# @tracepass/gs1-utils

**GTIN and GLN check digits, GS1 Digital Link build and parse. Zero dependencies in the core; the optional `./qr` subpath asks for `qrcode` as a peer.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE)
[![Dependencies](https://img.shields.io/badge/core%20runtime%20deps-0-success)](#)

Part of [**tracepass-open**](https://github.com/malinoto/tracepass-open) · Maintained by [TracePass](https://www.tracepass.eu)
</div>

---

```bash
npm install @tracepass/gs1-utils
```

```ts
import {
  validateGtin, normalizeGtin, toGtin14,
  validateGln, normalizeGln,
  buildDigitalLinkUri, parseDigitalLinkUri,
} from "@tracepass/gs1-utils";

validateGtin("09520123456788");   // true — mod-10 check digit, must be 14 digits
validateGtin("09520123456780");   // false

validateGln("5012345678900");     // true — 13 digits, mod-10

// Normalise any GTIN length to 14 digits (left-pad then check check digit)
normalizeGtin("5449000000996");   // "05449000000996" — GTIN-13 → GTIN-14
normalizeGtin("012345678905");    // "00012345678905" — GTIN-12 → GTIN-14
normalizeGtin("96385074");        // "00000096385074" — GTIN-8 → GTIN-14
normalizeGtin("05449000000997");  // null — bad check digit

toGtin14("5449000000996");        // alias for normalizeGtin

buildDigitalLinkUri("id.example.com", "5449000000996", "SN-1");
// "https://id.example.com/01/05449000000996/21/SN-1"  — GTIN-13 auto-normalised to 14

parseDigitalLinkUri("https://id.example.com/01/5449000000996/21/SN-1");
// { gtin: "05449000000996", serialNumber: "SN-1" }  — GTIN-13 in path normalised
```

`buildDigitalLinkUri` takes a **bare domain** — `id.example.com`, not
`https://id.example.com`. GTINs of any valid length (8/12/13/14) are accepted and
always emitted as 14 digits. `parseDigitalLinkUri` normalises shorter GTINs found
in paths to 14 digits on the way out.

## QR codes are a separate subpath

Rendering a QR code needs a dependency, and identifier validation doesn't. So the core
stays dependency-free and QR lives behind its own entry point, with `qrcode` declared an
optional peer:

```bash
npm install @tracepass/gs1-utils qrcode
```

```ts
import { generateQrCode } from "@tracepass/gs1-utils/qr";
```

## License

[Apache-2.0](../../LICENSE)
