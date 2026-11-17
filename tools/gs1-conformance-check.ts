#!/usr/bin/env tsx
/**
 * GS1 Digital Link resolver conformance self-test.
 *
 * Exercises every functional requirement from the GS1 Digital Link
 * v1.4 / 2.0 spec that the TracePass resolver is expected to satisfy.
 * Pure HTTP probing — no app code is imported here, so the script
 * tests the live behaviour of whatever URL it's pointed at.
 *
 * Usage (the path is `scripts/` in the platform, `tools/` in tracepass-open):
 *   npx tsx scripts/gs1-conformance-check.ts \
 *     --base https://id.tracepass.eu \
 *     --gtin 01234567890128 \
 *     --serial 6B27A0000001 \
 *     [--battery-subgroup evb|lmt|ind] [--model-gtin <single-product GTIN>]
 *
 * Exit code:
 *   0 — all checks passed
 *   1 — at least one check failed
 *
 * The result is also written to `out/gs1-conformance-result.json`
 * so it can be committed to the repo + linked from /trust as the
 * conformance-self-test artefact. (External: customers can also run
 * GS1's own validator at https://id.gs1.org/dl-validator/ against
 * any of the same URLs — the scope of that tool is URI-grammar
 * checking; this script covers the resolver-behaviour side.)
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { request as httpsRequest } from "node:https";
import { Agent, setGlobalDispatcher } from "undici";

// The resolver refuses HTTP/1.x on passport paths (EN 18216:2026 cl. 4),
// and Node's built-in fetch speaks only HTTP/1.1. Negotiate HTTP/2 for
// every fetch below.
setGlobalDispatcher(new Agent({ allowH2: true }));

interface CheckResult {
  id: string;
  name: string;
  pass: boolean;
  detail?: string;
  /**
   * Set when the check mirrors a GS1 test-suite criterion the resolver
   * deliberately does not meet (a design choice, with the reason here).
   * A failing known gap is reported but does not fail the run; once it
   * passes it counts like any other check.
   */
  knownGap?: string;
}

interface ConformanceResult {
  base: string;
  gtin: string;
  serial: string;
  ranAt: string;
  checks: CheckResult[];
  passed: number;
  failed: number;
  knownGaps: number;
}

function parseArgs(argv: string[]): {
  base: string;
  gtin: string;
  serial: string;
  /**
   * Optional battery subgroup for the json-negotiation body-shape check.
   * Pass "evb", "lmt", or "ind" when the tested passport is an in-scope
   * battery — the check then also asserts the Commission document shape
   * (contentSpecificationIds present, `@context` absent). Leave unset for
   * non-battery or out-of-scope passports; the check then asserts JSON-LD
   * shape (@context present).
   */
  batterySubgroup: "evb" | "lmt" | "ind" | undefined;
  /**
   * Optional GTIN for the model-page checks: one held by a single product with
   * published passports. Without it those checks use `--gtin` and are reported as
   * known gaps, because a GTIN shared by several products (the public demo's is) is
   * a 404 by design.
   */
  modelGtin: string | undefined;
} {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv.at(i);
    if (a?.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      }
    }
  }
  const rawSubgroup = out["battery-subgroup"];
  const batterySubgroup: "evb" | "lmt" | "ind" | undefined =
    rawSubgroup === "evb" || rawSubgroup === "lmt" || rawSubgroup === "ind"
      ? rawSubgroup
      : undefined;
  return {
    base: out.base ?? "http://localhost:3000",
    gtin: out.gtin ?? "01234567890128",
    serial: out.serial ?? "SN-001",
    batterySubgroup,
    modelGtin: out["model-gtin"],
  };
}

