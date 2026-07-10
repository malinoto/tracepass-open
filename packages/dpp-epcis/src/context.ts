/**
 * EPCIS 2.0 JSON-LD @context for TracePass-emitted EPCIS documents.
 *
 * An EPCIS 2.0 document is JSON-LD — the same linked-data family as the
 * schema.org JSON-LD the public passport viewer already emits. The
 * @context tells a consumer which vocabularies the document's terms
 * come from.
 *
 * Four vocabularies compose here:
 *   1. The GS1-published EPCIS 2.0 context — the canonical source of
 *      `EPCISDocument`, `ObjectEvent`, `eventTime`, `bizStep`, etc.
 *      GS1 hosts this at a stable URL; consumers dereference it.
 *   2. The GS1 CBV terms — Core Business Vocabulary (bizSteps,
 *      dispositions). Carried inside the EPCIS context for 2.0.
 *   3. `cbv:` alias — so CBV-standard bizStep/disposition values that
 *      DO exist in the standard vocabulary are written with the
 *      official `cbv:` prefix.
 *   4. `tracepass:` alias — for the terms that are genuinely ours:
 *      the custom bizStep URIs we coin for production steps absent
 *      from CBV (smelting, rolling, …), and any TracePass-specific
 *      annotation we attach to an event.
 *
 * Design call (per the 2026-05-22 EPCIS review, decision [Q2]):
 * production steps that CBV's fixed bizStep list doesn't cover get
 * TracePass-owned vocabulary URIs under `https://tracepass.eu/cbv/`.
 * This is the GS1-sanctioned industry-extension pattern — a valid
 * EPCIS document MAY use bizStep values outside the standard CBV as
 * long as they are URIs. The `tracepass:` alias keeps those URIs
 * compact in the serialized JSON.
 */

/**
 * The GS1-hosted EPCIS 2.0 JSON-LD context URL. Stable, published by
 * GS1. Consumers dereference it to resolve EPCIS + CBV core terms.
 */
export const EPCIS_CONTEXT_URL =
  "https://ref.gs1.org/standards/epcis/2.0.0/epcis-context.jsonld";

/**
 * Base URI for the TracePass-owned vocabulary. The CBV bizStep
 * extension URIs (`.../cbv/bizstep/smelting`) and any other
 * TracePass-namespaced EPCIS term hang off this. Published as a
 * resolvable JSON-LD vocabulary document — see `cbv.ts` for the
 * term list and `docs`/the vocabulary route for the published doc.
 */
export const TRACEPASS_VOC_BASE = "https://tracepass.eu/voc/";

/**
 * The `@context` value placed on every EPCIS document TracePass
 * emits. Array form: the GS1 EPCIS 2.0 context URL first (so its
 * term definitions take precedence), then a local object defining
 * the `tracepass:` alias.
 *
 * The `cbv:` prefix is already defined inside the GS1 EPCIS context,
 * so it is NOT redeclared here — redeclaring it would risk shadowing
 * the official definition.
 */
export const EPCIS_JSONLD_CONTEXT: ReadonlyArray<string | Record<string, string>> = [
  EPCIS_CONTEXT_URL,
  { tracepass: TRACEPASS_VOC_BASE },
] as const;
