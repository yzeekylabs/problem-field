import { describe, expect, it } from "vitest";

import { getDecisionReadout, getNextMove, getPatternSignal } from "./sensemaking.ts";
import type { Workspace } from "./shared/workspace.ts";

const now = "2026-07-14T04:00:00.000Z";

function field(): Workspace {
  return {
    schemaVersion: 5,
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
    decisionFrames: [],
    criterionLinks: [],
    agentRequests: [],
    agentProposals: [],
  };
}

function withDecisionFrame(workspace = field()): Workspace {
  workspace.decisionFrames = [{
    id: "frame-1",
    decision: "Should we invest in a deeper product exploration?",
    hypothesis: "Teams lose fidelity when moving research between chat and canvas.",
    criteria: [
      { id: "continue-1", polarity: "continue", statement: "Recent workarounds recur across independent teams." },
      { id: "reconsider-1", polarity: "reconsider", statement: "The friction is explained by revision history rather than synthesis." },
    ],
    version: 1,
    createdBy: "human",
    createdAt: now,
  }];
  return workspace;
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
    const workspace = withDecisionFrame();
    workspace.connections = workspace.connections.filter((connection) => connection.kind !== "contradicts");
    workspace.criterionLinks = [
      { cardId: "e1", criterionId: "continue-1", stance: "supports", createdBy: "human", updatedAt: now },
      { cardId: "e2", criterionId: "reconsider-1", stance: "challenges", createdBy: "human", updatedAt: now },
    ];
    expect(getNextMove(workspace)).toMatchObject({ stage: "test", action: "ask-agent" });
  });

  it("keeps direction unframed until a human agrees the evidence bar", () => {
    expect(getDecisionReadout(field())).toMatchObject({
      status: "unframed",
      label: "Set evidence bar",
      basisLabel: "Not framed",
    });
    expect(getNextMove(field())).toMatchObject({ action: "edit-frame", stage: "orient" });
  });

  it("derives a cautious direction from accepted, source-linked criterion evidence", () => {
    const workspace = withDecisionFrame();
    workspace.criterionLinks = [
      { cardId: "e1", criterionId: "continue-1", stance: "supports", createdBy: "human", updatedAt: now },
      { cardId: "e2", criterionId: "reconsider-1", stance: "challenges", createdBy: "human", updatedAt: now },
    ];

    expect(getDecisionReadout(workspace)).toMatchObject({
      status: "leaning_continue",
      label: "Leaning continue",
      basis: "developing",
      sourceCount: 2,
    });
  });

  it("does not call a direction when accepted links have no inspectable source chain", () => {
    const workspace = withDecisionFrame();
    workspace.criterionLinks = [
      { cardId: "o1", criterionId: "continue-1", stance: "supports", createdBy: "human", updatedAt: now },
      { cardId: "p1", criterionId: "reconsider-1", stance: "challenges", createdBy: "human", updatedAt: now },
    ];
    workspace.connections = [];

    expect(getDecisionReadout(workspace)).toMatchObject({
      status: "too_early",
      basis: "limited",
      sourceCount: 0,
    });
  });

  it("limits the confidence basis when a linked source needs transcript review", () => {
    const workspace = withDecisionFrame();
    workspace.sources[0].researchQuality = {
      transcriptFidelity: "needs_review",
      sessionEvidence: "behavior_rich",
      updatedBy: "human",
      updatedAt: now,
    };
    workspace.criterionLinks = [
      { cardId: "e1", criterionId: "continue-1", stance: "supports", createdBy: "human", updatedAt: now },
      { cardId: "e2", criterionId: "reconsider-1", stance: "challenges", createdBy: "human", updatedAt: now },
    ];

    expect(getDecisionReadout(workspace)).toMatchObject({ basis: "limited" });
  });

  it("calls a basis considered only after conversation quality and reconsider conditions are reviewed", () => {
    const workspace = withDecisionFrame();
    workspace.sources = workspace.sources.map((source) => ({
      ...source,
      researchQuality: {
        transcriptFidelity: "spot_checked",
        sessionEvidence: "behavior_rich",
        updatedBy: "human" as const,
        updatedAt: now,
      },
    }));
    workspace.criterionLinks = [
      { cardId: "e1", criterionId: "continue-1", stance: "supports", createdBy: "human", updatedAt: now },
      { cardId: "e2", criterionId: "reconsider-1", stance: "challenges", createdBy: "human", updatedAt: now },
    ];

    expect(getDecisionReadout(workspace)).toMatchObject({
      status: "leaning_continue",
      basis: "considered",
    });
  });
});
