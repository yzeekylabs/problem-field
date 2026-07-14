# Problem Field

Problem Field is a local-first visual workspace for making sense of messy problem spaces. It keeps source material, excerpts, observations, patterns, questions, and relationships in one agent-readable model so the visual canvas and the AI never become competing sources of truth.

This is an early working slice, built to answer one question: **does it feel materially better to think with evidence and an agent on the same spatial surface?**

## What works now

- Arrange typed cards on an infinite canvas and connect them.
- Paste or load text/Markdown source material locally.
- Keep evidence visibly distinct from observations, patterns, and questions.
- Preserve source provenance on evidence cards.
- Ask a question from the canvas and place it in an agent queue.
- Let Codex or Claude Code read and safely update the same workspace through a validated CLI.
- Reject stale concurrent updates instead of silently overwriting them.

## Run it

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Use it with Codex or Claude Code

Start the coding agent in this repository and ask it to inspect or work on the field. `AGENTS.md` and `CLAUDE.md` explain the protocol. The core commands are:

```bash
npm run field -- context
npm run field -- requests
npm run field -- apply work/agent-ops.json
```

Agents must use the CLI rather than editing `data/workspace.json` directly. Every mutation is schema-validated, revision-checked, locked, and atomically written.

## Product boundary

This is not a general whiteboard and not an automatic mind-map generator. The first wedge is evidence-backed problem sensemaking: moving between raw material and emerging interpretation without losing where an idea came from.

See [docs/product.md](docs/product.md) and [docs/architecture.md](docs/architecture.md).

## Status

Local-only, single-user prototype. Source ingestion, multimodal extraction, live agent streaming, collaboration, and hosted sync are deliberately deferred until the core thinking loop proves useful.
