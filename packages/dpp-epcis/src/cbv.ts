/**
 * CBV (Core Business Vocabulary) mapping for TracePass EPCIS events.
 *
 * EPCIS defines the *shape* of an event; CBV defines the controlled
 * vocabulary that fills the `bizStep` and `disposition` slots. CBV 2.0
 * ships a FIXED list of bizStep values (commissioning, shipping,
 * receiving, inspecting, repairing, …). Many real production steps —
 * smelting, rolling, finishing — are simply not in that list.
 *
 * Decision [Q2] from the 2026-05-22 EPCIS review: for production steps
 * absent from CBV we coin TracePass-owned vocabulary URIs under
 * `https://tracepass.eu/voc/cbv/bizstep/<step>`. EPCIS 2.0 explicitly
 * permits bizStep values outside standard CBV provided they are URIs;
 * this is the GS1-sanctioned industry-extension pattern. We do NOT use
 * the weaker "everything is `commissioning` + a free-text annotation"
 * hack — that buries the meaningful detail in a non-standard field.
 *
 * This module is the single source of truth for those mappings. It is
 * pure data + pure functions — no IO, unit-tested in tests/epcis/cbv.test.ts.
 *
 * What we own and must maintain: the `TRACEPASS_BIZSTEP` table below is
 * a small steel/metals-oriented vocabulary. When a new category needs
 * production steps, extend this table — and keep the published
 * vocabulary document (served from the marketing/voc route) in sync.
 */

import type { ServiceEventType } from "@tracepass/dpp-types";
import { TRACEPASS_VOC_BASE } from "./context.js";

/**
 * Standard CBV 2.0 bizStep URI prefix. Values under this prefix are
 * the official, GS1-ratified business steps — a strict EPCIS consumer
 * recognises them without dereferencing our vocabulary.
 */
const CBV_BIZSTEP = "https://ref.gs1.org/cbv/BizStep-";

/**
 * Standard CBV 2.0 disposition URI prefix.
 */
const CBV_DISP = "https://ref.gs1.org/cbv/Disp-";

/**
 * TracePass-owned bizStep prefix for production steps CBV doesn't
 * cover. Resolvable — the vocabulary document published at
 * `<TRACEPASS_VOC_BASE>cbv/bizstep` describes each term.
 */
const TP_BIZSTEP = `${TRACEPASS_VOC_BASE}cbv/bizstep/`;

/**
 * The subset of standard CBV bizSteps TracePass actually emits. Kept
 * as a typed record so a typo surfaces at compile time, not as a
 * silently-wrong URI in a customer's EPCIS feed.
 */
export const CBV_BIZSTEP_URI = {
  commissioning: `${CBV_BIZSTEP}commissioning`,
  shipping: `${CBV_BIZSTEP}shipping`,
  receiving: `${CBV_BIZSTEP}receiving`,
  inspecting: `${CBV_BIZSTEP}inspecting`,
  repairing: `${CBV_BIZSTEP}repairing`,
  decommissioning: `${CBV_BIZSTEP}decommissioning`,
  storing: `${CBV_BIZSTEP}storing`,
  shipping_returned: `${CBV_BIZSTEP}shipping`,
} as const;

/**
 * The subset of standard CBV dispositions TracePass emits.
 */
export const CBV_DISPOSITION_URI = {
  active: `${CBV_DISP}active`,
  in_progress: `${CBV_DISP}in_progress`,
  in_transit: `${CBV_DISP}in_transit`,
  in_repair: `${CBV_DISP}in_progress`,
  recalled: `${CBV_DISP}recalled`,
  destroyed: `${CBV_DISP}destroyed`,
  returned: `${CBV_DISP}returned`,
} as const;

/**
 * TracePass-coined bizStep URIs for production / lifecycle steps that
 * standard CBV does not define. Each key is a normalised step token;
 * each value is a resolvable `tracepass:` vocabulary URI.
 *
 * Steel/metals-oriented for the lead vertical. Extend (don't replace)
 * when other categories need their own production steps — and update
 * the published vocabulary doc in the same change.
 */
export const TRACEPASS_BIZSTEP_URI = {
  mining: `${TP_BIZSTEP}mining`,
  smelting: `${TP_BIZSTEP}smelting`,
  casting: `${TP_BIZSTEP}casting`,
  rolling: `${TP_BIZSTEP}rolling`,
  forging: `${TP_BIZSTEP}forging`,
  finishing: `${TP_BIZSTEP}finishing`,
  coating: `${TP_BIZSTEP}coating`,
  heat_treatment: `${TP_BIZSTEP}heat-treatment`,
  machining: `${TP_BIZSTEP}machining`,
  assembly: `${TP_BIZSTEP}assembly`,
  recycling: `${TP_BIZSTEP}recycling`,
} as const;

