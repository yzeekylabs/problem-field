import { describe, expect, it } from "vitest";

import { formatCriterionBulk, parseCriterionBulk, reconcileCriterionBulk } from "./criterion-bulk.ts";

describe("bulk decision criteria", () => {
  it("accepts bullets, numbered lists, checkboxes, and wrapped lines", () => {
    expect(parseCriterionBulk("Continue if:\n- [ ] Workarounds recur\n  across teams\n2. Buyers commit time\n• Consequences are material")).toEqual([
      "Workarounds recur across teams",
      "Buyers commit time",
      "Consequences are material",
    ]);
  });

  it("treats plain non-empty lines as separate criteria", () => {
    expect(parseCriterionBulk("One observable condition\n\nAnother condition")).toEqual([
      "One observable condition",
      "Another condition",
    ]);
  });

  it("preserves IDs for unchanged criteria when lines are reordered or inserted", () => {
    let generated = 0;
    const result = reconcileCriterionBulk(
      "• A new condition\n• The second condition\n• The first condition",
      [
        { id: "first", statement: "The first condition" },
        { id: "second", statement: "The second condition" },
      ],
      () => `new-${++generated}`,
    );

    expect(result).toEqual([
      { id: "new-1", statement: "A new condition" },
      { id: "second", statement: "The second condition" },
      { id: "first", statement: "The first condition" },
    ]);
  });

  it("formats existing criteria as a pasteable bulk list", () => {
    expect(formatCriterionBulk([
      { id: "one", statement: "First condition" },
      { id: "two", statement: "Second\ncondition" },
    ])).toBe("• First condition\n• Second condition");
  });
});
