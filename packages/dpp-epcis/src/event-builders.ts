/**
 * Pure builders for individual EPCIS 2.0 events.
 *
 * Each function takes a TracePass domain object and returns a plain
 * JSON-LD-shaped EPCIS event object. No IO, no template lookups, no
 * @context (the document builder in `document.ts` adds the single
 * shared @context once for the whole document).
 *
 * Three event sources, per the [Q1] decision (all three in Layer A,
 * `supplyChainEvents` first):
 *   - `supplyChainEvents` (steel template field 77) → TransformationEvent
 *     — a production step consumes inputs and yields the product.
 *   - `ServiceEvent`        → ObjectEvent — repair/inspection observed
 *     on the product after it exists.
 *   - `OwnershipTransfer`   → ObjectEvent — a custody/ownership change.
 *
 * EPCIS time fields: every event needs `eventTime` (an instant) and
 * `eventTimeZoneOffset` (the offset that instant was recorded in).
 * TracePass stores timestamps as UTC `Date`s with no original offset
 * retained, so we emit `eventTime` in UTC and `eventTimeZoneOffset`
 * as `+00:00`. This is honest — it says "recorded in UTC" — rather
 * than inventing a local offset we never captured.
 *
 * Unit-tested in tests/epcis/event-builders.test.ts.
 */

import type { ServiceEvent, OwnershipTransfer } from "@tracepass/dpp-types";
import {
  mapEventTypeToBizStep,
  mapServiceEventType,
  mapOwnershipReasonDisposition,
  CBV_BIZSTEP_URI,
} from "./cbv.js";
import { locationRef, buildEventId } from "./identifiers.js";

/** EPCIS `eventTimeZoneOffset` for our UTC-stored timestamps. */
const UTC_OFFSET = "+00:00";

/**
 * One entry of the steel template's `supplyChainEvents` array (field
 * 77). The template's `aiHints.expectedFormat` documents the shape:
 * `{eventType, timestamp, location, country, operator, epcisEventId}`.
 * Every field is optional in practice — supplier-provided data is
 * uneven — so the builder must tolerate partial entries.
 */
export interface SupplyChainEventInput {
  eventType?: string;
  timestamp?: string;
  location?: string;
  country?: string;
  operator?: string;
  /** A pre-existing EPCIS event id, if the source system already had
   *  one. When present we reuse it instead of minting our own. */
  epcisEventId?: string;
  /** GLN of the operating site, when the source provided one. */
  gln?: string;
}

/**
 * Convert an ISO-ish timestamp string (or Date) to an EPCIS
 * `eventTime` string. Returns null when the value can't be parsed —
 * the caller drops the event rather than emit an invalid time.
 */
