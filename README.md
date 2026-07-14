# Problem Field

Problem Field is a local-first visual workspace for making sense of messy problem spaces. It keeps source material, excerpts, observations, patterns, questions, and relationships in one agent-readable model so the visual canvas and the AI never become competing sources of truth.

This is an early working slice, built to answer one question: **does it feel materially better to learn evidence-backed problem sensemaking with the sources, spatial field, and agent on one surface?**

## What works now

- Work through an opinionated but recursive Field Loop: Orient, Forage, Cluster, Frame, Test, Decide.
- Open on a blank field and bootstrap it with one focus, optional context, and starting files.
- Arrange typed cards on an infinite canvas and connect them.
- Drag in text, image, PDF, audio, or video files locally.
- Keep evidence visibly distinct from observations, patterns, and questions.
- Preserve source provenance on evidence cards.
- See pattern signal as evidence/source/contradiction composition rather than a fake score.
- Ask a question from the canvas and have the local runner claim, execute, and report it through Codex.
- Let Codex or Claude Code propose patterns and questions for explicit human review.
- Reuse the selected Codex or Claude Code host's MCP configuration and connect low-friction sources without storing a second auth registry.
- Reject stale concurrent updates instead of silently overwriting them.

## Run it

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Local agent and CLI

The API starts a single local worker. Canvas requests move through `queued`, `running`, `completed`, or `failed`; progress and the final response remain visible in Agent review. Codex is the default runtime. Set `FIELD_AGENT_PROVIDER=claude` before `npm run dev` to use Claude Code instead.

`AGENTS.md` and `CLAUDE.md` explain the shared write protocol. The core diagnostic and manual fallback commands are:

```bash
npm run field -- context
npm run field -- requests
npm run field -- apply work/agent-ops.json
```

Agents must use the CLI rather than editing workspace JSON directly. Every mutation is schema-validated, revision-checked, locked, and atomically written.

The connector library reads the selected agent host: structured `codex mcp list --json` inventory for Codex, or known catalog entries via `claude mcp get` for Claude Code. Codex desktop, CLI, and IDE share Codex configuration; Claude subprocesses inherit Claude Code's user-scoped configuration. The app therefore does not maintain another connector registry. New OAuth connections are written to the selected host only after a user clicks Connect. Connected content becomes a canonical source snapshot with connector, resource, and retrieval provenance when the agent imports it.

Your runtime workspace and imported assets live under gitignored `data/local/`. The checked-in `data/workspace.json` is only the blank public seed.

## Product boundary

This is not a general whiteboard and not an automatic mind-map generator. The first wedge is evidence-backed problem sensemaking: moving between raw material and emerging interpretation without losing where an idea came from.

See [docs/product.md](docs/product.md), [docs/research-foundation.md](docs/research-foundation.md), and [docs/architecture.md](docs/architecture.md).

## Status

Local-only, single-user prototype. Agent progress is durable but not token-streamed. Collaboration and hosted sync are deliberately deferred until the core thinking loop proves useful.