/**
 * Result of mapping a free-text event type onto CBV. `standard` flags
 * whether the bizStep is a ratified CBV value (true) or a
 * TracePass-coined extension URI (false) — the EPCIS document builder
 * uses this to decide nothing today, but it lets the conformance
 * self-test report "N standard / M extension bizSteps".
 */
export interface BizStepMapping {
  /** The bizStep URI to put on the event. Always a URI. */
  bizStep: string;
  /** True when `bizStep` is a ratified CBV value; false when it is a
   *  TracePass extension URI. */
  standard: boolean;
}

/**
 * Normalise a free-text event-type string into a lookup token:
 * lower-cased, trimmed, internal whitespace + hyphens collapsed to a
 * single underscore. "Heat Treatment" / "heat-treatment" → "heat_treatment".
 */
export function normalizeStepToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Map a free-text `supplyChainEvents[].eventType` string (the steel
 * template's field 77 — "smelting", "rolling", "shipping", …) to a
 * bizStep URI.
 *
 * Resolution order:
 *   1. Standard CBV bizStep whose name matches the token exactly.
 *   2. TracePass-coined production-step URI.
 *   3. Fallback: a TracePass extension URI minted from the token
 *      itself — an unknown step still produces a *valid, resolvable*
 *      URI rather than dropping the bizStep. The conformance test
 *      surfaces these so the vocabulary table can be extended.
 *
 * Never throws — an EPCIS document builder must not fail on an
 * unexpected production-step string.
 */
export function mapEventTypeToBizStep(eventType: string): BizStepMapping {
  const token = normalizeStepToken(eventType);

  if (token in CBV_BIZSTEP_URI) {
    return {
      bizStep: CBV_BIZSTEP_URI[token as keyof typeof CBV_BIZSTEP_URI],
      standard: true,
    };
  }
  if (token in TRACEPASS_BIZSTEP_URI) {
    return {
      bizStep: TRACEPASS_BIZSTEP_URI[token as keyof typeof TRACEPASS_BIZSTEP_URI],
      standard: false,
    };
  }
  // Unknown step — mint a stable extension URI from the token so the
  // event is still valid EPCIS. token is already URI-safe.
  return {
    bizStep: `${TP_BIZSTEP}${token || "unspecified"}`,
    standard: false,
  };
}

/**
 * Map a `ServiceEvent.type` enum value to a (bizStep, disposition)
 * pair. ServiceEvents become EPCIS ObjectEvents in the Layer A export.
 * Unlike production steps these map cleanly onto standard CBV — repair
 * and inspection are first-class CBV business steps.
 */
export function mapServiceEventType(type: ServiceEventType): {
  bizStep: string;
  disposition: string;
  standard: boolean;
} {
  switch (type) {
    case "repair":
    case "replacement":
      return {
        bizStep: CBV_BIZSTEP_URI.repairing,
        disposition: CBV_DISPOSITION_URI.in_repair,
        standard: true,
      };
    case "warranty_claim":
      return {
        bizStep: CBV_BIZSTEP_URI.repairing,
        disposition: CBV_DISPOSITION_URI.active,
        standard: true,
      };
    case "maintenance":
    case "inspection":
      return {
        bizStep: CBV_BIZSTEP_URI.inspecting,
        disposition: CBV_DISPOSITION_URI.active,
        standard: true,
      };
    case "recall":
      return {
        bizStep: CBV_BIZSTEP_URI.inspecting,
        disposition: CBV_DISPOSITION_URI.recalled,
        standard: true,
      };
    default: {
      // Exhaustiveness guard — a new ServiceEventType added to the
      // union without a mapping here is a compile error on this line.
      const _exhaustive: never = type;
      void _exhaustive;
      return {
        bizStep: CBV_BIZSTEP_URI.inspecting,
        disposition: CBV_DISPOSITION_URI.active,
        standard: true,
      };
    }
  }
}

/**
 * Disposition for an `OwnershipTransfer`. Ownership changes become
 * ObjectEvents; "returned" maps to the CBV `returned` disposition,
 * everything else (sale, resale, donation) is a plain ownership
 * change with the object still `active`.
 */
export function mapOwnershipReasonDisposition(reason: string): string {
  if (reason === "return") return CBV_DISPOSITION_URI.returned;
  if (reason === "recycling") return CBV_DISPOSITION_URI.in_progress;
  return CBV_DISPOSITION_URI.active;
}
