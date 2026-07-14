import { describe, expect, it } from "vitest";

import {
  applyOperationSet,
  DomainError,
  type Workspace,
} from "./workspace.ts";

const now = "2026-07-14T04:00:00.000Z";

function workspace(): Workspace {
  return {
    schemaVersion: 1,
    revision: 2,
    updatedAt: now,
    project: { name: "Test", question: "What is happening?", status: "exploring" },
    sources: [],
    cards: [
      {
        id: "a",
        kind: "observation",
        title: "A",
        body: "",
        position: { x: 0, y: 0 },
        createdBy: "human",
        createdAt: now,
        updatedAt: now,
      },
    ],
    connections: [],
    agentRequests: [],
  };
}

describe("applyOperationSet", () => {
  it("applies a valid card and connection transaction", () => {
    const result = applyOperationSet(
      workspace(),
      {
        baseRevision: 2,
        actor: "agent",
        operations: [
          {
            type: "addCard",
            card: {
              id: "b",
              kind: "pattern",
              title: "B",
              body: "Pattern",
              position: { x: 100, y: 100 },
              createdBy: "agent",
            },
          },
          {
            type: "addConnection",
            connection: { id: "a-b", from: "a", to: "b", kind: "supports" },
          },
        ],
      },
      "2026-07-14T05:00:00.000Z",
    );

    expect(result.revision).toBe(3);
    expect(result.cards).toHaveLength(2);
    expect(result.connections).toHaveLength(1);
  });

  it("rejects a connection to a missing card without mutating the input", () => {
    const original = workspace();
    expect(() =>
      applyOperationSet(original, {
        baseRevision: 2,
        actor: "agent",
        operations: [
          {
            type: "addConnection",
            connection: { id: "bad", from: "a", to: "missing", kind: "relates" },
          },
        ],
      }),
    ).toThrow(DomainError);
    expect(original.connections).toHaveLength(0);
  });

  it("removes dependent connections when a card is deleted", () => {
    const withConnection = applyOperationSet(workspace(), {
      baseRevision: 2,
      actor: "human",
      operations: [
        {
          type: "addCard",
          card: {
            id: "b",
            kind: "question",
            title: "B",
            body: "",
            position: { x: 0, y: 0 },
            createdBy: "human",
          },
        },
        {
          type: "addConnection",
          connection: { id: "a-b", from: "a", to: "b", kind: "raises" },
        },
      ],
    });

    const result = applyOperationSet(withConnection, {
      baseRevision: 3,
      actor: "human",
      operations: [{ type: "deleteCard", cardId: "b" }],
    });
    expect(result.cards.map((card) => card.id)).toEqual(["a"]);
    expect(result.connections).toEqual([]);
  });

  it("keeps evidence provenance valid across source and card operations", () => {
    const result = applyOperationSet(workspace(), {
      baseRevision: 2,
      actor: "human",
      operations: [
        {
          type: "addSource",
          source: {
            id: "source-call",
            title: "Customer call",
            kind: "transcript",
            importedAt: now,
          },
        },
        {
          type: "updateCard",
          cardId: "a",
          patch: {
            sourceRef: {
              sourceId: "source-call",
              locator: "12:40",
              quote: "I keep losing the thread.",
            },
          },
        },
      ],
    });

    expect(result.cards[0].sourceRef?.sourceId).toBe("source-call");
    expect(result.sources).toHaveLength(1);
  });
});
