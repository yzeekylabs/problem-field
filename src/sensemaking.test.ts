import { describe, expect, it } from "vitest";

import { getNextMove, getPatternSignal } from "./sensemaking.ts";
import type { Workspace } from "./shared/workspace.ts";

const now = "2026-07-14T04:00:00.000Z";

function field(): Workspace {
  return {
    schemaVersion: 3,
    revision: 0,
    updatedAt: now,
    project: {
      name: "Signal test",
      question: "What deserves focus?",
      status: "exploring",
      activeStage: "test",
      onboardingComplete: true,
    },
    sources: [
      { id: "s1", title: "Call one", kind: "transcript", importedAt: now },
      { id: "s2", title: "Call two", kind: "transcript", importedAt: now },
    ],
    cards: [
      { id: "e1", kind: "evidence", title: "E1", body: "", position: { x: 0, y: 0 }, sourceRef: { sourceId: "s1" }, createdBy: "human", createdAt: now, updatedAt: now },
      { id: "e2", kind: "evidence", title: "E2", body: "", position: { x: 0, y: 0 }, sourceRef: { sourceId: "s2" }, createdBy: "human", createdAt: now, updatedAt: now },
      { id: "o1", kind: "observation", title: "O1", body: "", position: { x: 0, y: 0 }, createdBy: "human", createdAt: now, updatedAt: now },
      { id: "p1", kind: "pattern", title: "P1", body: "", position: { x: 0, y: 0 }, createdBy: "human", createdAt: now, updatedAt: now },
    ],
    connections: [
      { id: "c1", from: "e1", to: "o1", kind: "supports" },
      { id: "c2", from: "e2", to: "p1", kind: "contradicts" },
      { id: "c3", from: "o1", to: "p1", kind: "supports" },
    ],
    agentRequests: [],
    agentProposals: [],
  };
}

describe("sensemaking guidance", () => {
  it("derives signal through upstream evidence without inventing a percentage", () => {
    expect(getPatternSignal(field(), "p1")).toEqual({
      evidenceCount: 2,
      sourceCount: 2,
      contradictionCount: 1,
      status: "contested",
    });
  });

  it("turns an unchallenged field into a counter-evidence move", () => {
    const workspace = field();
    workspace.connections = workspace.connections.filter((connection) => connection.kind !== "contradicts");
    expect(getNextMove(workspace)).toMatchObject({ stage: "test", action: "ask-agent" });
  });
});
