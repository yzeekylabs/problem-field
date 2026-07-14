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

Supported operations are `updateProject`, `addCard`, `updateCard`, `moveCards`, `deleteCard`, `addConnection`, `deleteConnection`, `addSource`, `updateSource`, `addAgentRequest`, `resolveAgentRequest`, `addAgentProposal`, and `reviewAgentProposal`.

Malformed operations, invalid references, duplicate IDs, and stale revisions fail without changing the field.
