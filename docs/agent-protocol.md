# Agent operation protocol

Read the current field and queued work:

```bash
npm run field -- context
npm run field -- requests
```

Create `work/agent-ops.json` with the current revision. Interpretations should enter as proposals, not canonical cards:

```json
{
  "baseRevision": 3,
  "actor": "agent",
  "operations": [
    {
      "type": "addAgentProposal",
      "proposal": {
        "id": "proposal-fragmented-attention",
        "kind": "pattern",
        "title": "The integration tax may be cognitive",
        "rationale": "Two observations describe repeated reinterpretation across tool boundaries. This is still based on one source and needs counter-evidence.",
        "scopeCardIds": ["card-observation-handoffs", "card-observation-flat"],
        "proposedCard": {
          "id": "card-proposed-integration-tax",
          "kind": "pattern",
          "title": "The integration tax may be cognitive",
          "body": "The user is acting as the integration layer between source, chat, and canvas.",
          "display": {
            "title": "The integration tax may be cognitive",
            "summary": "People are manually carrying context between source, chat, and canvas."
          },
          "position": { "x": 860, "y": 420 },
          "createdBy": "agent"
        },
        "proposedConnections": [
          {
            "id": "connection-handoffs-integration-tax",
            "from": "card-observation-handoffs",
            "to": "card-proposed-integration-tax",
            "kind": "supports"
          }
        ]
      }
    }
  ]
}
```

Apply and verify:

```bash
npm run field -- apply work/agent-ops.json
npm run field -- context
```

Use `addCard` for mechanical or user-directed canonical edits. Use `addAgentProposal` for new agent interpretations. Multimodal extraction updates a source with `updateSource`; it must report failure or uncertainty rather than invent content.

The active decision frame, source research context, and accepted links between cards and decision criteria are visible to the agent for critique and citation. They are not writable agent output. Never include `setDecisionFrame`, `setSourceResearchQuality`, or `setCriterionLinksForCard` in an agent operation set. The agent can flag vague thresholds, leading questions, weak transcript fidelity, competing explanations, or potentially relevant cards in its response; a person must inspect and record those judgments in the product.

Full project and card content carries meaning, evidence, qualifiers, and provenance. Optional `display` copy is a bounded visual projection: `title` is at most 60 characters and `summary` at most 120. Supply it when adding or updating meaning. If full content changes without replacement display copy, the domain invalidates the old display copy automatically so stale summaries cannot survive. Never shorten or rewrite exact evidence merely to make the canvas neater.

Every run must treat the current field as durable truth. On a continued or retried request, do not recreate cards or source snapshots that already exist; resume from fresh context and apply only the missing operations. Completed operations stay committed even if the provider later reaches its safety limit.

Agent-writable content operations are `updateProject`, `addCard`, `updateCard`, `moveCards`, `deleteCard`, `addConnection`, `deleteConnection`, `addSource`, `updateSource`, `addAgentRequest`, `resolveAgentRequest`, `deleteAgentRequest`, and `addAgentProposal`. Human review owns `reviewAgentProposal`, `setDecisionFrame`, `setSourceResearchQuality`, and `setCriterionLinksForCard`. `startAgentRequest` and `finishAgentRequest` are reserved for the local runner, which enforces run ownership. Only finished requests can be deleted.

For material retrieved through MCP, create a stable source snapshot and include an `externalRef` with `connectorId`, `resourceId`, `retrievedAt`, and optional `url` or `version`. Evidence then points to that source snapshot. Do not treat an agent transcript or an unrecorded live MCP result as field truth.

Malformed operations, invalid references, duplicate IDs, and stale revisions fail without changing the field.
