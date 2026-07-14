# Agent operation protocol

Read the current field:

```bash
npm run field -- context
npm run field -- requests
```

Apply a change by creating `work/agent-ops.json`:

```json
{
  "baseRevision": 3,
  "actor": "agent",
  "operations": [
    {
      "type": "addCard",
      "card": {
        "id": "card-agent-pattern-1",
        "kind": "pattern",
        "title": "Fidelity drops at every handoff",
        "body": "Several observations point to manual translation between chat, source material, and the board.",
        "position": { "x": 860, "y": 420 },
        "createdBy": "agent"
      }
    },
    {
      "type": "addConnection",
      "connection": {
        "id": "connection-agent-1",
        "from": "card-observation-handoffs",
        "to": "card-agent-pattern-1",
        "kind": "supports",
        "label": "contributes to"
      }
    }
  ]
}
```

Then run:

```bash
npm run field -- apply work/agent-ops.json
```

Supported operation types are `addCard`, `updateCard`, `moveCards`, `deleteCard`, `addConnection`, `deleteConnection`, `addSource`, `addAgentRequest`, and `resolveAgentRequest`. Invalid references, stale revisions, and malformed operations fail without changing the workspace.
