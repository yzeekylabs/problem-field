import { z } from "zod";

const idSchema = z.string().min(1).max(120);
const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
const actorSchema = z.enum(["human", "agent", "system"]);

const displayCopyInputSchema = z.object({
  title: z.string().min(1).max(60),
  summary: z.string().min(1).max(120),
});

export const displayCopySchema = displayCopyInputSchema.extend({
  generatedBy: actorSchema,
  updatedAt: z.string().datetime(),
});
export type DisplayCopy = z.infer<typeof displayCopySchema>;

export const cardKindSchema = z.enum([
  "evidence",
  "observation",
  "pattern",
  "question",
]);
export type CardKind = z.infer<typeof cardKindSchema>;

export const fieldStageSchema = z.enum([
  "orient",
  "forage",
  "cluster",
  "frame",
  "test",
  "decide",
]);
export type FieldStage = z.infer<typeof fieldStageSchema>;

export const decisionCriterionMaxLength = 500;
export const decisionCriteriaMaxTotal = 16;

export const decisionCriterionSchema = z.object({
  id: idSchema,
  polarity: z.enum(["continue", "reconsider"]),
  statement: z.string().min(1).max(decisionCriterionMaxLength),
});
export type DecisionCriterion = z.infer<typeof decisionCriterionSchema>;

const decisionCriteriaSchema = z.array(decisionCriterionSchema).min(2).max(decisionCriteriaMaxTotal).superRefine((criteria, context) => {
  if (!criteria.some((criterion) => criterion.polarity === "continue")) {
    context.addIssue({ code: "custom", message: "Add at least one continue criterion." });
  }
  if (!criteria.some((criterion) => criterion.polarity === "reconsider")) {
    context.addIssue({ code: "custom", message: "Add at least one reconsider criterion." });
  }
  if (new Set(criteria.map((criterion) => criterion.id)).size !== criteria.length) {
    context.addIssue({ code: "custom", message: "Decision criteria must have unique IDs." });
  }
});

export const decisionFrameInputSchema = z.object({
  id: idSchema,
  decision: z.string().min(1).max(1_000),
  hypothesis: z.string().min(1).max(2_000),
  criteria: decisionCriteriaSchema,
});
export type DecisionFrameInput = z.infer<typeof decisionFrameInputSchema>;

export const decisionFrameSchema = decisionFrameInputSchema.extend({
  version: z.number().int().positive(),
  createdBy: z.literal("human"),
  createdAt: z.string().datetime(),
});
export type DecisionFrame = z.infer<typeof decisionFrameSchema>;

export const criterionLinkInputSchema = z.object({
  criterionId: idSchema,
  stance: z.enum(["supports", "challenges"]),
});
export type CriterionLinkInput = z.infer<typeof criterionLinkInputSchema>;

export const criterionLinkSchema = criterionLinkInputSchema.extend({
  cardId: idSchema,
  createdBy: z.literal("human"),
  updatedAt: z.string().datetime(),
});
export type CriterionLink = z.infer<typeof criterionLinkSchema>;

export const sourceResearchQualityInputSchema = z.object({
  transcriptFidelity: z.enum(["unreviewed", "spot_checked", "needs_review"]).optional(),
  sessionEvidence: z.enum(["unassessed", "behavior_rich", "mixed", "mostly_hypothetical"]).optional(),
  note: z.string().max(2_000).optional(),
});
export type SourceResearchQualityInput = z.infer<typeof sourceResearchQualityInputSchema>;

export const sourceResearchQualitySchema = sourceResearchQualityInputSchema.extend({
  updatedBy: z.literal("human"),
  updatedAt: z.string().datetime(),
});
export type SourceResearchQuality = z.infer<typeof sourceResearchQualitySchema>;

const sourceAssetSchema = z.object({
  fileName: z.string().min(1).max(240),
  originalName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(240),
  bytes: z.number().int().nonnegative(),
});

