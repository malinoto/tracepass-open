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
import { validateGtin, validateGln, buildDigitalLinkUri, parseDigitalLinkUri } from "@tracepass/gs1-utils";

validateGtin("09520123456788");   // true — mod-10 check digit
validateGtin("09520123456780");   // false
validateGln("5012345678900");     // true — 13 digits, mod-10

buildDigitalLinkUri("id.example.com", "09520123456788", "SN-1");
// "https://id.example.com/01/09520123456788/21/SN-1"

parseDigitalLinkUri("https://id.example.com/01/09520123456788/21/SN-1");
// { gtin: "09520123456788", serialNumber: "SN-1" }
```

`buildDigitalLinkUri` takes a **bare domain** — `id.example.com`, not
`https://id.example.com`.

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