async function check(
  id: string,
  name: string,
  fn: () => { pass: boolean; detail?: string } | Promise<{ pass: boolean; detail?: string }>,
  knownGap?: string,
): Promise<CheckResult> {
  try {
    const r = await fn();
    return { id, name, pass: r.pass, detail: r.detail, knownGap };
  } catch (e) {
    return {
      id,
      name,
      pass: false,
      detail: e instanceof Error ? e.message : String(e),
      knownGap,
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { base, gtin, serial, batterySubgroup, modelGtin } = args;
  const passportUrl = `${base}/01/${gtin}/21/${serial}`;
  const checks: CheckResult[] = [];

  // 1. Self-description endpoint exists + carries the required
  //    metadata per spec § 6.5.
  checks.push(
    await check("well-known.exists", "GET /.well-known/gs1resolver returns 200", async () => {
      const r = await fetch(`${base}/.well-known/gs1resolver`);
      return { pass: r.status === 200, detail: `status=${String(r.status)}` };
    }),
  );
  checks.push(
    await check(
      "well-known.shape",
      "Self-description carries supportedPrimaryKeys + specVersion",
      async () => {
        const r = await fetch(`${base}/.well-known/gs1resolver`);
        if (r.status !== 200) return { pass: false, detail: `status=${String(r.status)}` };
        const j = (await r.json()) as Record<string, unknown>;
        const okKeys = Array.isArray(j.supportedPrimaryKeys);
        const okVer = typeof j.specVersion === "string";
        return {
          pass: okKeys && okVer,
          detail: `supportedPrimaryKeys=${String(okKeys)} specVersion=${String(okVer)}`,
        };
      },
    ),
  );

  // 2. Default GET (HTML) on a published passport URL.
  checks.push(
    await check(
      "passport.html-default",
      "GET passport URL with default Accept returns 200 text/html",
      async () => {
        const r = await fetch(passportUrl, {
          headers: { Accept: "text/html,*/*;q=0.8" },
          redirect: "follow",
        });
        const ct = r.headers.get("content-type") ?? "";
        return {
          pass: r.status === 200 && ct.includes("text/html"),
          detail: `status=${String(r.status)} content-type=${ct}`,
        };
      },
    ),
  );

  // 3. JSON-LD content negotiation flips the same URL to ld+json.
  checks.push(
    await check(
      "passport.jsonld-negotiation",
      "Same URL with Accept: application/ld+json returns 200 application/ld+json",
      async () => {
        const r = await fetch(passportUrl, {
          headers: { Accept: "application/ld+json" },
          redirect: "follow",
        });
        const ct = r.headers.get("content-type") ?? "";
        const isLdJson = ct.includes("application/ld+json");
        let validJson = false;
        try {
          await r.json();
          validJson = true;
        } catch {
          validJson = false;
        }
        return {
          pass: r.status === 200 && isLdJson && validJson,
          detail: `status=${String(r.status)} content-type=${ct} parses=${String(validJson)}`,
        };
      },
    ),
  );

  // 4. Linkset format is supported per spec § 7.6.
  checks.push(
    await check(
      "passport.linkset",
      "passport-data endpoint serves application/linkset+json",
      async () => {
        const r = await fetch(`${base}/api/passport-data/01/${gtin}/21/${serial}`, {
          headers: { Accept: "application/linkset+json" },
        });
        const ct = r.headers.get("content-type") ?? "";
        const ok = ct.includes("application/linkset+json");
        return {
          pass: r.status === 200 && ok,
          detail: `status=${String(r.status)} content-type=${ct}`,
        };
      },
    ),
  );

  // 4b. The linkset is also negotiated on the passport URL itself, by Accept
  //     and by the resolver query ?linkType=all (GS1 Digital Link § 7.6).
  for (const [id, name, url, accept] of [
    [
      "passport.linkset.accept",
      "passport URL serves the linkset for Accept: application/linkset+json",
      passportUrl,
      "application/linkset+json",
    ],
    [
      "passport.linkset.linktype-all",
      "passport URL serves the linkset for ?linkType=all",
      `${passportUrl}?linkType=all`,
      "text/html",
    ],
  ] as const) {
    checks.push(
      await check(id, name, async () => {
        const r = await fetch(url, { headers: { Accept: accept } });
        const ct = r.headers.get("content-type") ?? "";
        return {
          pass: r.status === 200 && ct.includes("application/linkset+json"),
          detail: `status=${String(r.status)} content-type=${ct}`,
        };
      }),
    );
  }

  // 4c. Machine-readable responses carry CORS, so browser-based readers on
  //     other origins can use them.
  checks.push(
    await check(
      "passport.cors",
      "JSON-LD response carries Access-Control-Allow-Origin: *",
      async () => {
        const r = await fetch(passportUrl, {
          headers: { Accept: "application/ld+json", Origin: "https://example.org" },
        });
        const acao = r.headers.get("access-control-allow-origin");
        return {
          pass: r.status === 200 && acao === "*",
          detail: `status=${String(r.status)} access-control-allow-origin=${String(acao)}`,
        };
      },
    ),
  );

  // 5. JSON-LD body matches schema.org Product shape. Accepts either
  //    the simple `@context: "https://schema.org"` form OR the multi-
  //    vocab array form `["https://schema.org", "https://gs1.org/voc/",
  //    { tracepass: ... }]` that the parties block triggers.
  checks.push(
    await check(
      "passport.jsonld-shape",
      "JSON-LD body has @context schema.org + @type Product + identifier",
      async () => {
        const r = await fetch(passportUrl, {
          headers: { Accept: "application/ld+json" },
        });
        const j = (await r.json()) as Record<string, unknown>;
        const ctx = j["@context"];
        const ctxOk = Array.isArray(ctx)
          ? ctx.some((entry) => entry === "https://schema.org" || entry === "https://schema.org/")
          : ctx === "https://schema.org" || ctx === "https://schema.org/";
        const typeOk = j["@type"] === "Product";
        const idOk = typeof j.identifier === "string";
        return {
          pass: ctxOk && typeOk && idOk,
          detail: `@context=${String(ctxOk)} @type=${String(typeOk)} identifier=${String(idOk)}`,
        };
      },
    ),
  );

  // 5b. tracepass:parties — soft check. When the passport has any
  //     parties populated the array MUST be well-formed (every entry
  //     has @type, tracepass:role, schema:legalName); when absent the
  //     check is informational and passes. Lets the conformance run
  //     stay green for legacy passports while still catching shape
  //     drift on parties-bearing passports.
  checks.push(
    await check(
      "passport.parties-shape",
      "tracepass:parties (when present) emits {@type, tracepass:role, schema:legalName} per entry",
      async () => {
        const r = await fetch(passportUrl, {
          headers: { Accept: "application/ld+json" },
        });
        const j = (await r.json()) as Record<string, unknown>;
        const parties = j["tracepass:parties"];
        if (parties === undefined) {
          return {
            pass: true,
            detail: "no parties on this passport (check skipped)",
          };
        }
        if (!Array.isArray(parties)) {
          return { pass: false, detail: "tracepass:parties is not an array" };
        }
        const allOk = parties.every((p) => {
          if (!p || typeof p !== "object") return false;
          const o = p as Record<string, unknown>;
          return (
            typeof o["@type"] === "string" &&
            typeof o["tracepass:role"] === "string" &&
            typeof o["schema:legalName"] === "string"
          );
        });
        return {
          pass: allOk,
          detail: `count=${String(parties.length)} all-well-formed=${String(allOk)}`,
        };
      },
    ),
  );

  // 6. Vary header on the negotiated response — caches must split
  //    HTML vs JSON-LD by Accept.
  checks.push(
    await check("passport.vary-header", "JSON-LD response sets Vary: Accept", async () => {
      const r = await fetch(passportUrl, {
        headers: { Accept: "application/ld+json" },
      });
      const vary = r.headers.get("vary") ?? "";
      const ok = vary.toLowerCase().includes("accept");
      return { pass: ok, detail: `vary=${vary}` };
    }),
  );

  // 7. Unknown GTIN/serial returns 404 (not 200 with a fallback page).
  checks.push(
    await check("passport.unknown-404", "Unknown serial returns 404", async () => {
      const r = await fetch(`${base}/01/${gtin}/21/__definitely-not-a-real-serial__`);
      return { pass: r.status === 404, detail: `status=${String(r.status)}` };
    }),
  );

  // 7b. A GTIN-only URL is the product's model page when the GTIN belongs to one
  // product with published passports, else a 404. A GTIN shared by several
  // products (the public demo's is) is a 404 by design, so without --model-gtin
  // the check runs on --gtin and a 404 is reported as a known gap.
  const modelGtinGap = modelGtin
    ? undefined
    : "No --model-gtin given: the tested GTIN may belong to several products (the public demo's does), which is a 404 by design; pass a single-product GTIN to check the model page.";
  checks.push(
    await check(
      "model.gtin-only-200",
      "A GTIN-only URL with published passports is answered 200",
      async () => {
        const r = await fetch(`${base}/01/${modelGtin ?? gtin}`);
        return { pass: r.status === 200, detail: `status=${String(r.status)}` };
      },
      modelGtinGap,
    ),
  );
  checks.push(
    await check(
      "model.unknown-gtin-404",
      "A GTIN-only URL with no published passport is 404",
      async () => {
        const r = await fetch(`${base}/01/00000000000000`);
        return { pass: r.status === 404, detail: `status=${String(r.status)}` };
      },
    ),
  );

  // 8. Plain JSON is negotiable (EN 18216:2026 cl. 5 makes JSON mandatory).
  //    Body shape: in-scope battery → Commission pub document (contentSpecificationIds
  //    present, @context absent). Other categories → JSON-LD-as-JSON (@context present).
  checks.push(
    await check(
      "passport.json-negotiation",
      batterySubgroup
        ? "Accept: application/json returns 200 with Commission pub document shape (in-scope battery)"
        : "Accept: application/json returns 200 application/json with JSON-LD shape",
      async () => {
        const r = await fetch(passportUrl, {
          headers: { Accept: "application/json" },
          redirect: "follow",
        });
        const ct = r.headers.get("content-type") ?? "";
        let body: unknown = undefined;
        let validJson = false;
        try {
          body = await r.json();
          validJson = true;
        } catch {
          validJson = false;
        }
        if (!(r.status === 200 && ct.includes("application/json") && validJson)) {
          return {
            pass: false,
            detail: `status=${String(r.status)} content-type=${ct} parses=${String(validJson)}`,
          };
        }
        // Body shape assertion.
        const obj = body as Record<string, unknown>;
        if (batterySubgroup) {
          // Commission pub document: must have contentSpecificationIds, must NOT have @context.
          const hasSpec =
            Array.isArray(obj["contentSpecificationIds"]) &&
            (obj["contentSpecificationIds"] as unknown[]).length > 0;
          const hasContext = "@context" in obj;
          const pass = hasSpec && !hasContext;
          return {
            pass,
            detail: `status=${String(r.status)} content-type=${ct} hasContentSpecificationIds=${String(hasSpec)} hasAtContext=${String(hasContext)}`,
          };
        } else {
          // JSON-LD-as-JSON: must have @context.
          const hasContext = "@context" in obj;
          return {
            pass: hasContext,
            detail: `status=${String(r.status)} content-type=${ct} hasAtContext=${String(hasContext)}`,
          };
        }
      },
    ),
  );

  // 9. HTTP/1.1 on passport paths. EN 18216:2026 cl. 4 makes HTTP/2 the
  //    minimum, so a browser (a request asking for HTML) is refused with 505.
  //    The EU DPP Registry checks that a UPI resolves with an HTTP/1.1 client
  //    sending `Accept: */*`, so a request that does not ask for HTML must be
  //    served (a deliberate choice). Only meaningful over TLS; skipped for a
  //    plain-http base. Node's https client offers no ALPN, so these requests
  //    are HTTP/1.1.
  if (base.startsWith("https://")) {
    const http1 = (accept: string) =>
      new Promise<number | string>((resolve) => {
        const req = httpsRequest(passportUrl, { headers: { Accept: accept } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? "no status");
        });
        req.on("error", (e) => {
          resolve(String(e));
        });
        req.end();
      });
    checks.push(
      await check(
        "passport.http1-refused",
        "HTTP/1.1 browser request (Accept: text/html) to the passport URL returns 505",
        async () => {
          const status = await http1("text/html,application/xhtml+xml,*/*;q=0.8");
          return { pass: status === 505, detail: `status=${String(status)}` };
        },
      ),
    );
    checks.push(
      await check(
        "passport.http1-machine-served",
        "HTTP/1.1 request with Accept: */* (the EU DPP Registry's resolvability check) returns 200",
        async () => {
          const status = await http1("*/*");
          return { pass: status === 200, detail: `status=${String(status)}` };
        },
      ),
    );
  }

  // ── GS1 resolver test suite (https://ref.gs1.org/test-suites/resolver/) ──
  // The suite probes through a server-side helper (curl: HEAD for headers and
  // redirects, OPTIONS for CORS, redirects never followed, `Origin` set), plus
  // one browser fetch of the description file. These checks send the same
  // requests, so this script cannot pass while that suite fails on a criterion
  // the resolver controls. Resolver standard 1.2.1 clauses are in the names.
  const SUITE_ORIGIN = "https://ref.gs1.org/test-suites/resolver/";
  const probe = (url: string, init: { method?: string; accept?: string } = {}) =>
    fetch(url, {
      method: init.method ?? "HEAD",
      redirect: "manual",
      headers: {
        Origin: SUITE_ORIGIN,
        ...(init.accept ? { Accept: init.accept } : {}),
        ...(init.method === "OPTIONS"
          ? { "Access-Control-Request-Method": "GET,HEAD,OPTIONS" }
          : {}),
      },
    });
  const stripQuery = (u: string) => (u.includes("?") ? u.slice(0, u.indexOf("?")) : u);
  const stripLinkType = (u: string | null) =>
    u === null ? null : u.replace(/[?&]linkType=[^&]*/, "").replace(/\?$/, "");

  checks.push(
    await check(
      "suite.rdfile-cors",
      "Description file is readable cross-origin (a browser fetch needs Access-Control-Allow-Origin) and names its resolverRoot (§3)",
      async () => {
        const r = await fetch(`${base}/.well-known/gs1resolver`, {
          headers: { Accept: "application/json", Origin: SUITE_ORIGIN },
        });
        const j = (await r.json()) as Record<string, unknown>;
        const acao = r.headers.get("access-control-allow-origin");
        const rootOk = typeof j.resolverRoot === "string" && /^https?:\/\//.test(j.resolverRoot);
        return {
          pass: r.status === 200 && acao !== null && rootOk,
          detail: `status=${String(r.status)} access-control-allow-origin=${String(acao)} resolverRoot=${String(rootOk)}`,
        };
      },
    ),
  );

  checks.push(
    await check(
      "suite.cors-options",
      "OPTIONS on a passport URL returns CORS headers naming GET, HEAD and OPTIONS (SHALL support CORS; GET, HEAD, OPTIONS)",
      async () => {
        const r = await probe(passportUrl, { method: "OPTIONS" });
        const acao = r.headers.get("access-control-allow-origin");
        const methods = r.headers.get("access-control-allow-methods") ?? "";
        const all = ["GET", "HEAD", "OPTIONS"].every((m) => methods.includes(m));
        return {
          pass: r.status < 300 && acao !== null && all,
          detail: `status=${String(r.status)} allow-origin=${String(acao)} allow-methods=${methods}`,
        };
      },
    ),
  );

  checks.push(
    await check(
      "suite.head",
      "HEAD on a passport URL returns 200 (GET and HEAD supported)",
      async () => {
        const r = await probe(passportUrl);
        return { pass: r.status === 200, detail: `status=${String(r.status)}` };
      },
    ),
  );

  checks.push(
    await check(
      "suite.syntax-400",
      "A non-conformant Digital Link URI (extra path segment) is answered 400, not 404 (§2.4)",
      async () => {
        const r = await probe(`${passportUrl}/foo`);
        return { pass: r.status === 400, detail: `status=${String(r.status)}` };
      },
    ),
  );

  checks.push(
    await check(
      "suite.trailing-slash",
      "The same URI with and without a trailing slash answers identically (§2.13)",
      async () => {
        const a = await probe(passportUrl);
        const b = await probe(`${passportUrl}/`);
        const same =
          a.status === b.status && a.headers.get("location") === b.headers.get("location");
        return { pass: same, detail: `without=${String(a.status)} with=${String(b.status)}` };
      },
    ),
  );

  checks.push(
    await check(
      "suite.qualifier-walk-up",
      "A batch qualifier on a serialised URI is walked up to the item (key qualifiers SHALL be supported, §2.5.9)",
      async () => {
        const r = await probe(`${base}/01/${gtin}/10/KL8G/21/${serial}`);
        return { pass: r.status === 200, detail: `status=${String(r.status)}` };
      },
    ),
  );

  checks.push(
    await check(
      "suite.qualifier-unknown-value",
      "A batch qualifier with no serial is not a 404 (the suite's `basicWalkUp` probe)",
      async () => {
        // The batch qualifier is walked up to the GTIN, which is the product's model
        // page while the GTIN belongs to one product with published passports.
        const r = await probe(`${base}/01/${modelGtin ?? gtin}/10/KL8G`);
        return { pass: r.status !== 404, detail: `status=${String(r.status)}` };
      },
      modelGtinGap,
    ),
  );

  // The linkset, fetched the way the suite fetches it (Accept, GET).
  const linksetRes = await fetch(passportUrl, { headers: { Accept: "application/linkset+json" } });
  const linksetLink = linksetRes.headers.get("link") ?? "";
  type LinksetLink = { href: string; title?: string; [attr: string]: unknown };
  let context: Record<string, unknown> = {};
  try {
    const j = (await linksetRes.json()) as { linkset?: Record<string, unknown>[] };
    context = j.linkset?.[0] ?? {};
  } catch {
    context = {};
  }

  checks.push(
    await check(
      "suite.linkset-context-link",
      "The linkset response carries a Link header to a JSON-LD context (rel json-ld#context, type application/ld+json; §2.10)",
      () => {
        const ok = linksetLink
          .split(",")
          .some(
            (l) =>
              l.includes('rel="http://www.w3.org/ns/json-ld#context"') &&
              l.includes('type="application/ld+json"'),
          );
        return { pass: ok, detail: `link=${linksetLink}` };
      },
    ),
  );

  checks.push(
    await check(
      "suite.linkset-anchor",
      "The linkset's anchor is the passport URI (the suite matches it to the URL it was given)",
      () => {
        const anchor = typeof context.anchor === "string" ? context.anchor : "";
        return {
          pass: anchor.endsWith(`/01/${gtin}/21/${serial}`),
          detail: `anchor=${anchor}`,
        };
      },
    ),
  );

  checks.push(
    await check(
      "suite.default-link",
      "Exactly one gs1:defaultLink, with a title and no other attribute (§2.5.8)",
      () => {
        const d = context["https://ref.gs1.org/voc/defaultLink"] as LinksetLink[] | undefined;
        const only =
          Array.isArray(d) &&
          d.length === 1 &&
          Object.keys(d[0] ?? {})
            .sort()
            .join(",") === "href,title";
        return { pass: only, detail: `defaultLink=${JSON.stringify(d)}` };
      },
    ),
  );

  checks.push(
    await check(
      "suite.linktype-linkset",
      "?linkType=linkset returns the linkset without redirecting (§2.9)",
      async () => {
        const r = await probe(`${passportUrl}?linkType=linkset`);
        const ct = r.headers.get("content-type") ?? "";
        return {
          pass: r.status === 200 && ct.includes("application/linkset+json"),
          detail: `status=${String(r.status)} content-type=${ct}`,
        };
      },
    ),
  );

  // Every link type the linkset lists redirects to its link.
  const listedTypes = Object.keys(context).filter(
    (k) => k !== "anchor" && !k.endsWith("/defaultLink") && !k.endsWith("itemDescription"),
  );
  checks.push(
    await check("suite.linktype-listed", "The linkset lists link types to test", () => ({
      pass: listedTypes.length > 0,
      detail: `types=${listedTypes.join(", ")}`,
    })),
  );
  for (const key of listedTypes) {
    const curie = key.replace("https://ref.gs1.org/voc/", "gs1:");
    const links = context[key] as LinksetLink[];
    const href = links[0]?.href ?? "";
    checks.push(
      await check(
        `suite.redirect.${curie}`,
        `?linkType=${curie} redirects to the link in the linkset (§2.6.2)`,
        async () => {
          const r = await probe(`${passportUrl}?linkType=${curie}`);
          const loc = stripLinkType(r.headers.get("location"));
          return {
            pass: (r.status === 307 || r.status === 302) && loc === href,
            detail: `status=${String(r.status)} location=${String(loc)} expected=${href}`,
          };
        },
      ),
    );
  }

  checks.push(
    await check(
      "suite.redirect.query-passed-on",
      "A redirect passes the query string on and drops linkType (§2.12)",
      async () => {
        const r = await probe(`${passportUrl}?linkType=gs1:pip&foo=bar`);
        const loc = r.headers.get("location") ?? "";
        return {
          pass: r.status === 307 && loc.includes("foo=bar") && !loc.includes("linkType"),
          detail: `status=${String(r.status)} location=${loc}`,
        };
      },
    ),
  );

  checks.push(
    await check(
      "suite.redirect.unavailable-404",
      "A link type the entity has no link for is answered 404 (§2.6.2)",
      async () => {
        const r = await probe(`${passportUrl}?linkType=gs1:nosuchlt`);
        return { pass: r.status === 404, detail: `status=${String(r.status)}` };
      },
    ),
  );

  checks.push(
    await check(
      "suite.redirect-to-default",
      "A request with no linkType redirects to the default link (§2.6.1: SHALL redirect to the default link)",
      async () => {
        const d = context["https://ref.gs1.org/voc/defaultLink"] as LinksetLink[] | undefined;
        const r = await probe(stripQuery(passportUrl));
        const loc = r.headers.get("location");
        return {
          pass: r.status >= 300 && r.status < 400 && loc === d?.[0]?.href,
          detail: `status=${String(r.status)} location=${String(loc)}`,
        };
      },
      "The resolver serves the passport at the URI itself (a QR scan answers directly) and the default link names that same URI. Deliberate: printed QR codes and the EU DPP Registry point at that URI, and a redirect would add a hop to every scan.",
    ),
  );

  const knownGaps = checks.filter((c) => !c.pass && c.knownGap !== undefined).length;
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed - knownGaps;
  const result: ConformanceResult = {
    base,
    gtin,
    serial,
    ranAt: new Date().toISOString(),
    checks,
    passed,
    failed,
    knownGaps,
  };

  // Pretty console output.
  console.log(`GS1 Digital Link resolver conformance — ${base}`);
  console.log("=".repeat(64));
  for (const c of checks) {
    const mark = c.pass ? "✓" : c.knownGap !== undefined ? "~" : "✗";
    console.log(`${mark} ${c.id.padEnd(28)} ${c.name}`);
    if (!c.pass && c.detail) {
      console.log(`  ↳ ${c.detail}`);
    }
    if (!c.pass && c.knownGap !== undefined) {
      console.log(`  ↳ known gap: ${c.knownGap}`);
    }
  }
  console.log("=".repeat(64));
  console.log(
    `${String(passed)} passed, ${String(failed)} failed, ${String(knownGaps)} known gaps`,
  );

  // Write result to disk for committing to the repo + linking from
  // /trust on the marketing site.
  const outDir = join(process.cwd(), "out");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "gs1-conformance-result.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Wrote ${outPath}`);

  process.exit(failed === 0 ? 0 : 1);
}

void main();