const extractionSchema = z.object({
  status: z.enum(["not_needed", "queued", "ready", "failed"]),
  method: z.string().max(120).optional(),
  updatedAt: z.string().datetime().optional(),
});

const externalSourceRefSchema = z.object({
  connectorId: idSchema,
  resourceId: z.string().min(1).max(2_000),
  url: z.string().url().max(4_000).optional(),
  retrievedAt: z.string().datetime(),
  version: z.string().max(500).optional(),
});

export const sourceSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(240),
  kind: z.enum(["transcript", "note", "image", "video", "audio", "document", "other"]),
  origin: z.string().max(2_000).optional(),
  summary: z.string().max(100_000).optional(),
  asset: sourceAssetSchema.optional(),
  externalRef: externalSourceRefSchema.optional(),
  extraction: extractionSchema.optional(),
  researchQuality: sourceResearchQualitySchema.optional(),
  importedAt: z.string().datetime(),
});
export type Source = z.infer<typeof sourceSchema>;

export const sourceRefSchema = z.object({
  sourceId: idSchema,
  locator: z.string().max(500).optional(),
  quote: z.string().max(20_000).optional(),
  speakerLabel: z.string().min(1).max(240).optional(),
});

export const evidenceAttributionInputSchema = z.object({
  role: z.enum(["participant", "research_team", "mixed_exchange", "external_artifact"]),
});
export type EvidenceAttributionInput = z.infer<typeof evidenceAttributionInputSchema>;

export const evidenceAttributionSchema = evidenceAttributionInputSchema.extend({
  confirmedBy: z.literal("human"),
  updatedAt: z.string().datetime(),
});
export type EvidenceAttribution = z.infer<typeof evidenceAttributionSchema>;

