import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import { FileUp, Plug } from "lucide-react";

import { ApiError, getWorkspace, importSourceFile, postOperations } from "./api.ts";
import { FieldDock } from "./components/FieldDock.tsx";
import { ConnectorLibrary } from "./components/ConnectorLibrary.tsx";
import { FieldCardNode, type FieldNode } from "./components/FieldCardNode.tsx";
import { FieldLogo } from "./components/FieldLogo.tsx";
import { FirstRun, type BootstrapInput } from "./components/FirstRun.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { SourceModal } from "./components/SourceModal.tsx";
import { getPatternSignal } from "./sensemaking.ts";
import { inferSourceKind } from "./source-files.ts";
import type {
  CardKind,
  FieldOperation,
  FieldStage,
  Source,
  Workspace,
} from "./shared/workspace.ts";

const nodeTypes = { fieldCard: FieldCardNode };

function workspaceToNodes(workspace: Workspace): FieldNode[] {
  return workspace.cards.map((card) => ({
    id: card.id,
    type: "fieldCard",
    position: card.position,
    data: {
      card,
      source: workspace.sources.find((source) => source.id === card.sourceRef?.sourceId),
      ...(card.kind === "pattern" ? { signal: getPatternSignal(workspace, card.id) } : {}),
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
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    className: `field-edge field-edge--${connection.kind}`,
  }));
}

function starterCopy(kind: CardKind) {
  switch (kind) {
    case "evidence":
      return { title: "Unlinked evidence", body: "Paste an exact excerpt or observable fact, then link its source." };
    case "observation":
      return { title: "New observation", body: "What do you notice in the evidence—without claiming a pattern yet?" };
    case "pattern":
      return { title: "Possible pattern", body: "What interpretation seems to connect multiple observations or evidence points?" };
    case "question":
      return { title: "Open question", body: "What alternative, contradiction, or missing context would change the frame?" };
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
  const [connectorLibraryOpen, setConnectorLibraryOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | undefined>();
  const [dragActive, setDragActive] = useState(false);

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
        const next = await postOperations({ baseRevision: workspace.revision, actor: "human", operations });
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

  const importFile = useCallback(async (source: Source, file: File) => {
    if (!workspace || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await importSourceFile(workspace.revision, file, {
        title: source.title,
        kind: source.kind,
        ...(source.origin ? { origin: source.origin } : {}),
        ...(source.summary ? { summary: source.summary } : {}),
      });
      setWorkspace(next);
      setNodes(workspaceToNodes(next));
      const textLike = file.type.startsWith("text/") || /\.(txt|md|json|csv|tsv)$/i.test(file.name);
      setNotice(textLike ? "Source added to the field" : "Source added; extraction queued for a coding agent");
    } catch (importError) {
      if (importError instanceof ApiError && importError.status === 409) await load(true);
      setError(importError instanceof Error ? importError.message : "The source could not be imported.");
    } finally {
      setBusy(false);
    }
  }, [busy, load, workspace]);

  const bootstrapField = useCallback(async (input: BootstrapInput) => {
    if (!workspace || busy) return;
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const operations: FieldOperation[] = [
        {
          type: "updateProject",
          patch: {
            name: input.name,
            question: input.question,
            activeStage: "forage",
            onboardingComplete: true,
          },
        },
        ...(input.context
          ? [{
              type: "addSource" as const,
              source: {
                id: `source-${crypto.randomUUID()}`,
                title: "Starting context",
                kind: "note" as const,
                origin: "First-run setup",
                summary: input.context,
                extraction: { status: "ready" as const, method: "human-context", updatedAt: now },
                importedAt: now,
              },
            }]
          : []),
      ];

      let next = await postOperations({
        baseRevision: workspace.revision,
        actor: "human",
        operations,
      });

      for (const file of input.files) {
        next = await importSourceFile(next.revision, file, {
          title: file.name.replace(/\.[^.]+$/, ""),
          kind: inferSourceKind(file),
        });
      }

      setWorkspace(next);
      setNodes(workspaceToNodes(next));
      setNotice(input.files.length || input.context ? "Field opened with your starting material" : "Field opened");
    } catch (bootstrapError) {
      await load(true);
      setError(bootstrapError instanceof Error ? bootstrapError.message : "The field could not be opened.");
    } finally {
      setBusy(false);
    }
  }, [busy, load, workspace]);

  const edges = useMemo(() => (workspace ? workspaceToEdges(workspace) : []), [workspace]);
  const selectedCard = workspace?.cards.find((card) => card.id === selectedCardId) ?? null;
  const selectedSignal = workspace && selectedCard?.kind === "pattern"
    ? getPatternSignal(workspace, selectedCard.id)
    : undefined;

  const onNodesChange = useCallback((changes: NodeChange<FieldNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    void mutate(
      [{
        type: "addConnection",
        connection: {
          id: `connection-${crypto.randomUUID()}`,
          from: connection.source,
          to: connection.target,
          kind: "relates",
          label: "relates to",
        },
      }],
      "Relationship added",
    );
  }, [mutate]);

  function addCard(kind: CardKind) {
    if (!workspace) return;
    const copy = starterCopy(kind);
    const offset = workspace.cards.length * 37;
    void mutate([{
      type: "addCard",
      card: {
        id: `card-${crypto.randomUUID()}`,
        kind,
        ...copy,
        position: { x: 360 + (offset % 520), y: 180 + (offset % 340) },
        createdBy: "human",
      },
    }]);
  }

  async function queueAgentRequest(prompt: string) {
    await mutate(
      [{
        type: "addAgentRequest",
        request: {
          id: `request-${crypto.randomUUID()}`,
          prompt,
          scopeCardIds: selectedCardId ? [selectedCardId] : [],
        },
      }],
      "Agent queued — progress is visible in the review panel",
    );
  }

  async function copyRequestCommand(requestId: string) {
    const command = `npm run field -- context ${requestId}`;
    await navigator.clipboard.writeText(command);
    setNotice(`Copied: ${command}`);
  }

  function openSourceModal(file?: File) {
    setDroppedFile(file);
    setSourceModalOpen(true);
  }

  if (!workspace) {
    return (
      <main className="loading-screen">
        <FieldLogo className="loading-mark" />
        <h1>Opening the field</h1>
        <p>{error ?? "Loading the canonical workspace…"}</p>
        {error && <button onClick={() => void load()} type="button">Try again</button>}
      </main>
    );
  }

  const evidenceCount = workspace.cards.filter((card) => card.kind === "evidence").length;
  const patternCount = workspace.cards.filter((card) => card.kind === "pattern").length;

  return (
    <main
      className={`app-shell${dragActive ? " is-dragging" : ""}`}
      onDragEnter={(event) => {
        if (!workspace.project.onboardingComplete) return;
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        if (!workspace.project.onboardingComplete) return;
        const file = event.dataTransfer.files[0];
        if (file) openSourceModal(file);
      }}
    >
      <section className="canvas-shell" aria-label="Problem field canvas">
        <ReactFlow
          colorMode="light"
          deleteKeyCode={null}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.22, maxZoom: 0.95 }}
          maxZoom={1.6}
          minZoom={0.2}
          nodeTypes={nodeTypes}
          nodes={nodes}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedCardId(node.id)}
          onNodeDragStop={(_, node) => void mutate([
            { type: "moveCards", positions: [{ cardId: node.id, position: node.position }] },
          ])}
          onNodesChange={onNodesChange}
          onPaneClick={() => setSelectedCardId(null)}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#c9c6b8" gap={28} size={1} variant={BackgroundVariant.Dots} />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>

        {workspace.project.onboardingComplete && (
          <>
            <header className="project-chip">
              <FieldLogo className="project-chip__mark" />
              <div><strong>{workspace.project.name}</strong><span>{workspace.project.question}</span></div>
            </header>

            {(workspace.sources.length > 0 || workspace.cards.length > 0) && (
              <div className="field-summary" aria-label="Field composition">
                <span><strong>{workspace.sources.length}</strong> sources</span>
                <span><strong>{evidenceCount}</strong> evidence</span>
                <span><strong>{patternCount}</strong> patterns</span>
                <i className={busy ? "is-busy" : ""} title={busy ? "Saving" : `Saved locally · revision ${workspace.revision}`} />
              </div>
            )}

            <FieldDock
              busy={busy}
              onAddCard={addCard}
              onAddSource={() => openSourceModal()}
              onOpenConnectors={() => setConnectorLibraryOpen(true)}
              onAsk={queueAgentRequest}
              onCopyRequestCommand={(requestId) => void copyRequestCommand(requestId)}
              onReviewProposal={(proposalId, decision) => void mutate([
                { type: "reviewAgentProposal", proposalId, decision },
              ], decision === "accepted" ? "Interpretation placed on the field" : "Suggestion dismissed")}
              onSetStage={(stage: FieldStage) => void mutate([
                { type: "updateProject", patch: { activeStage: stage } },
              ])}
              onUpdateQuestion={(question) => void mutate([
                { type: "updateProject", patch: { question } },
              ], "Focus updated")}
              selectedTitle={selectedCard?.title}
              workspace={workspace}
            />
          </>
        )}

        {workspace.project.onboardingComplete && workspace.cards.length === 0 && (
          <section className="canvas-empty" aria-labelledby="empty-field-title">
            <span>Empty field</span>
            <h2 id="empty-field-title">
              {workspace.sources.length ? "Begin with one clear moment." : "Start with something that happened."}
            </h2>
            <p>
              {workspace.sources.length
                ? "Place an exact quote, behavior, or observable fact. You can interpret it once the evidence is visible."
                : "Bring in a call, note, screenshot, recording, or document. Build from evidence you can return to."}
            </p>
            <div>
              <button className="canvas-empty__primary" onClick={() => workspace.sources.length ? addCard("evidence") : openSourceModal()} type="button">
                {workspace.sources.length ? "Add first evidence" : "Add a source"}
              </button>
              {workspace.sources.length > 0 && (
                <button
                  onClick={() => void queueAgentRequest("Forage through the available sources and add only exact, source-linked evidence cards. Preserve quotes or observable details and locators; do not create observations or patterns yet.")}
                  type="button"
                >
                  Ask agent to forage
                </button>
              )}
              {workspace.sources.length === 0 && (
                <button onClick={() => setConnectorLibraryOpen(true)} type="button">
                  <Plug aria-hidden="true" size={15} /> Connect a workspace
                </button>
              )}
            </div>
          </section>
        )}

        {selectedCard && (
          <Inspector
            busy={busy}
            card={selectedCard}
            onClose={() => setSelectedCardId(null)}
            onDelete={(cardId) => {
              setSelectedCardId(null);
              void mutate([{ type: "deleteCard", cardId }], "Card removed");
            }}
            onSave={(cardId, title, body, sourceRef) => void mutate(
              [{ type: "updateCard", cardId, patch: { title, body, ...(sourceRef !== undefined ? { sourceRef } : {}) } }],
              "Card updated",
            )}
            signal={selectedSignal}
            sources={workspace.sources}
          />
        )}

        {(error || notice) && <div className={`toast ${error ? "toast--error" : ""}`}>{error ?? notice}</div>}
        {dragActive && (
          <div className="drop-overlay">
            <FileUp aria-hidden="true" size={24} />
            <strong>Bring this into the field</strong>
            <span>The raw file will stay local and separate from its interpretations.</span>
          </div>
        )}
        {!workspace.project.onboardingComplete && <FirstRun busy={busy} onSubmit={bootstrapField} />}
      </section>

      {sourceModalOpen && (
        <SourceModal
          busy={busy}
          initialFile={droppedFile}
          onClose={() => { setSourceModalOpen(false); setDroppedFile(undefined); }}
          onOpenConnectors={() => {
            setSourceModalOpen(false);
            setDroppedFile(undefined);
            setConnectorLibraryOpen(true);
          }}
          onCreate={async (source, file) => {
            if (file) await importFile(source, file);
            else await mutate([{ type: "addSource", source }], "Source added to the field");
            setSourceModalOpen(false);
            setDroppedFile(undefined);
          }}
        />
      )}

      {connectorLibraryOpen && <ConnectorLibrary onClose={() => setConnectorLibraryOpen(false)} />}
    </main>
  );
}
