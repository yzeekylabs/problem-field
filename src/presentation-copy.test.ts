import { describe, expect, it } from "vitest";

import { compactAtWord, getCardDisplayCopy, getProjectDisplayCopy } from "./presentation-copy.ts";

describe("presentation copy", () => {
  it("uses authored display copy without changing the long-form content", () => {
    const card = {
      title: "A deliberately long canonical title that remains available in the inspector",
      body: "A long evidence account with provenance and qualifiers that should remain intact.",
      display: { title: "A concise title", summary: "A concise visual summary." },
    };

    expect(getCardDisplayCopy(card)).toEqual(card.display);
    expect(card.body).toContain("provenance and qualifiers");
  });

  it("falls back at a word boundary and excludes later exact-quote paragraphs", () => {
    const copy = getCardDisplayCopy({
      title: "A very long title about designers repeatedly losing important decisions during iteration",
      body: "Designers lose previous directions while iterating.\n\nExact quote: this should stay in the inspector.",
    });

    expect(copy.title.length).toBeLessThanOrEqual(60);
    expect(copy.title.endsWith("…")).toBe(true);
    expect(copy.summary).toBe("Designers lose previous directions while iterating.");
  });

  it("provides a bounded project fallback", () => {
    const copy = getProjectDisplayCopy({
      name: "Field",
      question: "What should we focus on when product execution is cheap but the evidence remains fragmented across many tools and conversations?",
    });

    expect(copy.summary.length).toBeLessThanOrEqual(120);
  });

  it("never breaks a normal label mid-word", () => {
    expect(compactAtWord("comparison history and alternative exploration", 25)).toBe("comparison history and…");
  });
});
