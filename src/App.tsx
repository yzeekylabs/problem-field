import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  addEdge,
  applyNodeChanges,
  type Connection,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import { Eye, HelpCircle, Lightbulb, Plus, Quote, Sparkles } from "lucide-react";

import { ApiError, getWorkspace, postOperations } from "./api.ts";
import { AgentComposer } from "./components/AgentComposer.tsx";
import { FieldCardNode, type FieldNode } from "./components/FieldCardNode.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { SourceModal } from "./components/SourceModal.tsx";
import type {
  CardKind,
  FieldOperation,
  Workspace,
} from "./shared/workspace.ts";

const nodeTypes = { fieldCard: FieldCardNode };

const kindLabels: Array<{ kind: CardKind; label: string; icon: typeof Quote }> = [
  { kind: "evidence", label: "Evidence", icon: Quote },
  { kind: "observation", label: "Observation", icon: Eye },
  { kind: "pattern", label: "Pattern", icon: Lightbulb },
  { kind: "question", label: "Question", icon: HelpCircle },
];

function workspaceToNodes(workspace: Workspace): FieldNode[] {
  return workspace.cards.map((card) => ({
    id: card.id,
    type: "fieldCard",
    position: card.position,
    data: {
      card,
      source: workspace.sources.find((source) => source.id === card.sourceRef?.sourceId),
    },
  }));
}

function workspaceToEdges(workspace: Workspace): Edge[] {
  return workspace.connections.map((connection) => ({
    id: connection.id,
    source: connection.from,
    target: connection.to,
    label: connection.label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
    className: `field-edge field-edge--${connection.kind}`,
  }));
}

