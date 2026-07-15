import { getActiveDecisionFrame } from "./shared/workspace.ts";
import type { DecisionCriterion, FieldCard, FieldStage, Workspace } from "./shared/workspace.ts";

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
  attributionPendingCount: number;
  researchContextCount: number;
  status: "unreviewed" | "seed" | "emerging" | "grounded" | "contested";
};

export type CriterionRead = {
  criterion: DecisionCriterion;
  status: "untested" | "supported" | "challenged" | "mixed";
  supportCount: number;
  challengeCount: number;
  sourceCount: number;
  linkCount: number;
  unqualifiedLinkCount: number;
  attributionPendingCount: number;
  researchContextCount: number;
};

export type DecisionReadout = {
  status: "unframed" | "too_early" | "mixed" | "leaning_continue" | "leaning_reconsider";
  label: string;
  basis: "limited" | "developing" | "considered";
  basisLabel: string;
  summary: string;
  sourceCount: number;
  attributionPendingCount: number;
  researchContextCount: number;
  criterionReads: CriterionRead[];
};

function evidenceCardsForCard(workspace: Workspace, cardId: string, visited = new Set<string>()): FieldCard[] {
  if (visited.has(cardId)) return [];
  visited.add(cardId);
  const card = workspace.cards.find((item) => item.id === cardId);
  if (!card) return [];
  if (card.kind === "evidence") return [card];

  const evidenceCards: FieldCard[] = [];
  for (const connection of workspace.connections.filter(
    (item) => item.to === cardId && (item.kind === "supports" || item.kind === "contradicts"),
  )) {
    evidenceCards.push(...evidenceCardsForCard(workspace, connection.from, visited));
  }
  return evidenceCards;
}

function evidenceBasisForCard(workspace: Workspace, cardId: string) {
  const evidenceCards = [...new Map(
    evidenceCardsForCard(workspace, cardId).map((card) => [card.id, card]),
  ).values()];
  const qualified = evidenceCards.filter((card) => (
    card.evidenceAttribution?.role === "participant"
    || card.evidenceAttribution?.role === "external_artifact"
  ));
  const attributionPendingCount = evidenceCards.filter((card) => (
    !card.evidenceAttribution || card.evidenceAttribution.role === "mixed_exchange"
  )).length;
  const researchContextCount = evidenceCards.filter((card) => (
    card.evidenceAttribution?.role === "research_team"
  )).length;
  const sourceIds = new Set(qualified.flatMap((card) => card.sourceRef ? [card.sourceRef.sourceId] : []));
  return { qualifiedCount: qualified.length, sourceIds, attributionPendingCount, researchContextCount };
}

