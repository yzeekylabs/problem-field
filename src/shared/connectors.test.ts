import { describe, expect, it } from "vitest";

import { connectorCatalog } from "./connectors.ts";

describe("connector catalog", () => {
  it("keeps connector IDs unique and only features universal HTTPS endpoints", () => {
    expect(new Set(connectorCatalog.map((connector) => connector.id)).size).toBe(connectorCatalog.length);
    for (const connector of connectorCatalog) {
      if (connector.availability === "featured") {
        expect(connector.endpoint).toMatch(/^https:\/\//);
        expect(connector.constraint).toBeUndefined();
      } else {
        expect(connector.endpoint).toBeUndefined();
        expect(connector.constraint).toBeTruthy();
      }
    }
  });
});
