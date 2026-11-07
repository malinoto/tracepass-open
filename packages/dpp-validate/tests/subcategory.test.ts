import { describe, it, expect } from "vitest";
import { passportSubcategory } from "../src/vendor/subcategory.js";

describe("passportSubcategory", () => {
  it("reads the sub-category value from the field the template category names", () => {
    expect(passportSubcategory("battery", { batteryCategory: { value: "EV" } })).toBe("EV");
    expect(passportSubcategory("detergents", { detergentUserType: { value: "consumer" } })).toBe(
      "consumer",
    );
  });

  it("returns undefined for a category without a sub-category field or without fields", () => {
    expect(passportSubcategory("toys", { batteryCategory: { value: "EV" } })).toBeUndefined();
    expect(passportSubcategory(undefined, { batteryCategory: { value: "EV" } })).toBeUndefined();
    expect(passportSubcategory("battery", undefined)).toBeUndefined();
    expect(passportSubcategory("battery", {})).toBeUndefined();
  });

  it("treats null, undefined and the empty string as unset", () => {
    expect(passportSubcategory("battery", { batteryCategory: { value: null } })).toBeUndefined();
    expect(passportSubcategory("battery", { batteryCategory: {} })).toBeUndefined();
    expect(passportSubcategory("battery", { batteryCategory: { value: "" } })).toBeUndefined();
  });

  it("writes a number or boolean value as text", () => {
    expect(passportSubcategory("fmcg", { productSubcategory: { value: 5 } })).toBe("5");
    expect(passportSubcategory("fmcg", { productSubcategory: { value: false } })).toBe("false");
  });

  it("does not turn an object value into the text [object Object]", () => {
    expect(
      passportSubcategory("battery", { batteryCategory: { value: { a: 1 } } }),
    ).toBeUndefined();
  });
});
