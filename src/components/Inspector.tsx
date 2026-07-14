import { useState } from "react";
import { Bot, ExternalLink, Save, Trash2, X } from "lucide-react";

import type { FieldCard, Source } from "../shared/workspace.ts";
import type { PatternSignal } from "../sensemaking.ts";

type InspectorProps = {
  card: FieldCard | null;
  sources: Source[];
  busy: boolean;
  signal?: PatternSignal;
  onClose: () => void;
  onDelete: (cardId: string) => void;
  onSave: (
    cardId: string,
    title: string,
    body: string,
    sourceRef?: FieldCard["sourceRef"] | null,
  ) => void;
};

export function Inspector(props: InspectorProps) {
  const { card } = props;
  if (!card) {
    return (
      <aside className="inspector inspector--empty">
        <div className="inspector__empty-mark" />
        <h2>Select something in the field</h2>
        <p>Inspect its meaning, provenance, and relationship to the problem.</p>
      </aside>
    );
  }

  return <InspectorForm key={`${card.id}:${card.updatedAt}`} {...props} card={card} />;
}

function InspectorForm({ card, sources, busy, signal, onClose, onDelete, onSave }: InspectorProps & { card: FieldCard }) {
  const [title, setTitle] = useState(card.title);
  const [body, setBody] = useState(card.body);
  const [sourceId, setSourceId] = useState(card.sourceRef?.sourceId ?? "");
  const [locator, setLocator] = useState(card.sourceRef?.locator ?? "");
  const [quote, setQuote] = useState(card.sourceRef?.quote ?? "");

  const source = sources.find((item) => item.id === sourceId);
  const sourceRef = sourceId
    ? {
        sourceId,
        ...(locator.trim() ? { locator: locator.trim() } : {}),
        ...(quote.trim() ? { quote: quote.trim() } : {}),
      }
    : null;
  const originalSourceRef = card.sourceRef ?? null;

  const isDirty =
    title !== card.title ||
    body !== card.body ||
    JSON.stringify(sourceRef) !== JSON.stringify(originalSourceRef);

  return (
    <aside className="inspector">
      <header className="inspector__header">
        <span className={`kind-pill kind-pill--${card.kind}`}>{card.kind}</span>
        <button aria-label="Close inspector" className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={17} />
        </button>
      </header>

      {card.createdBy === "agent" && (
        <div className="agent-attribution">
          <Bot aria-hidden="true" size={15} />
          Proposed by an agent and accepted into the field. You still own the interpretation.
        </div>
      )}

      {card.kind === "pattern" && signal && (
        <section className="signal-panel">
          <header><span>Signal composition</span><strong>{signal.status}</strong></header>
          <div>
            <span><strong>{signal.evidenceCount}</strong> evidence</span>
            <span><strong>{signal.sourceCount}</strong> sources</span>
            <span><strong>{signal.contradictionCount}</strong> contrary</span>
          </div>
          <p>
            {signal.status === "seed" && "A useful lead, but still narrow. Add independent sources before treating recurrence as dependable."}
            {signal.status === "emerging" && "The pattern crosses sources. Keep testing consequences, segment concentration, and alternatives."}
            {signal.status === "grounded" && "The field contains repeated, cross-source support. This is still an interpretation, not statistical proof."}
            {signal.status === "contested" && "Contrary material is attached. Compare explanations instead of averaging the disagreement away."}
          </p>
        </section>
      )}

      <label className="field-label" htmlFor="card-title">
        Title
      </label>
      <input
        id="card-title"
        maxLength={240}
        onChange={(event) => setTitle(event.target.value)}
        value={title}
      />

      <label className="field-label" htmlFor="card-body">
        Detail
      </label>
      <textarea
        id="card-body"
        onChange={(event) => setBody(event.target.value)}
        rows={8}
        value={body}
      />

      {card.kind === "evidence" && (
        <section className="provenance">
          <div className="section-label">Provenance</div>
          <label className="field-label" htmlFor="evidence-source">Source</label>
          <select
            id="evidence-source"
            onChange={(event) => setSourceId(event.target.value)}
            value={sourceId}
          >
            <option value="">Not linked yet</option>
            {sources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          {source ? (
            <>
              <h3>{source.title}</h3>
              <p>{source.origin}</p>
              <label className="field-label" htmlFor="evidence-locator">Where in the source?</label>
              <input
                id="evidence-locator"
                onChange={(event) => setLocator(event.target.value)}
                placeholder="12:40 · onboarding discussion"
                value={locator}
              />
              <label className="field-label" htmlFor="evidence-quote">Exact excerpt</label>
              <textarea
                id="evidence-quote"
                onChange={(event) => setQuote(event.target.value)}
                placeholder="Paste the exact words or observation…"
                rows={4}
                value={quote}
              />
              {quote && <blockquote>“{quote}”</blockquote>}
              <button className="text-button" disabled type="button">
                Full source reader is next <ExternalLink aria-hidden="true" size={13} />
              </button>
            </>
          ) : (
            <p className="warning-text">This evidence is not linked to a source yet.</p>
          )}
        </section>
      )}

      <div className="inspector__actions">
        <button
          className="primary-button"
          disabled={busy || !isDirty || !title.trim()}
          onClick={() => onSave(card.id, title.trim(), body, card.kind === "evidence" ? sourceRef : undefined)}
          type="button"
        >
          <Save aria-hidden="true" size={15} />
          Save
        </button>
        <button
          className="danger-button"
          disabled={busy}
          onClick={() => onDelete(card.id)}
          type="button"
        >
          <Trash2 aria-hidden="true" size={15} />
          Remove
        </button>
      </div>
    </aside>
  );
}