export const cardSchema = z.object({
  id: idSchema,
  kind: cardKindSchema,
  title: z.string().min(1).max(240),
  body: z.string().max(20_000),
  position: positionSchema,
  sourceRef: sourceRefSchema.optional(),
  evidenceAttribution: evidenceAttributionSchema.optional(),
  display: displayCopySchema.optional(),
  createdBy: z.enum(["human", "agent", "system"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FieldCard = z.infer<typeof cardSchema>;

const addCardInputSchema = cardSchema
  .omit({ createdAt: true, updatedAt: true, display: true, evidenceAttribution: true })
  .extend({ display: displayCopyInputSchema.optional() });

export const connectionSchema = z.object({
  id: idSchema,
  from: idSchema,
  to: idSchema,
  kind: z.enum(["supports", "contradicts", "relates", "raises"]),
  label: z.string().max(120).optional(),
});
export type FieldConnection = z.infer<typeof connectionSchema>;

export const agentRequestSchema = z.object({
  id: idSchema,
  prompt: z.string().min(1).max(10_000),
  scopeCardIds: z.array(idSchema),
  status: z.enum(["queued", "running", "completed", "failed"]),
  provider: z.enum(["codex", "claude"]).optional(),
  runId: idSchema.optional(),
  response: z.string().max(20_000).optional(),
  error: z.string().max(20_000).optional(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
});
export type AgentRequest = z.infer<typeof agentRequestSchema>;

export const agentProposalSchema = z.object({
  id: idSchema,
  kind: z.enum(["pattern", "question"]),
  title: z.string().min(1).max(240),
  rationale: z.string().min(1).max(20_000),
  scopeCardIds: z.array(idSchema).min(1).max(100),
  proposedCard: addCardInputSchema.extend({
    kind: z.enum(["pattern", "question"]),
    createdBy: z.literal("agent"),
  }),
  proposedConnections: z.array(connectionSchema).max(100),
  status: z.enum(["pending", "accepted", "dismissed"]),
  createdAt: z.string().datetime(),
  reviewedAt: z.string().datetime().optional(),
});
export type AgentProposal = z.infer<typeof agentProposalSchema>;

export const workspaceSchema = z.object({
  schemaVersion: z.literal(6),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  project: z.object({
    name: z.string().min(1).max(120),
    question: z.string().min(1).max(1_000),
    status: z.enum(["exploring", "framing", "paused"]),
    activeStage: fieldStageSchema,
    onboardingComplete: z.boolean(),
    display: displayCopySchema.optional(),
  }),
  sources: z.array(sourceSchema),
  cards: z.array(cardSchema),
  connections: z.array(connectionSchema),
  decisionFrames: z.array(decisionFrameSchema),
  criterionLinks: z.array(criterionLinkSchema),
  agentRequests: z.array(agentRequestSchema),
  agentProposals: z.array(agentProposalSchema),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export function parseWorkspace(input: unknown): Workspace {
  if (!input || typeof input !== "object") return workspaceSchema.parse(input);
  const candidate = structuredClone(input) as Record<string, unknown>;
  const project = candidate.project && typeof candidate.project === "object"
    ? candidate.project as Record<string, unknown>
    : null;

  if (
    candidate.schemaVersion === 1
    || candidate.schemaVersion === 2
    || candidate.schemaVersion === 3
    || candidate.schemaVersion === 4
    || candidate.schemaVersion === 5
    || candidate.schemaVersion === 6
  ) {
    candidate.agentProposals ??= [];
    candidate.decisionFrames ??= [];
    candidate.criterionLinks ??= [];
    if (project) {
      project.activeStage ??= project.status === "framing" ? "frame" : "forage";
      project.onboardingComplete ??= true;
    }
    const requests = Array.isArray(candidate.agentRequests)
      ? candidate.agentRequests as Array<Record<string, unknown>>
      : [];
    for (const request of requests) {
      if (request.status === "open") request.status = "queued";
      if (request.status === "resolved") request.status = "completed";
      if (request.resolvedAt && !request.finishedAt) request.finishedAt = request.resolvedAt;
      delete request.resolvedAt;
    }
    candidate.schemaVersion = 6;
  }

  return workspaceSchema.parse(candidate);
}

const updateCardPatchSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  body: z.string().max(20_000).optional(),
  sourceRef: sourceRefSchema.nullable().optional(),
  display: displayCopyInputSchema.nullable().optional(),
});

export const operationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("updateProject"),
    patch: z.object({
      name: z.string().min(1).max(120).optional(),
      question: z.string().min(1).max(1_000).optional(),
      status: z.enum(["exploring", "framing", "paused"]).optional(),
      activeStage: fieldStageSchema.optional(),
      onboardingComplete: z.boolean().optional(),
      display: displayCopyInputSchema.nullable().optional(),
    }),
  }),
  z.object({ type: z.literal("addCard"), card: addCardInputSchema }),
  z.object({
    type: z.literal("updateCard"),
    cardId: idSchema,
    patch: updateCardPatchSchema,
  }),
  z.object({
    type: z.literal("moveCards"),
    positions: z.array(z.object({ cardId: idSchema, position: positionSchema })).min(1),
  }),
  z.object({ type: z.literal("deleteCard"), cardId: idSchema }),
  z.object({ type: z.literal("addConnection"), connection: connectionSchema }),
  z.object({ type: z.literal("deleteConnection"), connectionId: idSchema }),
  z.object({ type: z.literal("addSource"), source: sourceSchema }),
  z.object({
    type: z.literal("updateSource"),
    sourceId: idSchema,
    patch: z.object({
      title: z.string().min(1).max(240).optional(),
      origin: z.string().max(2_000).nullable().optional(),
      summary: z.string().max(100_000).nullable().optional(),
      extraction: extractionSchema.optional(),
    }),
  }),
  z.object({
    type: z.literal("setSourceResearchQuality"),
    sourceId: idSchema,
    assessment: sourceResearchQualityInputSchema.nullable(),
  }),
  z.object({
    type: z.literal("setDecisionFrame"),
    frame: decisionFrameInputSchema,
  }),
  z.object({
    type: z.literal("setCriterionLinksForCard"),
    cardId: idSchema,
    links: z.array(criterionLinkInputSchema).max(8),
  }),
  z.object({
    type: z.literal("setEvidenceAttribution"),
    cardId: idSchema,
    attribution: evidenceAttributionInputSchema.nullable(),
  }),
  z.object({
    type: z.literal("addAgentRequest"),
    request: agentRequestSchema.omit({
      createdAt: true,
      status: true,
      provider: true,
      runId: true,
      response: true,
      error: true,
      startedAt: true,
      finishedAt: true,
    }),
  }),
  z.object({
    type: z.literal("resolveAgentRequest"),
    requestId: idSchema,
    response: z.string().max(20_000),
  }),
  z.object({
    type: z.literal("startAgentRequest"),
    requestId: idSchema,
    runId: idSchema,
    provider: z.enum(["codex", "claude"]),
  }),
  z.object({
    type: z.literal("finishAgentRequest"),
    requestId: idSchema,
    runId: idSchema,
    outcome: z.enum(["completed", "failed"]),
    response: z.string().max(20_000).optional(),
    error: z.string().max(20_000).optional(),
  }),
  z.object({
    type: z.literal("deleteAgentRequest"),
    requestId: idSchema,
  }),
  z.object({
    type: z.literal("addAgentProposal"),
    proposal: agentProposalSchema.omit({ createdAt: true, status: true }),
  }),
  z.object({
    type: z.literal("reviewAgentProposal"),
    proposalId: idSchema,
    decision: z.enum(["accepted", "dismissed"]),
  }),
]);
export type FieldOperation = z.infer<typeof operationSchema>;

export const operationSetSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  actor: actorSchema,
  operations: z.array(operationSchema).min(1).max(100),
});
export type OperationSet = z.infer<typeof operationSetSchema>;

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

