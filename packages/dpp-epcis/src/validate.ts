/**
 * Lightweight structural validation of TracePass-emitted EPCIS
 * documents.
 *
 * This is NOT a full EPCIS 2.0 JSON Schema validator — the official
 * schema is large and a full `ajv`-based validation belongs in the
 * conformance self-test script (`scripts/epcis-conformance-check.ts`),
 * run against a live endpoint, not on every request. What this module
 * does is a fast, dependency-free sanity check the document builder
 * and tests can call to catch the structural mistakes that would make
 * a document obviously non-conformant:
 *   - missing the EPCIS envelope keys
 *   - an event without the mandatory `type` / `eventTime` /
 *     `eventTimeZoneOffset`
 *   - an event with neither `epcList` nor `outputEPCList` (an event
 *     about no object is meaningless)
 *
 * It is deliberately permissive about everything else — the goal is
 * "would a strict consumer immediately reject this", not "is every
 * optional field perfect".
 *
 * Pure. Unit-tested in tests/epcis/validate.test.ts.
 */

/** A single problem found in a document. `path` locates it. */
export interface EpcisValidationIssue {
  path: string;
  message: string;
}

export interface EpcisValidationResult {
  valid: boolean;
  issues: EpcisValidationIssue[];
}

/** EPCIS event types EPCIS 2.0 defines. */
const KNOWN_EVENT_TYPES = new Set([
  "ObjectEvent",
  "AggregationEvent",
  "TransformationEvent",
  "TransactionEvent",
  "AssociationEvent",
]);

/** ISO-8601-ish instant: date + time + offset. Loose by design. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Timezone offset: `Z`-free `+HH:MM` / `-HH:MM`, or `+00:00`. */
const TZ_OFFSET = /^[+-]\d{2}:\d{2}$/;

/**
 * Standard GS1 CBV 2.0 bizStep short-form values that OpenEPCIS accepts
 * without a URI. The EPCIS 2.0 spec allows two shapes:
 *   1. A short token from this enum (`"shipping"`, `"receiving"`, …)
 *   2. A fully-qualified URI (any `https://…` or `urn:…`)
 *
 * OpenEPCIS rejects anything that's neither — found 2026-05-23 when
 * test events with arbitrary tokens like `prod_smoke_test` got routed
 * to the `epcis-event-validated-failure` Kafka topic and silently
 * dropped (no error surfaced back to the client).
 *
 * Source: GS1 CBV 2.0 Table 7-2 (bizStep). Updated when CBV ratifies
 * new bizSteps — rare; the list has been stable since CBV 2.0 (2022).
 */
const CBV_BIZSTEP_TOKENS = new Set([
  "accepting", "arriving", "assembling", "collecting", "commissioning",
  "consigning", "creating_class_instance", "cycle_counting",
  "decommissioning", "departing", "destroying", "disassembling",
  "dispensing", "encoding", "entering_exiting", "holding", "inspecting",
  "installing", "killing", "loading", "other", "packing", "picking",
  "receiving", "removing", "repackaging", "repairing", "replacing",
  "reserving", "retail_selling", "sampling", "sensor_reporting",
  "shipping", "staging_outbound", "stock_taking", "stocking", "storing",
  "transporting", "unloading", "unpacking", "void_shipping",
]);

/**
 * Standard GS1 CBV 2.0 disposition short-form values. Same accept-OR-URI
 * rule as bizStep above.
 *
 * Source: GS1 CBV 2.0 Table 7-3 (disposition).
 */
const CBV_DISPOSITION_TOKENS = new Set([
  "active", "available", "completeness_inferred", "completeness_verified",
  "conformant", "container_closed", "container_open", "damaged", "destroyed",
  "dispensed", "disposed", "encoded", "expired", "in_progress", "in_transit",
  "inactive", "mismatch_instance", "mismatch_class", "mismatch_quantity",
  "needs_replacement", "no_pedigree_match", "non_conformant", "non_sellable_other",
  "partially_dispensed", "recalled", "reserved", "retail_sold", "returned",
  "sellable_accessible", "sellable_not_accessible", "stolen", "unavailable",
  "unknown",
]);

/**
 * True when `value` is a recognised CBV short-form OR looks like a URI.
 * Permissive on URIs — the spec allows any URI (and OpenEPCIS does too).
 *
 * Used by both bizStep + disposition; pass the corresponding token set.
 */
function isCbvValueOrUri(value: unknown, tokens: Set<string>): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (tokens.has(value)) return true;
  // URI check — accept anything that looks like `scheme:path`.
  // Matches `https://ref.gs1.org/cbv/BizStep-shipping`,
  // `urn:epcglobal:cbv:bizstep:shipping`, `tracepass:cbv/bizstep/smelting`.
  return /^[a-z][a-z0-9+.\-]*:\S+$/i.test(value);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate one EPCIS event object. Pushes issues onto `issues` with
 * paths rooted at `basePath`.
 */