export function getDecisionReadout(workspace: Workspace): DecisionReadout {
  const frame = getActiveDecisionFrame(workspace);
  if (!frame) {
    return {
      status: "unframed",
      label: "Set evidence bar",
      basis: "limited",
      basisLabel: "Not framed",
      summary: "Agree the decision, working hypothesis, and what would change your mind.",
      sourceCount: 0,
      attributionPendingCount: 0,
      researchContextCount: 0,
      criterionReads: [],
    };
  }

  const linkedSourceIds = new Set<string>();
  const criterionReads = frame.criteria.map((criterion): CriterionRead => {
    const links = workspace.criterionLinks.filter((link) => link.criterionId === criterion.id);
    let supportCount = 0;
    let challengeCount = 0;
    let unqualifiedLinkCount = 0;
    let attributionPendingCount = 0;
    let researchContextCount = 0;
    const criterionSourceIds = new Set<string>();
    for (const link of links) {
      const basis = evidenceBasisForCard(workspace, link.cardId);
      attributionPendingCount += basis.attributionPendingCount;
      researchContextCount += basis.researchContextCount;
      if (basis.qualifiedCount === 0) {
        unqualifiedLinkCount += 1;
        continue;
      }
      if (link.stance === "supports") supportCount += 1;
      else challengeCount += 1;
      for (const sourceId of basis.sourceIds) {
        criterionSourceIds.add(sourceId);
        linkedSourceIds.add(sourceId);
      }
    }
    const status = supportCount > 0 && challengeCount > 0
      ? "mixed"
      : supportCount > 0
        ? "supported"
        : challengeCount > 0
          ? "challenged"
          : "untested";
    return {
      criterion,
      status,
      supportCount,
      challengeCount,
      sourceCount: criterionSourceIds.size,
      linkCount: links.length,
      unqualifiedLinkCount,
      attributionPendingCount,
      researchContextCount,
    };
  });

  const untestedCount = criterionReads.filter((read) => read.status === "untested").length;
  const positiveCount = criterionReads.filter((read) => (
    (read.criterion.polarity === "continue" && (read.status === "supported" || read.status === "mixed"))
    || (read.criterion.polarity === "reconsider" && (read.status === "challenged" || read.status === "mixed"))
  )).length;
  const negativeCount = criterionReads.filter((read) => (
    (read.criterion.polarity === "continue" && (read.status === "challenged" || read.status === "mixed"))
    || (read.criterion.polarity === "reconsider" && (read.status === "supported" || read.status === "mixed"))
  )).length;
  const totalLinks = workspace.criterionLinks.length;
  const totalQualifiedLinks = criterionReads.reduce((total, read) => total + read.supportCount + read.challengeCount, 0);
  const attributionPendingCount = criterionReads.reduce((total, read) => total + read.attributionPendingCount, 0);
  const researchContextCount = criterionReads.reduce((total, read) => total + read.researchContextCount, 0);
  const relevantSources = workspace.sources.filter((source) => linkedSourceIds.has(source.id));
  const materialQualityCaveat = relevantSources.some((source) => (
    source.researchQuality?.transcriptFidelity === "needs_review"
    || source.researchQuality?.sessionEvidence === "mostly_hypothetical"
  ));
  const conversationSources = relevantSources.filter((source) => (
    source.kind === "transcript" || source.kind === "audio" || source.kind === "video"
  ));
  const qualityReviewed = conversationSources.every((source) => (
    source.researchQuality?.transcriptFidelity === "spot_checked"
    && source.researchQuality?.sessionEvidence
    && source.researchQuality.sessionEvidence !== "unassessed"
  ));
  const counterSignalReviewed = criterionReads.some((read) => (
    read.criterion.polarity === "reconsider" && read.sourceCount > 0
  ));
  const basis = totalQualifiedLinks === 0
    || linkedSourceIds.size < 2
    || materialQualityCaveat
    || attributionPendingCount > 0
    || untestedCount > 0
    ? "limited"
    : qualityReviewed && counterSignalReviewed
      ? "considered"
      : "developing";
  const basisLabel = basis === "limited" ? "Limited" : basis === "developing" ? "Developing" : "Considered";

  if (totalQualifiedLinks === 0 || linkedSourceIds.size === 0 || untestedCount > 0) {
    return {
      status: "too_early",
      label: "Too early to call",
      basis,
      basisLabel,
      summary: totalLinks === 0
        ? "No evidence has been accepted against the agreed criteria yet."
        : totalQualifiedLinks === 0 && attributionPendingCount > 0
          ? "Accepted links still rely on unreviewed or mixed attribution. Confirm whose evidence it is before reading direction."
          : totalQualifiedLinks === 0 && researchContextCount > 0
            ? "Research-team speech is being held as context; no participant or external evidence is carrying the criteria yet."
            : linkedSourceIds.size === 0
              ? "Accepted links do not yet resolve to an inspectable source. Restore the evidence chain before reading direction."
              : `${untestedCount} ${untestedCount === 1 ? "criterion has" : "criteria have"} no qualifying participant or external evidence yet.`,
      sourceCount: linkedSourceIds.size,
      attributionPendingCount,
      researchContextCount,
      criterionReads,
    };
  }

  if (positiveCount > 0 && negativeCount > 0) {
    return {
      status: "mixed",
      label: "Mixed — reframe",
      basis,
      basisLabel,
      summary: "Accepted evidence points in both directions. Compare explanations before choosing the next move.",
      sourceCount: linkedSourceIds.size,
      attributionPendingCount,
      researchContextCount,
      criterionReads,
    };
  }

  if (negativeCount > 0) {
    return {
      status: "leaning_reconsider",
      label: "Leaning reconsider",
      basis,
      basisLabel,
      summary: "The accepted evidence currently weighs against the agreed continuation bar.",
      sourceCount: linkedSourceIds.size,
      attributionPendingCount,
      researchContextCount,
      criterionReads,
    };
  }

  return {
    status: "leaning_continue",
    label: "Leaning continue",
    basis,
    basisLabel,
    summary: "The accepted evidence currently meets the direction of the agreed continuation criteria.",
    sourceCount: linkedSourceIds.size,
    attributionPendingCount,
    researchContextCount,
    criterionReads,
  };
}

