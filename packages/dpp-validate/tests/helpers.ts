import { expect } from "vitest";
import { CONDITIONAL_RULES } from "../src/rules.js";
import type { ConditionalRule } from "../src/rules.js";

/**
 * Find a registered conditional rule, failing the test when it is not registered.
 * @param category - the template category the rule is registered under
 * @param id - the rule id, such as `"BAT-1"`
 * @returns the rule
 */
export function ruleById(category: string, id: string): ConditionalRule {
  const rules: Readonly<Record<string, ConditionalRule[] | undefined>> = CONDITIONAL_RULES;
  return (
    rules[category]?.find((r) => r.id === id) ??
    expect.unreachable(`rule ${id} is not registered for ${category}`)
  );
}