export function toEventTime(value: string | Date | undefined | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Build a TransformationEvent from one `supplyChainEvents` entry.
 *
 * A production step is a transformation: inputs (ore, billet, scrap)
 * become the output product. We rarely hold the input EPCs from
 * supplier data, so `inputEPCList` is usually empty and the event
 * carries only the `outputEPCList` (the product) — still a valid
 * TransformationEvent under EPCIS 2.0.
 *
 * Returns null when the entry has no usable timestamp (an EPCIS event
 * without `eventTime` is invalid).
 */
export function buildTransformationEvent(
  entry: SupplyChainEventInput,
  productEpc: string,
  passportId: string,
  index: number,
): Record<string, unknown> | null {
  const eventTime = toEventTime(entry.timestamp);
  if (!eventTime) return null;

  const { bizStep } = mapEventTypeToBizStep(entry.eventType ?? "");

  const event: Record<string, unknown> = {
    type: "TransformationEvent",
    eventID: entry.epcisEventId || buildEventId(passportId, `sce-${index}`),
    eventTime,
    eventTimeZoneOffset: UTC_OFFSET,
    outputEPCList: [productEpc],
    bizStep,
  };

  const where = locationRef(entry.gln);
  if (where) {
    event.bizLocation = where;
  }

  // Preserve human-readable provenance that has no native EPCIS slot
  // under the tracepass: namespace — a strict consumer ignores it,
  // a TracePass-aware one keeps the operator/country/site label.
  const annotations: Record<string, unknown> = {};
  if (entry.eventType) annotations["tracepass:processStep"] = entry.eventType;
  if (entry.operator) annotations["tracepass:operator"] = entry.operator;
  if (entry.country) annotations["tracepass:country"] = entry.country;
  if (entry.location) annotations["tracepass:locationName"] = entry.location;
  Object.assign(event, annotations);

  return event;
}

/**
 * Build an ObjectEvent from a `ServiceEvent` (repair / warranty /
 * maintenance / inspection / replacement / recall).
 *
 * The event is `action: "OBSERVE"` — a service event observes an
 * existing object, it doesn't create or destroy it. Uses `performedAt`
 * for the time; falls back to `createdAt` when the service wasn't
 * marked performed (a scheduled-but-not-done service still has a
 * record time). Returns null when neither timestamp is usable.
 */
export function buildServiceObjectEvent(
  service: Pick<
    ServiceEvent,
    "_id" | "type" | "title" | "performedBy" | "performedAt" | "createdAt" | "warrantyRef"
  >,
  productEpc: string,
  passportId: string,
): Record<string, unknown> | null {
  const eventTime = toEventTime(service.performedAt ?? service.createdAt);
  if (!eventTime) return null;

  const { bizStep, disposition } = mapServiceEventType(service.type);

  const event: Record<string, unknown> = {
    type: "ObjectEvent",
    eventID: buildEventId(passportId, `service-${service._id.toString()}`),
    eventTime,
    eventTimeZoneOffset: UTC_OFFSET,
    epcList: [productEpc],
    action: "OBSERVE",
    bizStep,
    disposition,
    "tracepass:serviceType": service.type,
  };

  if (service.title) event["tracepass:serviceTitle"] = service.title;
  if (service.performedBy) event["tracepass:performedBy"] = service.performedBy;
  if (service.warrantyRef) event["tracepass:warrantyRef"] = service.warrantyRef;

  return event;
}

/**
 * Build an ObjectEvent from an `OwnershipTransfer`. A custody change
 * is an `action: "OBSERVE"` ObjectEvent — the object persists, only
 * its holder changes. We only export *accepted* transfers (a pending
 * or rejected transfer is not a real custody change) — the caller is
 * expected to filter, but the builder also guards.
 *
 * Returns null when the transfer isn't accepted or has no usable time.
 */
export function buildOwnershipObjectEvent(
  transfer: Pick<
    OwnershipTransfer,
    "_id" | "reason" | "transferredAt" | "createdAt" | "status" | "fromName" | "toName"
  >,
  productEpc: string,
  passportId: string,
): Record<string, unknown> | null {
  if (transfer.status !== "accepted") return null;

  const eventTime = toEventTime(transfer.transferredAt ?? transfer.createdAt);
  if (!eventTime) return null;

  const event: Record<string, unknown> = {
    type: "ObjectEvent",
    eventID: buildEventId(passportId, `ownership-${transfer._id.toString()}`),
    eventTime,
    eventTimeZoneOffset: UTC_OFFSET,
    epcList: [productEpc],
    action: "OBSERVE",
    bizStep:
      transfer.reason === "recycling"
        ? CBV_BIZSTEP_URI.decommissioning
        : CBV_BIZSTEP_URI.shipping,
    disposition: mapOwnershipReasonDisposition(transfer.reason),
    "tracepass:ownershipReason": transfer.reason,
  };

  // from/to names are custody parties; no GLN is held for them, so
  // they ride as tracepass: annotations rather than EPCIS sourceList.
  if (transfer.fromName) event["tracepass:transferFrom"] = transfer.fromName;
  if (transfer.toName) event["tracepass:transferTo"] = transfer.toName;

  return event;
}

/**
 * Build the commissioning ObjectEvent — the "this passport went live"
 * event, emitted from `passport.publishedAt`. Every published passport
 * gets exactly one; it anchors the event timeline even when the
 * passport has no supply-chain or service events at all.
 *
 * Returns null when there is no publish timestamp (an unpublished
 * passport shouldn't be EPCIS-exported in the first place).
 */
export function buildCommissioningEvent(
  publishedAt: Date | string | undefined | null,
  productEpc: string,
  passportId: string,
  manufacturerGln?: string | null,
): Record<string, unknown> | null {
  const eventTime = toEventTime(publishedAt);
  if (!eventTime) return null;

  const event: Record<string, unknown> = {
    type: "ObjectEvent",
    eventID: buildEventId(passportId, "commissioning"),
    eventTime,
    eventTimeZoneOffset: UTC_OFFSET,
    epcList: [productEpc],
    action: "ADD",
    bizStep: CBV_BIZSTEP_URI.commissioning,
  };

  const where = locationRef(manufacturerGln);
  if (where) event.bizLocation = where;

  return event;
}

/**
 * One supply-chain event a supplier reports through the portal — the
 * plain shape collected from the supplier-facing form (mirrors the
 * Zod `supplierSupplyChainEventSchema`).
 */
export interface SupplierReportedEvent {
  eventType: string;
  timestamp: string;
  location?: string;
  country?: string;
  gln?: string;
}

/**
 * Build an EPCIS ObjectEvent from a supplier-reported supply-chain
 * event. A supplier describing "shipping" / "receiving" / a
 * production step is reporting an observation about the component
 * they supply — an `action: "OBSERVE"` ObjectEvent.
 *
 * `bizStep` is mapped through `mapEventTypeToBizStep`, so both
 * standard CBV steps (shipping, receiving) and production steps
 * (smelting, …) resolve correctly — the same mapping the inline
 * supply-chain events use.
 *
 * `index` makes the minted `eventID` deterministic per (passport,
 * supplier-submission-index), so re-capturing the same submission
 * dedupes rather than piling up duplicates.
 *
 * Returns null when the report has no usable timestamp.
 */
export function buildSupplierObjectEvent(
  report: SupplierReportedEvent,
  productEpc: string,
  passportId: string,
  index: number,
): Record<string, unknown> | null {
  const eventTime = toEventTime(report.timestamp);
  if (!eventTime) return null;

  const { bizStep } = mapEventTypeToBizStep(report.eventType ?? "");

  const event: Record<string, unknown> = {
    type: "ObjectEvent",
    eventID: buildEventId(passportId, `supplier-${index}`),
    eventTime,
    eventTimeZoneOffset: UTC_OFFSET,
    epcList: [productEpc],
    action: "OBSERVE",
    bizStep,
  };

  const where = locationRef(report.gln);
  if (where) event.bizLocation = where;

  // Human-readable provenance the supplier gave — no native EPCIS
  // slot, kept under the tracepass: namespace (a strict consumer
  // ignores it, a TracePass-aware one keeps the supplier's labels).
  if (report.eventType) event["tracepass:processStep"] = report.eventType;
  if (report.country) event["tracepass:country"] = report.country;
  if (report.location) event["tracepass:locationName"] = report.location;
  event["tracepass:reportedBySupplier"] = true;

  return event;
}
