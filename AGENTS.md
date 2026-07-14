# Problem Field agent protocol

When the user asks you to inspect, question, organize, or modify the problem field:

1. Run `npm run field -- context` before reasoning about it.
2. Run `npm run field -- requests` to find questions queued from the canvas.
3. Keep evidence, observations, patterns, and questions semantically distinct.
4. Never edit `data/workspace.json` directly.
5. Write proposed operations to `work/agent-ops.json`, using the current revision from `context` as `baseRevision`.
6. Apply them with `npm run field -- apply work/agent-ops.json`.
7. Re-run `npm run field -- context` to verify the result.

Prefer traceable, conservative changes. Do not invent source provenance. New agent interpretations must use `addAgentProposal` so they remain provisional until human review. Use `updateSource` for extraction results and report uncertainty or failure explicitly.

The operation schema and examples are in `docs/agent-protocol.md`.