export function getPatternSignal(workspace: Workspace, patternId: string): PatternSignal {
  const visited = new Set<string>();
  const evidenceIds = new Set<string>();
  const sourceIds = new Set<string>();
  const attributionPendingIds = new Set<string>();
  const researchContextIds = new Set<string>();
  let contradictionCount = 0;

  function walk(cardId: string) {
    if (visited.has(cardId)) return;
    visited.add(cardId);
    for (const connection of workspace.connections.filter((item) => item.to === cardId)) {
      if (connection.kind !== "supports" && connection.kind !== "contradicts") continue;
      if (
        connection.kind === "contradicts"
        && evidenceBasisForCard(workspace, connection.from).qualifiedCount > 0
      ) contradictionCount += 1;
      const upstream = workspace.cards.find((card) => card.id === connection.from);
      if (!upstream) continue;
      if (upstream.kind === "evidence") {
        if (
          upstream.evidenceAttribution?.role === "participant"
          || upstream.evidenceAttribution?.role === "external_artifact"
        ) {
          evidenceIds.add(upstream.id);
          if (upstream.sourceRef) sourceIds.add(upstream.sourceRef.sourceId);
        } else if (upstream.evidenceAttribution?.role === "research_team") {
          researchContextIds.add(upstream.id);
        } else {
          attributionPendingIds.add(upstream.id);
        }
      } else {
        walk(upstream.id);
      }
    }
  }

  walk(patternId);
  const status =
    evidenceIds.size === 0 && (attributionPendingIds.size > 0 || researchContextIds.size > 0)
      ? "unreviewed"
      : contradictionCount > 0
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
    attributionPendingCount: attributionPendingIds.size,
    researchContextCount: researchContextIds.size,
    status,
  };
}

export type NextMove = {
  stage: FieldStage;
  title: string;
  detail: string;
  actionLabel: string;
  action: "add-source" | "add-evidence" | "ask-agent" | "review-proposals" | "review-attribution" | "change-stage" | "edit-frame";
  cardId?: string;
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

  if (!getActiveDecisionFrame(workspace)) {
    return {
      stage: "orient",
      title: "Set the evidence bar",
      detail: "Name the decision, your working hypothesis, and what would make you continue or reconsider.",
      actionLabel: "Set the bar",
      action: "edit-frame",
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

  const qualifiedEvidence = evidence.filter((card) => (
    card.evidenceAttribution?.role === "participant"
    || card.evidenceAttribution?.role === "external_artifact"
  ));
  const attributionPendingEvidence = evidence.filter((card) => (
    !card.evidenceAttribution || card.evidenceAttribution.role === "mixed_exchange"
  ));
  if (qualifiedEvidence.length === 0 && attributionPendingEvidence.length > 0) {
    const mixedCount = attributionPendingEvidence.filter((card) => card.evidenceAttribution?.role === "mixed_exchange").length;
    return {
      stage: "forage",
      title: mixedCount === attributionPendingEvidence.length ? "Separate the voices" : "Confirm whose evidence this is",
      detail: mixedCount === attributionPendingEvidence.length
        ? `${mixedCount} mixed ${mixedCount === 1 ? "exchange needs" : "exchanges need"} a participant-only excerpt before carrying signal.`
        : `${attributionPendingEvidence.length} evidence ${attributionPendingEvidence.length === 1 ? "card needs" : "cards need"} a human-reviewed voice role before carrying signal.`,
      actionLabel: "Review evidence",
      action: "review-attribution",
      cardId: attributionPendingEvidence[0].id,
    };
  }

  if (qualifiedEvidence.length === 0) {
    return {
      stage: "forage",
      title: "Bring participant evidence into view",
      detail: "The field currently contains research-team context, but no participant voice or external behavior is carrying signal.",
      actionLabel: "Add evidence",
      action: "add-evidence",
    };
  }


  if (workspace.criterionLinks.length === 0) {
    return {
      stage: "test",
      title: "Read the evidence against the bar",
      detail: "Ask for a provisional criterion pass, then accept only the links you can inspect and defend.",
      actionLabel: "Suggest relevance",
      action: "ask-agent",
      prompt: "Review the current field against the active decision frame. For each continue and reconsider criterion, cite card and source IDs that support it, challenge it, or do not bear on it. Separate participant evidence from research-team prompts or hypotheses; a diarized speaker label is not a role, so leave uncertain attribution unresolved. Separate observed behavior from stated preference and note source-quality caveats. Do not change the decision frame, quality assessments, evidence attribution, evidence links, or final decision; return provisional suggestions for human review.",
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
