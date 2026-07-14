import { useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  Bot,
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Compass,
  Database,
  FileImage,
  FilePlus2,
  FileText,
  HelpCircle,
  LoaderCircle,
  Layers3,
  Lightbulb,
  Plus,
  Plug,
  Quote,
  Route,
  Save,
  X,
} from "lucide-react";

import { getAgentRunActivity } from "../api.ts";
import { fieldStages, getDecisionReadout, getNextMove } from "../sensemaking.ts";
import { getCardDisplayCopy, getCompactLabel } from "../presentation-copy.ts";
import type { AgentRunActivity } from "../shared/agent-activity.ts";
import type {
  CardKind,
  DecisionFrameInput,
  FieldStage,
  SourceResearchQualityInput,
  Workspace,
} from "../shared/workspace.ts";
import { DecisionFramePanel } from "./DecisionFramePanel.tsx";
import { SourceQualityEditor } from "./SourceQualityEditor.tsx";

export type DockView = "loop" | "add" | "sources" | "proposals" | null;

type FieldDockProps = {
  workspace: Workspace;
  busy: boolean;
  view: DockView;
  selectedTitle?: string;
  onAddCard: (kind: CardKind) => void;
  onAddSource: () => void;
  onOpenConnectors: () => void;
  onSelectCard: (cardId: string) => void;
  onAsk: (prompt: string) => Promise<void>;
  onViewChange: (view: DockView) => void;
  onSetDecisionFrame: (frame: DecisionFrameInput) => Promise<void>;
  onSetSourceResearchQuality: (sourceId: string, assessment: SourceResearchQualityInput | null) => Promise<void>;
  onSetStage: (stage: FieldStage) => void;
  onUpdateQuestion: (question: string) => void;
  onReviewProposal: (proposalId: string, decision: "accepted" | "dismissed") => void;
  onCopyRequestCommand: (requestId: string) => void;
};

const addOptions: Array<{
  kind: CardKind;
  label: string;
  description: string;
  icon: typeof Quote;
}> = [
  { kind: "evidence", label: "Evidence", description: "Something inspectable in a source", icon: Quote },
  { kind: "observation", label: "Observation", description: "What you notice in the evidence", icon: FileText },
  { kind: "pattern", label: "Pattern", description: "An interpretation across evidence", icon: Lightbulb },
  { kind: "question", label: "Question", description: "A gap, alternative, or uncertainty", icon: HelpCircle },
];

function elapsedLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function providerLabel(provider?: "codex" | "claude") {
  if (provider === "codex") return "Codex";
  if (provider === "claude") return "Claude Code";
  return "Agent";
}

function friendlyRunError(error?: string) {
  if (!error) return undefined;
  if (error === "The codex run exceeded 8 minutes.") {
    return "This earlier run reached the old eight-minute limit. Continue safely to resume from the current field with the new 15-minute runner.";
  }
  if (error === "The local API stopped before this run completed. Queue the request again to retry.") {
    return "This earlier run was interrupted by a local app restart. Continue safely to resume from the current field without duplicating completed work.";
  }
  return error;
}