function requireUniqueId(items: Array<{ id: string }>, id: string, label: string) {
  if (items.some((item) => item.id === id)) {
    throw new DomainError(`${label} '${id}' already exists.`);
  }
}

function requireCard(workspace: Workspace, cardId: string) {
  const card = workspace.cards.find((item) => item.id === cardId);
  if (!card) throw new DomainError(`Card '${cardId}' does not exist.`);
  return card;
}

function requireHuman(actor: OperationSet["actor"], action: string) {
  if (actor !== "human") {
    throw new DomainError(`${action} requires explicit human review.`);
  }
}

export function getActiveDecisionFrame(workspace: Workspace) {
  return workspace.decisionFrames?.at(-1);
}

function assertReferences(workspace: Workspace) {
  const sourceIds = new Set(workspace.sources.map((source) => source.id));
  const cardIds = new Set(workspace.cards.map((card) => card.id));

  for (const card of workspace.cards) {
    if (card.sourceRef && !sourceIds.has(card.sourceRef.sourceId)) {
      throw new DomainError(
        `Card '${card.id}' references missing source '${card.sourceRef.sourceId}'.`,
      );
    }
  }

  const activeCriterionIds = new Set(
    getActiveDecisionFrame(workspace)?.criteria.map((criterion) => criterion.id) ?? [],
  );
  for (const link of workspace.criterionLinks) {
    if (!cardIds.has(link.cardId)) {
      throw new DomainError(`Criterion link references missing card '${link.cardId}'.`);
    }
    if (!activeCriterionIds.has(link.criterionId)) {
      throw new DomainError(`Criterion link references inactive criterion '${link.criterionId}'.`);
    }
  }

  for (const connection of workspace.connections) {
    if (!cardIds.has(connection.from) || !cardIds.has(connection.to)) {
      throw new DomainError(`Connection '${connection.id}' references a missing card.`);
    }
    if (connection.from === connection.to) {
      throw new DomainError(`Connection '${connection.id}' cannot connect a card to itself.`);
    }
  }

  for (const request of workspace.agentRequests) {
    for (const cardId of request.scopeCardIds) {
      if (!cardIds.has(cardId)) {
        throw new DomainError(`Agent request '${request.id}' references missing card '${cardId}'.`);
      }
    }
  }

  for (const proposal of workspace.agentProposals) {
    if (proposal.status !== "pending") continue;
    const proposalCardIds = new Set([proposal.proposedCard.id]);
    for (const cardId of proposal.scopeCardIds) {
      if (!cardIds.has(cardId)) {
        throw new DomainError(`Agent proposal '${proposal.id}' references missing card '${cardId}'.`);
      }
    }
    for (const connection of proposal.proposedConnections) {
      const knownIds = new Set([...cardIds, ...proposalCardIds]);
      if (!knownIds.has(connection.from) || !knownIds.has(connection.to)) {
        throw new DomainError(
          `Agent proposal '${proposal.id}' contains a connection to a missing card.`,
        );
      }
    }
  }
}

