# Problem Field agent protocol

When the user asks you to inspect, question, organize, or modify the problem field:

1. Run `npm run field -- context` before reasoning about it.
2. Run `npm run field -- requests` to find questions queued from the canvas.
3. Keep evidence, observations, patterns, and questions semantically distinct.
4. Never edit `data/workspace.json` directly.
5. Write proposed operations to a unique file under `work/`, using the current revision from `context` as `baseRevision`.
6. Apply them with `npm run field -- apply work/<your-file>.json`.
7. Re-run `npm run field -- context` to verify the result.

Prefer traceable, conservative changes. Do not invent source provenance. New agent interpretations must use `addAgentProposal` so they remain provisional until human review. Use `updateSource` for extraction results and report uncertainty or failure explicitly.

When adding or updating project or card meaning, preserve the full content and also write faithful `display` copy for the visual surface: a title of at most 60 characters and a summary of at most 120 characters. Keep uncertainty and qualifiers. Display copy is presentation metadata, never a replacement for evidence or rationale.

When a request is started by the local runner, do not resolve or finish it. The runner owns request lifecycle and records the final response or failure after your process exits. You may use read-only MCP tools already configured on the active agent host. When external material is brought into the field, add a source snapshot with `externalRef.connectorId`, `resourceId`, `retrievedAt`, and a URL or version when available.

The operation schema and examples are in `docs/agent-protocol.md`.
