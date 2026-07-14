import type { FieldStage, Workspace } from "./shared/workspace.ts";

export const fieldStages: Array<{
  id: FieldStage;
  label: string;
  verb: string;
  description: string;
}> = [
  { id: "orient", label: "Orient", verb: "Name the focus", description: "State what you need to understand and why it matters now." },
  { id: "forage", label: "Forage", verb: "Gather evidence", description: "Bring in material and preserve exact excerpts with provenance." },
  { id: "cluster", label: "Cluster", verb: "Notice recurrence", description: "Arrange related evidence without forcing a conclusion too early." },
  { id: "frame", label: "Frame", verb: "Form interpretations", description: "Name possible patterns and the observations that support them." },
  { id: "test", label: "Test", verb: "Challenge the signal", description: "Seek alternatives, contradictions, segment differences, and missing context." },
  { id: "decide", label: "Decide", verb: "Choose the next inquiry", description: "Continue, narrow, challenge, pivot, or archive—then make the next question explicit." },
];

export type PatternSignal = {
  evidenceCount: number;
  sourceCount: number;
  contradictionCount: number;
  status: "seed" | "emerging" | "grounded" | "contested";
};

export function getPatternSignal(workspace: Workspace, patternId: string): PatternSignal {
  const visited = new Set<string>();
  const evidenceIds = new Set<string>();
  const sourceIds = new Set<string>();
  let contradictionCount = 0;

  function walk(cardId: string) {
    if (visited.has(cardId)) return;
    visited.add(cardId);
    for (const connection of workspace.connections.filter((item) => item.to === cardId)) {
      if (connection.kind === "contradicts") contradictionCount += 1;
      if (connection.kind !== "supports" && connection.kind !== "contradicts") continue;
      const upstream = workspace.cards.find((card) => card.id === connection.from);
      if (!upstream) continue;
      if (upstream.kind === "evidence") {
        evidenceIds.add(upstream.id);
        if (upstream.sourceRef) sourceIds.add(upstream.sourceRef.sourceId);
      } else {
        walk(upstream.id);
      }
    }
  }

  walk(patternId);
  const status =
    contradictionCount > 0
      ? "contested"
      : sourceIds.size >= 3 && evidenceIds.size >= 4
        ? "grounded"
        : sourceIds.size >= 2
          ? "emerging"
          : "seed";

  return {
    evidenceCount: evidenceIds.size,
    sourceCount: sourceIds.size,
    contradictionCount,
    status,
  };
}

export type NextMove = {
  stage: FieldStage;
  title: string;
  detail: string;
  actionLabel: string;
  action: "add-source" | "add-evidence" | "ask-agent" | "review-proposals" | "change-stage";
  prompt?: string;
};

export function getNextMove(workspace: Workspace): NextMove {
  const activeRequests = workspace.agentRequests.filter((item) => item.status === "queued" || item.status === "running");
  if (activeRequests.length > 0) {
    const running = activeRequests.some((item) => item.status === "running");
    return {
      stage: workspace.project.activeStage,
      title: running ? "The agent is working in the field" : "The next agent pass is queued",
      detail: "Progress and any failure stay visible. Evidence writes through the same revision-checked field protocol.",
      actionLabel: "View progress",
      action: "review-proposals",
    };
  }

  const pendingProposals = workspace.agentProposals.filter((item) => item.status === "pending");
  if (pendingProposals.length > 0) {
    return {
      stage: "frame",
      title: "Review, don’t inherit",
      detail: `${pendingProposals.length} agent ${pendingProposals.length === 1 ? "interpretation is" : "interpretations are"} waiting outside the canonical field.`,
      actionLabel: "Review",
      action: "review-proposals",
    };
  }

  if (workspace.sources.length === 0) {
    return {
      stage: "forage",
      title: "Start with something that happened",
      detail: "Bring in a call, note, screenshot, or recording before forming an interpretation.",
      actionLabel: "Add source",
      action: "add-source",
    };
  }

  const evidence = workspace.cards.filter((card) => card.kind === "evidence");
  if (evidence.length === 0) {
    return {
      stage: "forage",
      title: "Pull out the first inspectable moment",
      detail: "Your sources are in the library. Place one exact quote, behavior, or observable fact on the field.",
      actionLabel: "Add evidence",
      action: "add-evidence",
    };
  }

  const unlinkedEvidence = workspace.cards.filter(
    (card) => card.kind === "evidence" && !card.sourceRef,
  );
  if (unlinkedEvidence.length > 0) {
    return {
      stage: "forage",
      title: "Restore the evidence chain",
      detail: `${unlinkedEvidence.length} evidence ${unlinkedEvidence.length === 1 ? "card has" : "cards have"} no inspectable source.`,
      actionLabel: "Find gaps",
      action: "ask-agent",
      prompt: "Find evidence cards without inspectable provenance. Suggest the smallest steps to reconnect them to sources; do not infer missing quotes.",
    };
  }

  if (workspace.sources.length < 2) {
    return {
      stage: "forage",
      title: "Broaden before you trust recurrence",
      detail: "The current field comes from one source. Add a different conversation or artifact before treating repetition as signal.",
      actionLabel: "Add another source",
      action: "add-source",
    };
  }

  const patterns = workspace.cards.filter((card) => card.kind === "pattern");
  if (patterns.length === 0) {
    return {
      stage: "cluster",
      title: "Look for a shape, not an answer",
      detail: "Ask for tentative groups across sources. They will stay provisional until you review them.",
      actionLabel: "Propose clusters",
      action: "ask-agent",
      prompt: "Propose a small number of tentative patterns across the evidence. For each, cite the supporting card IDs, note what does not fit, and add it as an agent proposal—not a canonical card.",
    };
  }

  const unchallenged = patterns.filter(
    (pattern) => getPatternSignal(workspace, pattern.id).contradictionCount === 0,
  );
  if (unchallenged.length > 0) {
    return {
      stage: "test",
      title: "Try to break the strongest frame",
      detail: `${unchallenged.length} ${unchallenged.length === 1 ? "pattern has" : "patterns have"} no contradictory evidence attached.`,
      actionLabel: "Seek counter-evidence",
      action: "ask-agent",
      prompt: "Challenge the current patterns. Find contrary evidence, plausible alternative explanations, segment differences, and missing source types. Cite card and source IDs; preserve uncertainty.",
    };
  }

  return {
    stage: "decide",
    title: "Turn this field into the next inquiry",
    detail: "Choose what to continue, narrow, challenge, pivot away from, or archive—and name what evidence would change your mind.",
    actionLabel: "Move to decide",
    action: "change-stage",
  };
}
