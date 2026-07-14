import { z } from "zod";

const idSchema = z.string().min(1).max(120);
const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const cardKindSchema = z.enum([
  "evidence",
  "observation",
  "pattern",
  "question",
]);
export type CardKind = z.infer<typeof cardKindSchema>;

export const sourceSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(240),
  kind: z.enum(["transcript", "note", "image", "video", "audio", "document", "other"]),
  origin: z.string().max(2_000).optional(),
  summary: z.string().max(100_000).optional(),
  importedAt: z.string().datetime(),
});
export type Source = z.infer<typeof sourceSchema>;

export const sourceRefSchema = z.object({
  sourceId: idSchema,
  locator: z.string().max(500).optional(),
  quote: z.string().max(20_000).optional(),
});

export const cardSchema = z.object({
  id: idSchema,
  kind: cardKindSchema,
  title: z.string().min(1).max(240),
  body: z.string().max(20_000),
  position: positionSchema,
  sourceRef: sourceRefSchema.optional(),
  createdBy: z.enum(["human", "agent", "system"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FieldCard = z.infer<typeof cardSchema>;

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
  status: z.enum(["open", "resolved"]),
  response: z.string().max(20_000).optional(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
});
export type AgentRequest = z.infer<typeof agentRequestSchema>;

export const workspaceSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  project: z.object({
    name: z.string().min(1).max(120),
    question: z.string().min(1).max(1_000),
    status: z.enum(["exploring", "framing", "paused"]),
  }),
  sources: z.array(sourceSchema),
  cards: z.array(cardSchema),
  connections: z.array(connectionSchema),
  agentRequests: z.array(agentRequestSchema),
});
export type Workspace = z.infer<typeof workspaceSchema>;

const addCardInputSchema = cardSchema.omit({ createdAt: true, updatedAt: true });
const updateCardPatchSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  body: z.string().max(20_000).optional(),
  sourceRef: sourceRefSchema.nullable().optional(),
});

export const operationSchema = z.discriminatedUnion("type", [
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
    type: z.literal("addAgentRequest"),
    request: agentRequestSchema.omit({ createdAt: true, status: true }),
  }),
  z.object({
    type: z.literal("resolveAgentRequest"),
    requestId: idSchema,
    response: z.string().max(20_000),
  }),
]);
export type FieldOperation = z.infer<typeof operationSchema>;

export const operationSetSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  actor: z.enum(["human", "agent", "system"]),
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
}

export function applyOperationSet(
  current: Workspace,
  input: OperationSet,
  now = new Date().toISOString(),
): Workspace {
  const next = structuredClone(current);

  for (const operation of input.operations) {
    switch (operation.type) {
      case "addCard": {
        requireUniqueId(next.cards, operation.card.id, "Card");
        next.cards.push({ ...operation.card, createdAt: now, updatedAt: now });
        break;
      }
      case "updateCard": {
        const card = requireCard(next, operation.cardId);
        if (operation.patch.title !== undefined) card.title = operation.patch.title;
        if (operation.patch.body !== undefined) card.body = operation.patch.body;
        if (operation.patch.sourceRef !== undefined) {
          if (operation.patch.sourceRef === null) delete card.sourceRef;
          else card.sourceRef = operation.patch.sourceRef;
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
      case "addAgentRequest": {
        requireUniqueId(next.agentRequests, operation.request.id, "Agent request");
        next.agentRequests.push({
          ...operation.request,
          status: "open",
          createdAt: now,
        });
        break;
      }
      case "resolveAgentRequest": {
        const request = next.agentRequests.find((item) => item.id === operation.requestId);
        if (!request) {
          throw new DomainError(`Agent request '${operation.requestId}' does not exist.`);
        }
        if (request.status === "resolved") {
          throw new DomainError(`Agent request '${operation.requestId}' is already resolved.`);
        }
        request.status = "resolved";
        request.response = operation.response;
        request.resolvedAt = now;
        break;
      }
    }
  }

  assertReferences(next);
  next.revision += 1;
  next.updatedAt = now;
  return workspaceSchema.parse(next);
}