export function FieldDock({
  workspace,
  busy,
  view,
  selectedTitle,
  onAddCard,
  onAddSource,
  onOpenConnectors,
  onSelectCard,
  onAsk,
  onViewChange,
  onSetDecisionFrame,
  onSetSourceResearchQuality,
  onSetStage,
  onUpdateQuestion,
  onReviewProposal,
  onCopyRequestCommand,
}: FieldDockProps) {
  const [prompt, setPrompt] = useState("");
  const [question, setQuestion] = useState(workspace.project.question);
  const [selectedSourceId, setSelectedSourceId] = useState(workspace.sources[0]?.id ?? "");
  const [runActivities, setRunActivities] = useState<Record<string, AgentRunActivity>>({});
  const [clock, setClock] = useState(() => Date.now());
  const nextMove = useMemo(() => getNextMove(workspace), [workspace]);
  const decisionReadout = useMemo(() => getDecisionReadout(workspace), [workspace]);
  const activeStage = fieldStages.find((stage) => stage.id === workspace.project.activeStage)!;
  const pendingProposals = workspace.agentProposals.filter((proposal) => proposal.status === "pending");
  const activeRequests = workspace.agentRequests.filter((request) => request.status === "queued" || request.status === "running");
  const recentRequests = [...workspace.agentRequests].reverse().slice(0, 4);
  const trackedRunKey = recentRequests.flatMap((request) => request.runId ? [request.runId] : []).join(",");
  const runningRunKey = activeRequests.flatMap((request) => request.runId ? [request.runId] : []).join(",");
  const effectiveSourceId = selectedSourceId || workspace.sources[0]?.id;
  const selectedSource = workspace.sources.find((source) => source.id === effectiveSourceId);

  useEffect(() => {
    const runIds = trackedRunKey ? trackedRunKey.split(",") : [];
    if (runIds.length === 0) return;
    let current = true;
    const refresh = async () => {
      const results = await Promise.all(runIds.map(async (runId) => {
        try {
          return [runId, await getAgentRunActivity(runId)] as const;
        } catch {
          return [runId, null] as const;
        }
      }));
      if (!current) return;
      setRunActivities((existing) => {
        const next = { ...existing };
        for (const [runId, activity] of results) {
          if (activity) next[runId] = activity;
        }
        return next;
      });
    };
    void refresh();
    const interval = runningRunKey ? window.setInterval(() => void refresh(), 1_500) : undefined;
    return () => {
      current = false;
      if (interval) window.clearInterval(interval);
    };
  }, [runningRunKey, trackedRunKey]);

  useEffect(() => {
    if (!runningRunKey) return;
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [runningRunKey]);

  async function submit(value = prompt) {
    const cleanPrompt = value.trim();
    if (!cleanPrompt || busy) return;
    await onAsk(cleanPrompt);
    setPrompt("");
  }

  function toggle(next: Exclude<DockView, null>) {
    if (next === "loop") setQuestion(workspace.project.question);
    if (next === "sources" && !selectedSourceId && workspace.sources[0]) {
      setSelectedSourceId(workspace.sources[0].id);
    }
    onViewChange(view === next ? null : next);
  }

  function runNextMove() {
    if (nextMove.action === "add-source") onAddSource();
    if (nextMove.action === "add-evidence") onAddCard("evidence");
    if (nextMove.action === "ask-agent" && nextMove.prompt) void submit(nextMove.prompt);
    if (nextMove.action === "review-proposals") onViewChange("proposals");
    if (nextMove.action === "review-attribution" && nextMove.cardId) onSelectCard(nextMove.cardId);
    if (nextMove.action === "change-stage") onSetStage(nextMove.stage);
    if (nextMove.action === "edit-frame") onViewChange("loop");
  }

  async function reviewDecisionFrame() {
    await onAsk("Review the active decision frame as decision-support, not as a verdict. Check whether the working hypothesis is specific and testable; whether each continue and reconsider criterion is observable, discriminating, and connected to the decision; and whether a plausible competing explanation or disconfirming condition is missing. Cite current card and source IDs where relevant. Do not edit the frame, set evidence links or source quality, or make the decision.");
    onViewChange("proposals");
  }

  async function reviewSourceQuality(sourceId: string, sourceTitle: string) {
    await onAsk(`Review source '${sourceTitle}' (${sourceId}) as decision-support material. Separate transcript fidelity, session evidence, and relevance to the active decision. Cite exact locators or exchanges. Preserve diarized speaker labels, but do not infer participant or research-team roles from labels alone. Keep research-team prompts and hypotheses separate from participant evidence. Flag leading, compound, abstract, or hypothetical prompts; speaker uncertainty; participant-fit gaps; and concrete recent behavior, consequences, or workarounds. Do not score the interviewer, set research quality, set evidence attribution, create criterion links, or make the decision.`);
    onViewChange("proposals");
  }

  return (
    <div className="dock-stack">
      {view === null && workspace.cards.length > 0 && (
        <aside className="next-move" aria-label="Suggested next move">
          <div className="next-move__mark"><Route aria-hidden="true" size={14} /></div>
          <div>
            <span>Next move · {fieldStages.find((stage) => stage.id === nextMove.stage)?.label}</span>
            <strong>{nextMove.title}</strong>
            <p>{nextMove.detail}</p>
          </div>
          <button disabled={busy} onClick={runNextMove} type="button">{nextMove.actionLabel}</button>
        </aside>
      )}

      {view && (
        <section className={`dock-sheet dock-sheet--${view}`} aria-label={`${view} panel`}>
          <header className="dock-sheet__header">
            <span>{view === "loop" ? "Decision and field loop" : view === "add" ? "Add to the field" : view === "sources" ? "Source library" : "Agent review"}</span>
            <button aria-label="Close panel" className="icon-button" onClick={() => onViewChange(null)} type="button">
              <X aria-hidden="true" size={16} />
            </button>
          </header>

          {view === "loop" && (
            <div className="loop-panel">
              <DecisionFramePanel
                busy={busy}
                key={workspace.decisionFrames?.at(-1)?.id ?? "unframed"}
                onReviewWithAgent={reviewDecisionFrame}
                onSave={onSetDecisionFrame}
                readout={decisionReadout}
                workspace={workspace}
              />
              <div className="loop-practice">
                <div className="stage-rail" role="list" aria-label="Sensemaking stages">
                  {fieldStages.map((stage, index) => (
                    <button
                      aria-current={stage.id === workspace.project.activeStage ? "step" : undefined}
                      className={stage.id === workspace.project.activeStage ? "is-active" : ""}
                      key={stage.id}
                      onClick={() => onSetStage(stage.id)}
                      type="button"
                    >
                      <span>{index + 1}</span>
                      <strong>{stage.label}</strong>
                      <small>{stage.verb}</small>
                    </button>
                  ))}
                </div>
                <div className="focus-editor">
                  <div>
                    <span>Active focus</span>
                    <p>{activeStage.description} The loop is recursive; move whenever the evidence asks you to.</p>
                  </div>
                  <label>
                    <span className="sr-only">Active problem question</span>
                    <textarea rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} />
                  </label>
                  <button
                    disabled={busy || !question.trim() || question.trim() === workspace.project.question}
                    onClick={() => onUpdateQuestion(question.trim())}
                    type="button"
                  >
                    <Save aria-hidden="true" size={14} /> Save focus
                  </button>
                </div>
              </div>
            </div>
          )}

          {view === "add" && (
            <div className="add-grid">
              <button className="add-grid__source" onClick={onAddSource} type="button">
                <FilePlus2 aria-hidden="true" size={18} />
                <span><strong>Source</strong><small>Call, note, image, audio, video, or document</small></span>
              </button>
              <button onClick={onOpenConnectors} type="button">
                <Plug aria-hidden="true" size={18} />
                <span><strong>Connected source</strong><small>Linear, Notion, Figma, Granola, or PostHog</small></span>
              </button>
              {addOptions.map(({ kind, label, description, icon: Icon }) => (
                <button key={kind} onClick={() => onAddCard(kind)} type="button">
                  <Icon aria-hidden="true" size={17} />
                  <span><strong>{label}</strong><small>{description}</small></span>
                </button>
              ))}
            </div>
          )}

          {view === "sources" && (
            <div className="source-browser">
              <div className="source-browser__list">
                <button className="source-browser__add" onClick={onAddSource} type="button">
                  <Plus aria-hidden="true" size={14} /> Add source
                </button>
                <button className="source-browser__connect" onClick={onOpenConnectors} type="button">
                  <Plug aria-hidden="true" size={14} /> Connect workspace
                </button>
                {workspace.sources.map((source) => (
                  <button
                    className={source.id === effectiveSourceId ? "is-active" : ""}
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    type="button"
                  >
                    {source.kind === "image" ? <FileImage aria-hidden="true" size={15} /> : <FileText aria-hidden="true" size={15} />}
                    <span><strong title={source.title}>{getCompactLabel(source.title)}</strong><small>{source.kind} · {workspace.cards.filter((card) => card.sourceRef?.sourceId === source.id).length} evidence</small></span>
                  </button>
                ))}
              </div>
              <div className="source-browser__preview">
                {selectedSource ? (
                  <>
                    <header><span>{selectedSource.kind}</span><strong>{selectedSource.title}</strong><small>{selectedSource.origin ?? selectedSource.asset?.originalName ?? (selectedSource.externalRef ? `${selectedSource.externalRef.connectorId} · retrieved ${new Date(selectedSource.externalRef.retrievedAt).toLocaleDateString()}` : "Local source")}</small></header>
                    <SourceQualityEditor
                      busy={busy}
                      key={`${selectedSource.id}:${selectedSource.researchQuality?.updatedAt ?? "new"}`}
                      onReviewWithAgent={() => reviewSourceQuality(selectedSource.id, selectedSource.title)}
                      onSave={(assessment) => onSetSourceResearchQuality(selectedSource.id, assessment)}
                      source={selectedSource}
                    />
                    {selectedSource.kind === "image" && selectedSource.asset && (
                      <img alt={selectedSource.title} src={`/api/assets/${encodeURIComponent(selectedSource.asset.fileName)}`} />
                    )}
                    {selectedSource.summary ? <pre>{selectedSource.summary}</pre> : (
                      <p>{selectedSource.extraction?.status === "queued" ? "Extraction is queued for the connected coding agent. The raw file remains the source of truth." : "No extracted text yet."}</p>
                    )}
                  </>
                ) : <p>Add a source to begin foraging.</p>}
              </div>
            </div>
          )}

          {view === "proposals" && (
            <div className="proposal-panel">
              <div className="proposal-panel__intro">
                <Bot aria-hidden="true" size={17} />
                <p>Agent interpretations stay outside the field until you accept them. Acceptance is explicit and reversible through version history.</p>
              </div>
              {pendingProposals.length === 0 ? (
                <div className="proposal-empty">
                  <strong>No provisional interpretations</strong>
                  <p>Ask for clusters or counter-evidence. Codex or Claude Code can answer through the shared CLI protocol.</p>
                </div>
              ) : pendingProposals.map((proposal) => {
                const display = getCardDisplayCopy(proposal.proposedCard);
                return (
                  <article className="proposal-card" key={proposal.id}>
                    <span>Proposed {proposal.kind} · {proposal.scopeCardIds.length} linked cards</span>
                    <h3 title={proposal.title}>{display.title}</h3>
                    <p title={proposal.rationale}>{display.summary}</p>
                    <div>
                      <button onClick={() => onReviewProposal(proposal.id, "dismissed")} type="button"><X aria-hidden="true" size={14} /> Dismiss</button>
                      <button className="proposal-card__accept" onClick={() => onReviewProposal(proposal.id, "accepted")} type="button"><Check aria-hidden="true" size={14} /> Place on field</button>
                    </div>
                  </article>
                );
              })}
              {recentRequests.length > 0 && (
                <div className="request-queue">
                  <span>Agent activity</span>
                  {recentRequests.map((request) => (
                    (() => {
                      const activity = request.runId ? runActivities[request.runId] : undefined;
                      const visibleEvents = activity
                        ? [...activity.events].sort((left, right) => left.at.localeCompare(right.at)).slice(-5)
                        : [];
                      const runElapsed = activity ? elapsedLabel(clock - Date.parse(activity.startedAt)) : undefined;
                      const updateElapsed = activity ? elapsedLabel(clock - Date.parse(activity.updatedAt)) : undefined;
                      const runError = friendlyRunError(request.error);
                      const result = request.response ?? runError;
                      const resultAlreadyVisible = Boolean(result && activity?.events.some((event) => event.detail === result));
                      return (
                        <article className={`agent-run agent-run--${request.status}`} key={request.id}>
                          <div className="agent-run__heading">
                            <div className="agent-run__status" aria-live="polite">
                              {request.status === "running" ? <LoaderCircle aria-hidden="true" className="connector-spinner" size={14} /> : request.status === "completed" ? <CheckCircle2 aria-hidden="true" size={14} /> : request.status === "failed" ? <AlertCircle aria-hidden="true" size={14} /> : <Bot aria-hidden="true" size={14} />}
                              <strong>{request.status === "running" ? `${providerLabel(request.provider)} is working` : request.status === "completed" ? "Completed" : request.status === "failed" ? "Needs attention" : "Queued"}</strong>
                            </div>
                            {activity && (
                              <small className="agent-run__timing">
                                {request.status === "running" ? `${runElapsed} elapsed · ${updateElapsed === "just now" ? "just updated" : `last milestone ${updateElapsed} ago`}` : `${runElapsed} total`}
                              </small>
                            )}
                          </div>

                          {visibleEvents.length > 0 ? (
                            <ol className="agent-run__timeline" aria-label="Agent run milestones">
                              {visibleEvents.map((event) => (
                                <li className={`agent-run__event agent-run__event--${event.state}`} key={event.id}>
                                  <span className="agent-run__event-icon">
                                    {event.state === "active" ? <LoaderCircle aria-hidden="true" className="connector-spinner" size={12} /> : event.state === "failed" ? <AlertCircle aria-hidden="true" size={12} /> : <Check aria-hidden="true" size={12} />}
                                  </span>
                                  <span>
                                    <strong>{event.label}</strong>
                                    {event.detail && <small>{event.detail}</small>}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          ) : request.status === "running" ? (
                            <div className="agent-run__waiting">
                              <LoaderCircle aria-hidden="true" className="connector-spinner" size={12} />
                              <span>Waiting for the first runner milestone…</span>
                            </div>
                          ) : null}

                          <p className="agent-run__task"><span>Task</span>{request.prompt}</p>
                          {result && !resultAlreadyVisible && <small className="agent-run__result">{result}</small>}
                          {request.status === "failed" && (
                            <div className="agent-run__actions">
                              <button disabled={busy} onClick={() => void submit(request.prompt)} type="button">
                                {runError?.includes("current field") ? "Continue safely" : "Retry"}
                              </button>
                              <button onClick={() => onCopyRequestCommand(request.id)} type="button">Copy manual fallback</button>
                            </div>
                          )}
                        </article>
                      );
                    })()
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="field-dock">
        <button aria-label={`Open field loop, current stage ${activeStage.label}`} className="dock-stage" onClick={() => toggle("loop")} type="button">
          <Compass aria-hidden="true" size={16} />
          <span><small>Loop</small><strong>{activeStage.label}</strong></span>
          <ChevronDown aria-hidden="true" size={13} />
        </button>
        <button aria-label="Add to field" className="dock-icon" onClick={() => toggle("add")} type="button">
          <Plus aria-hidden="true" size={18} />
        </button>
        <div className="dock-prompt">
          <input
            aria-label="Ask the field"
            disabled={busy}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
            placeholder="Ask what repeats, conflicts, or is still missing…"
            value={prompt}
          />
          <span>{selectedTitle ? `Looking at “${selectedTitle}”` : "Looking across the whole field"}</span>
        </div>
        <button aria-label="View sources" className="dock-icon dock-icon--count" onClick={() => toggle("sources")} type="button">
          <Database aria-hidden="true" size={17} /><small>{workspace.sources.length}</small>
        </button>
        {(pendingProposals.length > 0 || recentRequests.length > 0) && (
          <button aria-label="Review agent work" className="dock-icon dock-icon--count" onClick={() => toggle("proposals")} type="button">
            <Layers3 aria-hidden="true" size={17} />{(pendingProposals.length + activeRequests.length) > 0 && <small>{pendingProposals.length + activeRequests.length}</small>}
          </button>
        )}
        <button aria-label="Ask coding agent" className="dock-send" disabled={busy || !prompt.trim()} onClick={() => void submit()} type="button">
          <ArrowUp aria-hidden="true" size={17} />
        </button>
      </div>
    </div>
  );
}
