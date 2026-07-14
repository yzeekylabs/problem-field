import { describe, expect, it } from "vitest";

import {
  applyOperationSet,
  DomainError,
  parseWorkspace,
  type Workspace,
} from "./workspace.ts";

const now = "2026-07-14T04:00:00.000Z";

function workspace(): Workspace {
  return {
    schemaVersion: 3,
    revision: 2,
    updatedAt: now,
    project: {
      name: "Test",
      question: "What is happening?",
      status: "exploring",
      activeStage: "forage",
      onboardingComplete: true,
    },
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
    agentProposals: [],
  };
}

describe("applyOperationSet", () => {
  it("migrates an existing field into the guided model without replaying onboarding", () => {
    const legacy = structuredClone(workspace()) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    delete (legacy as { agentProposals?: unknown }).agentProposals;
    const legacyProject = legacy.project as Record<string, unknown>;
    delete legacyProject.activeStage;
    delete legacyProject.onboardingComplete;

    const migrated = parseWorkspace(legacy);

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.project.activeStage).toBe("forage");
    expect(migrated.project.onboardingComplete).toBe(true);
    expect(migrated.agentProposals).toEqual([]);
  });

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

  it("keeps agent interpretations provisional until a human accepts them", () => {
    const proposed = applyOperationSet(workspace(), {
      baseRevision: 2,
      actor: "agent",
      operations: [
        {
          type: "addAgentProposal",
          proposal: {
            id: "proposal-1",
            kind: "pattern",
            title: "A possible pattern",
            rationale: "The observation may point to a broader pattern.",
            scopeCardIds: ["a"],
            proposedCard: {
              id: "pattern-1",
              kind: "pattern",
              title: "A possible pattern",
              body: "A grounded interpretation for review.",
              position: { x: 200, y: 100 },
              createdBy: "agent",
            },
            proposedConnections: [
              {
                id: "connection-a-pattern",
                from: "a",
                to: "pattern-1",
                kind: "supports",
              },
            ],
          },
        },
      ],
    });

    expect(proposed.cards).toHaveLength(1);
    expect(proposed.agentProposals[0].status).toBe("pending");

    const accepted = applyOperationSet(proposed, {
      baseRevision: 3,
      actor: "human",
      operations: [
        { type: "reviewAgentProposal", proposalId: "proposal-1", decision: "accepted" },
      ],
    });

    expect(accepted.cards.map((card) => card.id)).toContain("pattern-1");
    expect(accepted.agentProposals[0].status).toBe("accepted");
  });

  it("tracks extraction separately from the immutable source asset", () => {
    const withSource = applyOperationSet(workspace(), {
      baseRevision: 2,
      actor: "human",
      operations: [
        {
          type: "addSource",
          source: {
            id: "source-image",
            title: "Whiteboard photo",
            kind: "image",
            asset: {
              fileName: "source-image.png",
              originalName: "whiteboard.png",
              mimeType: "image/png",
              bytes: 1200,
            },
            extraction: { status: "queued" },
            importedAt: now,
          },
        },
      ],
    });

    const extracted = applyOperationSet(withSource, {
      baseRevision: 3,
      actor: "agent",
      operations: [
        {
          type: "updateSource",
          sourceId: "source-image",
          patch: {
            summary: "Three clusters are visible; two labels are unreadable.",
            extraction: { status: "ready", method: "agent-vision", updatedAt: now },
          },
        },
      ],
    });

    expect(extracted.sources[0].asset?.originalName).toBe("whiteboard.png");
    expect(extracted.sources[0].extraction?.status).toBe("ready");
  });

  it("claims and finishes an agent request with one run owner", () => {
    const queued = applyOperationSet(workspace(), {
      baseRevision: 2,
      actor: "human",
      operations: [{
        type: "addAgentRequest",
        request: { id: "request-1", prompt: "Forage the sources", scopeCardIds: [] },
      }],
    });
    expect(queued.agentRequests[0].status).toBe("queued");

    const running = applyOperationSet(queued, {
      baseRevision: 3,
      actor: "system",
      operations: [{
        type: "startAgentRequest",
        requestId: "request-1",
        runId: "run-1",
        provider: "codex",
      }],
    });
    expect(running.agentRequests[0]).toMatchObject({ status: "running", runId: "run-1", provider: "codex" });
    expect(() => applyOperationSet(running, {
      baseRevision: 4,
      actor: "agent",
      operations: [{
        type: "resolveAgentRequest",
        requestId: "request-1",
        response: "Tried to bypass the runner.",
      }],
    })).toThrow(DomainError);
    expect(() => applyOperationSet(running, {
      baseRevision: 4,
      actor: "system",
      operations: [{
        type: "finishAgentRequest",
        requestId: "request-1",
        runId: "another-run",
        outcome: "completed",
      }],
    })).toThrow(DomainError);

    const completed = applyOperationSet(running, {
      baseRevision: 4,
      actor: "system",
      operations: [{
        type: "finishAgentRequest",
        requestId: "request-1",
        runId: "run-1",
        outcome: "completed",
        response: "Added grounded evidence.",
      }],
    });
    expect(completed.agentRequests[0]).toMatchObject({ status: "completed", response: "Added grounded evidence." });
  });

  it("migrates legacy open and resolved request states", () => {
    const legacy = structuredClone(workspace()) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 2;
    legacy.agentRequests = [
      { id: "open", prompt: "One", scopeCardIds: [], status: "open", createdAt: now },
      { id: "done", prompt: "Two", scopeCardIds: [], status: "resolved", response: "Done", createdAt: now, resolvedAt: now },
    ];
    const migrated = parseWorkspace(legacy);
    expect(migrated.agentRequests.map((request) => request.status)).toEqual(["queued", "completed"]);
    expect(migrated.agentRequests[1].finishedAt).toBe(now);
  });

  it("preserves connector provenance on a canonical source snapshot", () => {
    const result = applyOperationSet(workspace(), {
      baseRevision: 2,
      actor: "agent",
      operations: [{
        type: "addSource",
        source: {
          id: "source-linear",
          title: "Customer request",
          kind: "document",
          summary: "A snapshot retrieved from Linear.",
          externalRef: {
            connectorId: "linear",
            resourceId: "ENG-42",
            url: "https://linear.app/example/issue/ENG-42",
            retrievedAt: now,
          },
          importedAt: now,
        },
      }],
    });
    expect(result.sources[0].externalRef?.resourceId).toBe("ENG-42");
  });
});
