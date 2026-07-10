/**
 * Map Digital Product Passport data to GS1 EPCIS 2.0 events.
 *
 * Pure functions over plain objects — no network, no database. Includes a CBV
 * 2.0 (Core Business Vocabulary) mapping, extended with vocabulary URIs for
 * steel production steps that standard CBV does not cover, following the
 * GS1-sanctioned extension pattern.
 */

export {
  toEventTime,
  buildTransformationEvent,
  buildServiceObjectEvent,
  buildOwnershipObjectEvent,
  buildCommissioningEvent,
  buildSupplierObjectEvent,
} from "./event-builders.js";
export type {
  SupplyChainEventInput,
  SupplierReportedEvent,
} from "./event-builders.js";

export {
  CBV_BIZSTEP_URI,
  CBV_DISPOSITION_URI,
  TRACEPASS_BIZSTEP_URI,
  normalizeStepToken,
  mapEventTypeToBizStep,
  mapServiceEventType,
  mapOwnershipReasonDisposition,
} from "./cbv.js";
export type { BizStepMapping } from "./cbv.js";

export { validateEpcisDocument } from "./validate.js";
export type {
  EpcisValidationIssue,
  EpcisValidationResult,
} from "./validate.js";

export { passportEpc, locationUri, locationRef, buildEventId } from "./identifiers.js";

export {
  EPCIS_CONTEXT_URL,
  TRACEPASS_VOC_BASE,
  EPCIS_JSONLD_CONTEXT,
} from "./context.js";
