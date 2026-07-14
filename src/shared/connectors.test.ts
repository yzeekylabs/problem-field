import { describe, expect, it } from "vitest";

import { connectorCatalog } from "./connectors.ts";

describe("connector catalog", () => {
  it("contains only unique, one-click HTTPS connectors", () => {
    expect(new Set(connectorCatalog.map((connector) => connector.id)).size).toBe(connectorCatalog.length);
    for (const connector of connectorCatalog) {
      expect(connector.endpoint).toMatch(/^https:\/\//);
    }
    expect(connectorCatalog.map((connector) => connector.id)).toEqual(["linear", "notion", "figma", "granola"]);
  });
});
