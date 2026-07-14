# Architecture

## One durable model

`data/workspace.json` is the canonical domain record. It contains sources, cards, relationships, canvas positions, and agent requests. The browser canvas is a projection of this model; agent conversations are not stored as hidden parallel state.

All writers use the same operation pipeline:

```text
browser or CLI
    -> typed operations + base revision
    -> schema validation
    -> file lock
    -> revision conflict check
    -> domain invariants
    -> atomic rename
    -> canonical workspace
```

## Split-brain guardrails

- The browser does not persist an independent canvas snapshot.
- Agents do not edit the workspace file directly.
- Writes fail closed when their `baseRevision` is stale.
- Connections cannot point to missing cards.
- Evidence source references cannot point to missing sources.
- Source material and interpretation use different card kinds.
- The provider boundary is the CLI protocol, not provider-specific fields in workspace data.

## Components

- `src/`: React and React Flow interface.
- `src/shared/`: schema, operations, and invariants shared by every writer.
- `server/`: local Hono API and locked atomic file store.
- `scripts/field.ts`: agent-facing CLI.
- `data/`: canonical workspace data. Future binary assets will live beside it and be referenced by ID.

## Why React Flow

The domain is a graph with explicit typed nodes and relationships, not a freeform drawing document. React Flow provides spatial interaction while letting the repository own the semantic data model. This keeps the serialized format compact, readable, and safe for CLI agents to manipulate.

## Deferred decisions

- Multimodal extraction pipeline and embeddings.
- Direct Codex app-server integration versus non-interactive runs.
- Claude Code process integration.
- SQLite or event-log persistence after the file model reaches its limits.
- Collaboration, sync, auth, and hosting.

Those decisions should follow evidence that the core evidence-to-pattern loop is useful.
