# Architecture

## One runtime truth

`data/local/workspace.json` is the canonical runtime record. It contains the project focus, loop stage, sources, cards, relationships, canvas positions, agent requests, and agent proposals. The browser canvas and CLI are projections over the same model.

`data/workspace.json` is only the checked-in empty seed. On first run it is copied into the gitignored local data root. This prevents real calls, screenshots, and transcripts from becoming ordinary public-repo changes.

All writers use one operation pipeline:

```text
browser, CLI, or agent runner
    -> typed operations + base revision
    -> schema validation
    -> file lock
    -> revision conflict check
    -> domain invariants
    -> atomic rename
    -> canonical local workspace
```

## Three truth zones

```text
raw source                canonical field                  provisional agent layer
immutable local asset  -> evidence / observation /     <- requests + proposed patterns
extracted text/version    pattern / question               (explicit accept or dismiss)
```

- Raw assets live under `data/local/assets/` and remain separate from derived extraction.
- External material becomes a source snapshot with connector, resource, and retrieval provenance; the live MCP response is not another workspace store.
- Evidence points back to a source and optional exact locator/quote.
- Agent interpretations do not enter the field until a person accepts them.

This is the core split-brain defense: AI conversation state, visual layout state, and source extraction state never become competing stores of meaning.

Canvas arrangement follows the same rule. Card coordinates in the workspace are the user's canonical **Custom** layout. **Grouped** is a browser-only projection derived from current cards and relationships: it lays out connected islands and never writes positions or increments the workspace revision. Returning to Custom therefore restores the exact saved coordinates rather than reconstructing them from another client-side store.

Relationship paths are also a browser-only projection. The connection endpoints and meaning remain canonical, while the renderer measures every card, reserves a clearance envelope around those rectangles, and chooses a short orthogonal route through open corridors. It can change ports or paths when cards move without creating another saved representation of the relationship.

Switching between Custom and Grouped interpolates the projected card positions and relationship paths together. The transition keeps stable edge ports, suspends dragging until it settles, and honors reduced-motion preferences; only the final Custom coordinates remain durable state.

Visual copy is bounded presentation metadata stored beside—never instead of—the full project or card content. Agent-generated display titles and summaries retain their author and update time. A semantic edit to the full title, body, name, or question invalidates existing display copy unless the same operation supplies a replacement. Surfaces use a word-boundary fallback while copy is missing, so layout remains readable without letting a stale summary become a second truth.

Execution activity is a fourth, explicitly non-canonical lane. The runner writes sanitized lifecycle and tool-category milestones under `data/local/agent-runs/`, keyed by the canonical request's `runId`. The browser reads that lane for live feedback, but it cannot turn activity into evidence or mutate the workspace through it. Keeping these frequent updates out of `workspace.json` also prevents progress reporting from racing the agent's own revision-checked field operations.

## Invariants

- The browser does not persist an independent canvas snapshot.
- Presentation-only canvas arrangements cannot write canonical card positions.
- Full content edits invalidate stale visual summaries by default.
- Agents do not edit workspace JSON directly.
- Writes fail closed when `baseRevision` is stale.
- Connections and proposal scopes cannot reference missing cards.
- Evidence cannot reference a missing source.
- Agent proposals carry explicit proposed cards and connections; acceptance is one validated operation.
- Raw source files are local and gitignored by default.
- Provider identity appears only as request execution metadata, never as a second field model.
- Only a queued request can be claimed, and only its matching run ID can finish it.
- Runner activity never increments the workspace revision or exposes raw commands, tool inputs/results, or private reasoning.

## Multimodal ingestion

The local API accepts text, image, PDF, audio, and video files up to 50 MB. Text-like files are extracted deterministically. Other files are stored unchanged and create a scoped agent extraction request. The UI never pretends OCR or transcription happened when it did not.

The extraction record (`queued`, `ready`, or `failed`) belongs to the source. Later adapters can add model/version provenance without changing evidence cards.

## Agent and connector boundary

The API owns one local worker and one active agent host. It claims queued work through the same revision-checked operation pipeline, launches the provider without a shell, uses workspace-write sandboxing, and records completion or failure durably. Codex is the default, with an explicit GPT-5.6 Terra / medium-effort execution profile and a 15-minute safety limit. Claude Code can be selected with `FIELD_AGENT_PROVIDER=claude`. Both consume the same repository instructions and CLI protocol, and every default remains environment-overridable.

Provider JSON streams are reduced to a small safe vocabulary: started, planning, reading the field, inspecting sources, checking a connector, applying grounded changes, checking work, and finished. Reasoning events are dropped, commands are classified without exposing their text, and MCP arguments and results never cross the activity API. If the local API restarts, a running request fails closed instead of being replayed automatically; automatic replay could leave two provider processes writing against the same field.

Connector configuration belongs to the active agent host, not the field. For Codex, the library derives configured and authenticated state from `codex mcp list --json`; for Claude Code it inspects the same named servers through `claude mcp get`. Connection actions use the selected provider's user-level MCP commands. The app does not merge Codex and Claude connector registries because that would create ambiguous authorization and capability truth. Switching provider means deriving from that provider's host boundary.

An MCP connection grants the agent a route to retrieve context. It does not automatically import or continuously sync content. A bounded agent request must select relevant material and write a provenance-stamped source snapshot into the canonical field. This keeps retrieval repeatable and prevents a later-changing external page from silently rewriting the evidence base.

## Persistence evolution

The file store is intentionally sufficient for a local, single-user test. When collaboration or query volume requires it, the operation contract can sit over SQLite/event history and then a hosted service. The migration boundary is storage, not the product ontology.

The parser migrates schema-v1 through schema-v3 workspaces into schema v4 in memory, including the durable request lifecycle and optional visual-copy projection. Existing fields are marked as already onboarded, so an upgrade preserves their cards and does not replay first run.