function starterCopy(kind: CardKind) {
  switch (kind) {
    case "evidence":
      return { title: "Unlinked evidence", body: "Paste an exact quote or describe what was observed, then link its source." };
    case "observation":
      return { title: "New observation", body: "What do you notice in the evidence?" };
    case "pattern":
      return { title: "Possible pattern", body: "What seems to repeat across multiple observations?" };
    case "question":
      return { title: "Open question", body: "What remains uncertain or unsupported?" };
  }
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [nodes, setNodes] = useState<FieldNode[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    try {
      const next = await getWorkspace();
      setWorkspace((current) => {
        if (!current || current.revision !== next.revision) setNodes(workspaceToNodes(next));
        return next;
      });
      if (!quiet) setError(null);
    } catch (loadError) {
      if (!quiet) setError(loadError instanceof Error ? loadError.message : "Could not load the field.");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(true), 3_000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const mutate = useCallback(
    async (operations: FieldOperation[], successMessage?: string) => {
      if (!workspace || busy) return;
      setBusy(true);
      setError(null);
      try {
        const next = await postOperations({
          baseRevision: workspace.revision,
          actor: "human",
          operations,
        });
        setWorkspace(next);
        setNodes(workspaceToNodes(next));
        if (successMessage) setNotice(successMessage);
      } catch (mutationError) {
        if (mutationError instanceof ApiError && mutationError.status === 409) {
          await load(true);
          setError("The field changed in another process. It has been refreshed; try your change again.");
        } else {
          setError(mutationError instanceof Error ? mutationError.message : "The field could not be updated.");
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, load, workspace],
  );

  const edges = useMemo(() => (workspace ? workspaceToEdges(workspace) : []), [workspace]);
  const selectedCard = workspace?.cards.find((card) => card.id === selectedCardId) ?? null;

  const onNodesChange = useCallback((changes: NodeChange<FieldNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const id = `connection-${crypto.randomUUID()}`;
      void mutate(
        [
          {
            type: "addConnection",
            connection: {
              id,
              from: connection.source,
              to: connection.target,
              kind: "relates",
              label: "relates to",
            },
          },
        ],
        "Relationship added",
      );
      addEdge(connection, edges);
    },
    [edges, mutate],
  );

  function addCard(kind: CardKind) {
    if (!workspace) return;
    const copy = starterCopy(kind);
    const offset = workspace.cards.length * 34;
    void mutate([
      {
        type: "addCard",
        card: {
          id: `card-${crypto.randomUUID()}`,
          kind,
          ...copy,
          position: { x: 320 + (offset % 420), y: 120 + (offset % 300) },
          createdBy: "human",
        },
      },
    ]);
  }

  async function queueAgentRequest(prompt: string) {
    const requestId = `request-${crypto.randomUUID()}`;
    await mutate(
      [
        {
          type: "addAgentRequest",
          request: {
            id: requestId,
            prompt,
            scopeCardIds: selectedCardId ? [selectedCardId] : [],
          },
        },
      ],
      "Question queued. Open Codex or Claude Code in this repo to work it.",
    );
  }

  async function copyRequestCommand(requestId: string) {
    const command = `npm run field -- context ${requestId}`;
    await navigator.clipboard.writeText(command);
    setNotice(`Copied: ${command}`);
  }

  if (!workspace) {
    return (
      <main className="loading-screen">
        <div className="loading-mark"><Sparkles aria-hidden="true" size={20} /></div>
        <h1>Opening the field</h1>
        <p>{error ?? "Loading the canonical workspace…"}</p>
        {error && <button onClick={() => void load()} type="button">Try again</button>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark"><Sparkles aria-hidden="true" size={16} /></div>
          <div>
            <strong>{workspace.project.name}</strong>
            <span>problem sensemaking</span>
          </div>
        </div>

        <nav className="add-tools" aria-label="Add to field">
          {kindLabels.map(({ kind, label, icon: Icon }) => (
            <button key={kind} onClick={() => addCard(kind)} type="button">
              <Icon aria-hidden="true" size={14} />
              {label}
            </button>
          ))}
          <button className="add-tools__more" onClick={() => setSourceModalOpen(true)} type="button">
            <Plus aria-hidden="true" size={14} />
            Source
          </button>
        </nav>

        <div className="sync-status">
          <span className={busy ? "is-busy" : ""} />
          {busy ? "Saving" : `Local · rev ${workspace.revision}`}
        </div>
      </header>

      <div className="workspace-grid">
        <Sidebar
          onCopyRequestCommand={(requestId) => void copyRequestCommand(requestId)}
          onSelectCard={setSelectedCardId}
          selectedCardId={selectedCardId}
          workspace={workspace}
        />

        <section className="canvas-shell" aria-label="Problem field canvas">
          <ReactFlow
            colorMode="light"
            deleteKeyCode={null}
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            maxZoom={1.6}
            minZoom={0.25}
            nodeTypes={nodeTypes}
            nodes={nodes}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedCardId(node.id)}
            onNodeDragStop={(_, node) =>
              void mutate([
                { type: "moveCards", positions: [{ cardId: node.id, position: node.position }] },
              ])
            }
            onNodesChange={onNodesChange}
            onPaneClick={() => setSelectedCardId(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#d5d8d5" gap={24} size={1} variant={BackgroundVariant.Dots} />
            <Controls position="bottom-right" showInteractive={false} />
          </ReactFlow>
          <div className="canvas-legend" aria-label="Card type legend">
            {kindLabels.map(({ kind, label }) => (
              <span key={kind}><i className={`kind-dot kind-dot--${kind}`} />{label}</span>
            ))}
          </div>
          <AgentComposer
            busy={busy}
            onSubmit={queueAgentRequest}
            selectedTitle={selectedCard?.title}
          />
          {(error || notice) && (
            <div className={`toast ${error ? "toast--error" : ""}`}>{error ?? notice}</div>
          )}
        </section>

        <Inspector
          busy={busy}
          card={selectedCard}
          onClose={() => setSelectedCardId(null)}
          onDelete={(cardId) => {
            setSelectedCardId(null);
            void mutate([{ type: "deleteCard", cardId }], "Card removed");
          }}
          onSave={(cardId, title, body, sourceRef) =>
            void mutate(
              [{
                type: "updateCard",
                cardId,
                patch: { title, body, ...(sourceRef !== undefined ? { sourceRef } : {}) },
              }],
              "Card updated",
            )
          }
          sources={workspace.sources}
        />
      </div>
      {sourceModalOpen && (
        <SourceModal
          busy={busy}
          onClose={() => setSourceModalOpen(false)}
          onCreate={async (source) => {
            await mutate([{ type: "addSource", source }], "Source added to the field");
            setSourceModalOpen(false);
          }}
        />
      )}
    </main>
  );
}
