import { describe, it, expect } from "vitest";
import { checkPublishReady } from "../src/index.js";
import type { Passport, Template } from "@tracepass/dpp-types";

// Minimal shapes cast to the real types, as in the other tests.
const passport = (status: Passport["status"]) => ({ status, fields: {} }) as unknown as Passport;
const template = { category: "textile", fields: [] } as unknown as Template;

describe("checkPublishReady status rules", () => {
  it("refuses a suspended passport by default (bulk publish)", () => {
    const r = checkPublishReady(passport("suspended"), template);
    expect(r.ready).toBe(false);
    expect(r.blockerType).toBe("hard");
  });

  it("allows a suspended passport with republish (suspend is reversible)", () => {
    expect(checkPublishReady(passport("suspended"), template, {}, { republish: true }).ready).toBe(true);
  });

  it("refuses archived and expired even with republish (archive is one-way)", () => {
    for (const status of ["archived", "expired"] as const) {
      expect(checkPublishReady(passport(status), template, {}, { republish: true }).ready, status).toBe(false);
    }
  });

  it("publishes a draft with nothing required", () => {
    expect(checkPublishReady(passport("draft"), template).ready).toBe(true);
  });
});