function validateEvent(
  event: unknown,
  basePath: string,
  issues: EpcisValidationIssue[],
): void {
  if (!isObject(event)) {
    issues.push({ path: basePath, message: "event is not an object" });
    return;
  }

  const type = event.type;
  if (typeof type !== "string" || !KNOWN_EVENT_TYPES.has(type)) {
    issues.push({
      path: `${basePath}.type`,
      message: `missing or unknown event type: ${String(type)}`,
    });
  }

  if (typeof event.eventTime !== "string" || !ISO_INSTANT.test(event.eventTime)) {
    issues.push({
      path: `${basePath}.eventTime`,
      message: "missing or non-ISO-8601 eventTime",
    });
  }

  if (
    typeof event.eventTimeZoneOffset !== "string" ||
    !TZ_OFFSET.test(event.eventTimeZoneOffset)
  ) {
    issues.push({
      path: `${basePath}.eventTimeZoneOffset`,
      message: "missing or malformed eventTimeZoneOffset",
    });
  }

  // An event must be about at least one object. The object-bearing
  // key depends on the event type:
  //   - ObjectEvent / TransactionEvent → `epcList`
  //   - TransformationEvent           → `inputEPCList` / `outputEPCList`
  //   - AggregationEvent              → `childEPCs` (+ a `parentID`)
  // Omitting `childEPCs` here would reject every valid AggregationEvent.
  const nonEmptyArray = (v: unknown): boolean =>
    Array.isArray(v) && v.length > 0;
  const hasObjects =
    nonEmptyArray(event.epcList) ||
    nonEmptyArray(event.outputEPCList) ||
    nonEmptyArray(event.inputEPCList) ||
    nonEmptyArray(event.childEPCs) ||
    typeof event.parentID === "string";
  if (!hasObjects) {
    issues.push({
      path: basePath,
      message:
        "event references no objects (no epcList / outputEPCList / inputEPCList / childEPCs / parentID)",
    });
  }

  // CBV vocabulary check on bizStep + disposition. Both are OPTIONAL
  // EPCIS fields — only validate when present. When present, they
  // must be either a known CBV short-form token (`shipping`) or a
  // valid URI (`https://ref.gs1.org/cbv/BizStep-shipping`,
  // `tracepass:cbv/bizstep/smelting`). OpenEPCIS rejects anything
  // else silently into its `epcis-event-validated-failure` Kafka
  // topic — see the comment on CBV_BIZSTEP_TOKENS above for why this
  // is dropped here in the platform instead of waiting for OpenEPCIS
  // to find out.
  if (event.bizStep !== undefined &&
      !isCbvValueOrUri(event.bizStep, CBV_BIZSTEP_TOKENS)) {
    issues.push({
      path: `${basePath}.bizStep`,
      message:
        `bizStep "${String(event.bizStep)}" is not a CBV short-form token ` +
        `(e.g. "shipping", "receiving") or a URI ` +
        `(e.g. "https://ref.gs1.org/cbv/BizStep-shipping"). ` +
        "OpenEPCIS will reject it.",
    });
  }
  if (event.disposition !== undefined &&
      !isCbvValueOrUri(event.disposition, CBV_DISPOSITION_TOKENS)) {
    issues.push({
      path: `${basePath}.disposition`,
      message:
        `disposition "${String(event.disposition)}" is not a CBV short-form ` +
        `token (e.g. "in_transit", "active") or a URI. ` +
        "OpenEPCIS will reject it.",
    });
  }
}

/**
 * Validate a full EPCISDocument structure. Returns `{ valid, issues }`
 * — `valid` is true only when `issues` is empty.
 */
export function validateEpcisDocument(doc: unknown): EpcisValidationResult {
  const issues: EpcisValidationIssue[] = [];

  if (!isObject(doc)) {
    return { valid: false, issues: [{ path: "$", message: "document is not an object" }] };
  }

  if (doc["@context"] === undefined) {
    issues.push({ path: "$.@context", message: "missing @context" });
  }

  if (doc.type !== "EPCISDocument") {
    issues.push({
      path: "$.type",
      message: `type must be "EPCISDocument", got: ${String(doc.type)}`,
    });
  }

  if (doc.schemaVersion !== "2.0") {
    issues.push({
      path: "$.schemaVersion",
      message: `schemaVersion must be "2.0", got: ${String(doc.schemaVersion)}`,
    });
  }

  const body = doc.epcisBody;
  if (!isObject(body)) {
    issues.push({ path: "$.epcisBody", message: "missing or malformed epcisBody" });
  } else {
    const eventList = body.eventList;
    if (!Array.isArray(eventList)) {
      issues.push({
        path: "$.epcisBody.eventList",
        message: "eventList must be an array",
      });
    } else {
      eventList.forEach((ev, i) => {
        validateEvent(ev, `$.epcisBody.eventList[${i}]`, issues);
      });
    }
  }

  return { valid: issues.length === 0, issues };
}