export function applyOperationSet(
  current: Workspace,
  input: OperationSet,
  now = new Date().toISOString(),
): Workspace {
  const next = structuredClone(current);

  for (const operation of input.operations) {
    switch (operation.type) {
      case "updateProject": {
        const { display, ...patch } = operation.patch;
        const meaningChanged = patch.name !== undefined || patch.question !== undefined;
        next.project = { ...next.project, ...patch };
        if (display === null) delete next.project.display;
        else if (display !== undefined) {
          next.project.display = { ...display, generatedBy: input.actor, updatedAt: now };
        } else if (meaningChanged) {
          delete next.project.display;
        }
        break;
      }
      case "addCard": {
        requireUniqueId(next.cards, operation.card.id, "Card");
        const { display, ...card } = operation.card;
        next.cards.push({
          ...card,
          ...(display ? { display: { ...display, generatedBy: input.actor, updatedAt: now } } : {}),
          createdAt: now,
          updatedAt: now,
        });
        break;
      }
      case "updateCard": {
        const card = requireCard(next, operation.cardId);
        const meaningChanged = operation.patch.title !== undefined || operation.patch.body !== undefined;
        if (operation.patch.title !== undefined) card.title = operation.patch.title;
        if (operation.patch.body !== undefined) card.body = operation.patch.body;
        if (operation.patch.sourceRef !== undefined) {
          if (operation.patch.sourceRef === null) delete card.sourceRef;
          else card.sourceRef = operation.patch.sourceRef;
        }
        if (operation.patch.display === null) delete card.display;
        else if (operation.patch.display !== undefined) {
          card.display = { ...operation.patch.display, generatedBy: input.actor, updatedAt: now };
        } else if (meaningChanged) {
          delete card.display;
        }
        card.updatedAt = now;
        break;
      }
      case "moveCards": {
        for (const movement of operation.positions) {
          const card = requireCard(next, movement.cardId);
          card.position = movement.position;
          card.updatedAt = now;
        }
        break;
      }
      case "deleteCard": {
        requireCard(next, operation.cardId);
        next.cards = next.cards.filter((card) => card.id !== operation.cardId);
        next.connections = next.connections.filter(
          (connection) =>
            connection.from !== operation.cardId && connection.to !== operation.cardId,
        );
        next.agentRequests = next.agentRequests.map((request) => ({
          ...request,
          scopeCardIds: request.scopeCardIds.filter((cardId) => cardId !== operation.cardId),
        }));
        next.criterionLinks = next.criterionLinks.filter((link) => link.cardId !== operation.cardId);
        break;
      }
      case "addConnection": {
        requireUniqueId(next.connections, operation.connection.id, "Connection");
        requireCard(next, operation.connection.from);
        requireCard(next, operation.connection.to);
        next.connections.push(operation.connection);
        break;
      }
      case "deleteConnection": {
        if (!next.connections.some((item) => item.id === operation.connectionId)) {
          throw new DomainError(`Connection '${operation.connectionId}' does not exist.`);
        }
        next.connections = next.connections.filter(
          (connection) => connection.id !== operation.connectionId,
        );
        break;
      }
      case "addSource": {
        requireUniqueId(next.sources, operation.source.id, "Source");
        next.sources.push(operation.source);
        break;
      }
      case "updateSource": {
        const source = next.sources.find((item) => item.id === operation.sourceId);
        if (!source) throw new DomainError(`Source '${operation.sourceId}' does not exist.`);
        if (operation.patch.title !== undefined) source.title = operation.patch.title;
        if (operation.patch.origin !== undefined) {
          if (operation.patch.origin === null) delete source.origin;
          else source.origin = operation.patch.origin;
        }
        if (operation.patch.summary !== undefined) {
          if (operation.patch.summary === null) delete source.summary;
          else source.summary = operation.patch.summary;
        }
        if (operation.patch.extraction !== undefined) source.extraction = operation.patch.extraction;
        break;
      }
      case "setSourceResearchQuality": {
        requireHuman(input.actor, "Research quality assessment");
        const source = next.sources.find((item) => item.id === operation.sourceId);
        if (!source) throw new DomainError(`Source '${operation.sourceId}' does not exist.`);
        if (operation.assessment === null) delete source.researchQuality;
        else {
          source.researchQuality = {
            ...operation.assessment,
            updatedBy: "human",
            updatedAt: now,
          };
        }
        break;
      }
      case "setDecisionFrame": {
        requireHuman(input.actor, "Decision frame changes");
        requireUniqueId(next.decisionFrames, operation.frame.id, "Decision frame");
        const previous = getActiveDecisionFrame(next);
        const previousCriteria = new Map(previous?.criteria.map((criterion) => [criterion.id, criterion]));
        const unchangedCriterionIds = new Set(operation.frame.criteria.flatMap((criterion) => {
          const earlier = previousCriteria.get(criterion.id);
          return earlier
            && earlier.polarity === criterion.polarity
            && earlier.statement === criterion.statement
            ? [criterion.id]
            : [];
        }));
        next.criterionLinks = next.criterionLinks.filter(
          (link) => unchangedCriterionIds.has(link.criterionId),
        );
        next.decisionFrames.push({
          ...operation.frame,
          version: (previous?.version ?? 0) + 1,
          createdBy: "human",
          createdAt: now,
        });
        break;
      }
      case "setCriterionLinksForCard": {
        requireHuman(input.actor, "Decision evidence links");
        const card = requireCard(next, operation.cardId);
        if (card.kind === "question" && operation.links.length > 0) {
          throw new DomainError("Open questions cannot count as decision evidence.");
        }
        const frame = getActiveDecisionFrame(next);
        if (!frame) throw new DomainError("Set the decision frame before linking evidence to it.");
        const activeCriterionIds = new Set(frame.criteria.map((criterion) => criterion.id));
        const linkedCriterionIds = operation.links.map((link) => link.criterionId);
        if (new Set(linkedCriterionIds).size !== linkedCriterionIds.length) {
          throw new DomainError("A card can link to each decision criterion only once.");
        }
        for (const link of operation.links) {
          if (!activeCriterionIds.has(link.criterionId)) {
            throw new DomainError(`Decision criterion '${link.criterionId}' is not active.`);
          }
        }
        next.criterionLinks = [
          ...next.criterionLinks.filter((link) => link.cardId !== operation.cardId),
          ...operation.links.map((link) => ({
            ...link,
            cardId: operation.cardId,
            createdBy: "human" as const,
            updatedAt: now,
          })),
        ];
        break;
      }
      case "setEvidenceAttribution": {
        requireHuman(input.actor, "Evidence attribution");
        const card = requireCard(next, operation.cardId);
        if (card.kind !== "evidence") {
          throw new DomainError("Only evidence cards can carry evidence attribution.");
        }
        if (operation.attribution === null) delete card.evidenceAttribution;
        else {
          card.evidenceAttribution = {
            ...operation.attribution,
            confirmedBy: "human",
            updatedAt: now,
          };
        }
        card.updatedAt = now;
        break;
      }
      case "addAgentRequest": {
        requireUniqueId(next.agentRequests, operation.request.id, "Agent request");
        next.agentRequests.push({
          ...operation.request,
          status: "queued",
          createdAt: now,
        });
        break;
      }
      case "resolveAgentRequest": {
        const request = next.agentRequests.find((item) => item.id === operation.requestId);
        if (!request) {
          throw new DomainError(`Agent request '${operation.requestId}' does not exist.`);
        }
        if (request.status !== "queued") {
          throw new DomainError(`Agent request '${operation.requestId}' cannot be resolved manually after a runner claims it.`);
        }
        request.status = "completed";
        request.response = operation.response;
        request.finishedAt = now;
        break;
      }
      case "startAgentRequest": {
        const request = next.agentRequests.find((item) => item.id === operation.requestId);
        if (!request) {
          throw new DomainError(`Agent request '${operation.requestId}' does not exist.`);
        }
        if (request.status !== "queued") {
          throw new DomainError(`Agent request '${operation.requestId}' is not queued.`);
        }
        request.status = "running";
        request.runId = operation.runId;
        request.provider = operation.provider;
        request.startedAt = now;
        delete request.response;
        delete request.error;
        delete request.finishedAt;
        break;
      }
      case "finishAgentRequest": {
        const request = next.agentRequests.find((item) => item.id === operation.requestId);
        if (!request) {
          throw new DomainError(`Agent request '${operation.requestId}' does not exist.`);
        }
        if (request.status !== "running" || request.runId !== operation.runId) {
          throw new DomainError(`Agent request '${operation.requestId}' is not owned by this run.`);
        }
        request.status = operation.outcome;
        request.finishedAt = now;
        if (operation.response) request.response = operation.response;
        else delete request.response;
        if (operation.error) request.error = operation.error;
        else delete request.error;
        break;
      }
      case "deleteAgentRequest": {
        const request = next.agentRequests.find((item) => item.id === operation.requestId);
        if (!request) {
          throw new DomainError(`Agent request '${operation.requestId}' does not exist.`);
        }
        if (request.status === "queued" || request.status === "running") {
          throw new DomainError(`Agent request '${operation.requestId}' is still active.`);
        }
        next.agentRequests = next.agentRequests.filter((item) => item.id !== operation.requestId);
        break;
      }
      case "addAgentProposal": {
        requireUniqueId(next.agentProposals, operation.proposal.id, "Agent proposal");
        requireUniqueId(next.cards, operation.proposal.proposedCard.id, "Proposed card");
        if (operation.proposal.kind !== operation.proposal.proposedCard.kind) {
          throw new DomainError("An agent proposal kind must match its proposed card kind.");
        }
        const proposedConnectionIds = operation.proposal.proposedConnections.map((item) => item.id);
        if (new Set(proposedConnectionIds).size !== proposedConnectionIds.length) {
          throw new DomainError("An agent proposal cannot contain duplicate connection IDs.");
        }
        next.agentProposals.push({
          ...operation.proposal,
          status: "pending",
          createdAt: now,
        });
        break;
      }
      case "reviewAgentProposal": {
        const proposal = next.agentProposals.find((item) => item.id === operation.proposalId);
        if (!proposal) {
          throw new DomainError(`Agent proposal '${operation.proposalId}' does not exist.`);
        }
        if (proposal.status !== "pending") {
          throw new DomainError(`Agent proposal '${operation.proposalId}' has already been reviewed.`);
        }
        if (operation.decision === "accepted") {
          requireUniqueId(next.cards, proposal.proposedCard.id, "Proposed card");
          const { display, ...proposedCard } = proposal.proposedCard;
          next.cards.push({
            ...proposedCard,
            ...(display ? { display: { ...display, generatedBy: "agent" as const, updatedAt: now } } : {}),
            createdAt: now,
            updatedAt: now,
          });
          for (const connection of proposal.proposedConnections) {
            requireUniqueId(next.connections, connection.id, "Proposed connection");
            next.connections.push(connection);
          }
        }
        proposal.status = operation.decision;
        proposal.reviewedAt = now;
        break;
      }
    }
  }

  assertReferences(next);
  next.revision += 1;
  next.updatedAt = now;
  return workspaceSchema.parse(next);
}
