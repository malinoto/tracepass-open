/**
 * EPC and location identifier construction for EPCIS events.
 *
 * EPCIS events identify objects ("what") and places ("where") with
 * URIs. TracePass already mints GS1 Digital Link URIs for products
 * and validates GLNs for parties — this module turns those into the
 * identifier forms EPCIS events expect.
 *
 * Identifier choices (per EPCIS 2.0, which accepts both URN and
 * Digital Link / constrained-URI forms):
 *   - Object identity ("what") — we emit the GS1 Digital Link URI
 *     for the product. EPCIS 2.0 explicitly supports Digital Link
 *     URIs as EPCs, and it keeps the EPCIS document consistent with
 *     the identifier already printed on the passport's QR.
 *   - Location identity ("where") — we emit the GS1 SGLN-style
 *     Digital Link URI `https://id.gs1.org/414/<gln>` for a party's
 *     GLN. `414` is the GS1 Application Identifier for a physical
 *     location / party.
 *
 * Pure — no IO. Unit-tested in tests/epcis/identifiers.test.ts.
 */

import { validateGln } from "@tracepass/gs1-utils";

/**
 * GS1 canonical resolver host. Location URIs are minted against
 * `id.gs1.org` (not our resolver) because a GLN is globally owned by
 * the party, not by TracePass — an EPCIS consumer resolving the
 * location should reach GS1's canonical resolver, not ours.
 */
const GS1_CANONICAL_HOST = "https://id.gs1.org";

/** GS1 Application Identifier for a location / party (GLN). */
const AI_LOCATION = "414";

/**
 * Build the EPC URI ("what") for a passport. We use the passport's
 * already-minted Digital Link URI verbatim — it is the stable object
 * identifier the rest of the platform (schema.org JSON-LD, tenant
 * export, QR) also uses, so the EPCIS document agrees with them.
 *
 * Returns null when the passport has no Digital Link URI (should not
 * happen for a published passport, but the builder must not throw).
 */
export function passportEpc(digitalLinkUri: string | undefined | null): string | null {
  if (typeof digitalLinkUri !== "string" || digitalLinkUri.length === 0) {
    return null;
  }
  return digitalLinkUri;
}

/**
 * Build a location URI ("where") from a 13-digit GLN. Returns the
 * GS1-canonical `id.gs1.org/414/<gln>` Digital Link form.
 *
 * Returns null when the GLN is absent or fails the mod-10 check —
 * an invalid GLN must not produce a malformed location URI. The
 * caller omits the readPoint/bizLocation rather than emitting a
 * broken one.
 */
export function locationUri(gln: string | undefined | null): string | null {
  if (typeof gln !== "string") return null;
  if (!validateGln(gln)) return null;
  return `${GS1_CANONICAL_HOST}/${AI_LOCATION}/${gln}`;
}

/**
 * Build the `id` object EPCIS uses for a readPoint / bizLocation:
 * `{ id: "<uri>" }`. Returns null when the GLN is missing or invalid
 * so the event builder can cleanly omit the key.
 */
export function locationRef(
  gln: string | undefined | null,
): { id: string } | null {
  const uri = locationUri(gln);
  return uri ? { id: uri } : null;
}

/**
 * Build an EPCIS `eventID` URI for one of our exported events. EPCIS
 * 2.0 events carry an optional stable `eventID`; making it stable and
 * deterministic means re-exporting the same passport produces the
 * same event IDs (idempotent consumers can dedupe).
 *
 * Shape: a TracePass URN namespacing the passport id + an event-local
 * discriminator (the source collection + its row id, or a synthetic
 * index for inline supplyChainEvents which have no own id).
 */
export function buildEventId(
  passportId: string,
  discriminator: string,
): string {
  const safe = discriminator.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `urn:tracepass:epcis:${passportId}:${safe}`;
}
