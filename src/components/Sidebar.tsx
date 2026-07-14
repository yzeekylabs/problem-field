import { Bot, ChevronRight, Database, FileText, Layers3 } from "lucide-react";

import type { Workspace } from "../shared/workspace.ts";

type SidebarProps = {
  workspace: Workspace;
  selectedCardId: string | null;
  onSelectCard: (cardId: string) => void;
  onCopyRequestCommand: (requestId: string) => void;
};

export function Sidebar({
  workspace,
  selectedCardId,
  onSelectCard,
  onCopyRequestCommand,
}: SidebarProps) {
  const openRequests = workspace.agentRequests.filter((request) => request.status === "queued" || request.status === "running");

  return (
    <aside className="sidebar">
      <section className="sidebar__section sidebar__project">
        <div className="section-label">
          <Layers3 aria-hidden="true" size={14} />
          Problem frame
        </div>
        <p>{workspace.project.question}</p>
      </section>

      <section className="sidebar__section">
        <div className="section-heading">
          <span className="section-label">
            <Database aria-hidden="true" size={14} />
            Sources
          </span>
          <span className="count-badge">{workspace.sources.length}</span>
        </div>
        <div className="source-list">
          {workspace.sources.map((source) => {
            const evidenceCount = workspace.cards.filter(
              (card) => card.sourceRef?.sourceId === source.id,
            ).length;
            return (
              <div className="source-row" key={source.id}>
                <span className="source-row__icon">
                  <FileText aria-hidden="true" size={15} />
                </span>
                <span>
                  <strong>{source.title}</strong>
                  <small>{evidenceCount} evidence cards</small>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sidebar__section sidebar__cards">
        <div className="section-heading">
          <span className="section-label">Field index</span>
          <span className="count-badge">{workspace.cards.length}</span>
        </div>
        <div className="card-index">
          {workspace.cards.map((card) => (
            <button
              className={selectedCardId === card.id ? "is-active" : ""}
              key={card.id}
              onClick={() => onSelectCard(card.id)}
              type="button"
            >
              <span className={`kind-dot kind-dot--${card.kind}`} />
              <span>{card.title}</span>
              <ChevronRight aria-hidden="true" size={14} />
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar__section sidebar__queue">
        <div className="section-heading">
          <span className="section-label">
            <Bot aria-hidden="true" size={14} />
            Agent queue
          </span>
          <span className="count-badge">{openRequests.length}</span>
        </div>
        {openRequests.length === 0 ? (
          <p className="empty-state">Ask the field a question to create a scoped agent task.</p>
        ) : (
          <div className="request-list">
            {openRequests.map((request) => (
              <button
                key={request.id}
                onClick={() => onCopyRequestCommand(request.id)}
                title="Copy the CLI command"
                type="button"
              >
                <span>{request.prompt}</span>
                <small>Click to copy CLI command</small>
              </button>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
