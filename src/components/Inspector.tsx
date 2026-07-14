import { useState } from "react";
import { Bot, ExternalLink, Save, Trash2, X } from "lucide-react";

import type {
  CriterionLinkInput,
  DecisionFrame,
  EvidenceAttributionInput,
  FieldCard,
  Source,
} from "../shared/workspace.ts";
import type { PatternSignal } from "../sensemaking.ts";

type InspectorProps = {
  card: FieldCard | null;
  sources: Source[];
  activeDecisionFrame?: DecisionFrame;
  criterionLinks: CriterionLinkInput[];
  busy: boolean;
  signal?: PatternSignal;
  onClose: () => void;
  onDelete: (cardId: string) => void;
  onSave: (
    cardId: string,
    title: string,
    body: string,
    sourceRef?: FieldCard["sourceRef"] | null,
    criterionLinks?: CriterionLinkInput[],
    evidenceAttribution?: EvidenceAttributionInput | null,
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

  const criterionStateKey = props.criterionLinks
    .map((link) => `${link.criterionId}:${link.stance}`)
    .join("|");
  return (
    <InspectorForm
      key={`${card.id}:${card.updatedAt}:${props.activeDecisionFrame?.id ?? "unframed"}:${criterionStateKey}`}
      {...props}
      card={card}
    />
  );
}

function InspectorForm({
  card,
  sources,
  activeDecisionFrame,
  criterionLinks,
  busy,
  signal,
  onClose,
  onDelete,
  onSave,
}: InspectorProps & { card: FieldCard }) {
  const [title, setTitle] = useState(card.title);
  const [body, setBody] = useState(card.body);
  const [sourceId, setSourceId] = useState(card.sourceRef?.sourceId ?? "");
  const [locator, setLocator] = useState(card.sourceRef?.locator ?? "");
  const [quote, setQuote] = useState(card.sourceRef?.quote ?? "");
  const [criterionStances, setCriterionStances] = useState<Record<string, CriterionLinkInput["stance"] | "">>(
    () => Object.fromEntries(criterionLinks.map((link) => [link.criterionId, link.stance])),
  );
  const [attributionRole, setAttributionRole] = useState<EvidenceAttributionInput["role"] | "">(
    card.evidenceAttribution?.role ?? "",
  );
  const [speakerLabel, setSpeakerLabel] = useState(card.sourceRef?.speakerLabel ?? "");

  const source = sources.find((item) => item.id === sourceId);
  const sourceRef = sourceId
    ? {
        sourceId,
        ...(locator.trim() ? { locator: locator.trim() } : {}),
        ...(quote.trim() ? { quote: quote.trim() } : {}),
        ...(speakerLabel.trim() ? { speakerLabel: speakerLabel.trim() } : {}),
      }
    : null;
  const originalSourceRef = card.sourceRef
    ? {
        sourceId: card.sourceRef.sourceId,
        ...(card.sourceRef.locator ? { locator: card.sourceRef.locator } : {}),
        ...(card.sourceRef.quote ? { quote: card.sourceRef.quote } : {}),
        ...(card.sourceRef.speakerLabel ? { speakerLabel: card.sourceRef.speakerLabel } : {}),
      }
    : null;
  const evidenceAttribution: EvidenceAttributionInput | null = attributionRole
    ? { role: attributionRole }
    : null;
  const originalEvidenceAttribution: EvidenceAttributionInput | null = card.evidenceAttribution
    ? { role: card.evidenceAttribution.role }
    : null;
  const nextCriterionLinks = activeDecisionFrame?.criteria.flatMap((criterion) => {
    const stance = criterionStances[criterion.id];
    return stance ? [{ criterionId: criterion.id, stance }] : [];
  }) ?? [];

  const isDirty =
    title !== card.title ||
    body !== card.body ||
    JSON.stringify(sourceRef) !== JSON.stringify(originalSourceRef) ||
    JSON.stringify(nextCriterionLinks) !== JSON.stringify(criterionLinks) ||
    (card.kind === "evidence" && JSON.stringify(evidenceAttribution) !== JSON.stringify(originalEvidenceAttribution));

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
            {signal.status === "unreviewed" && "Connected material is still unreviewed, mixed, or research-team context. Confirm participant or external evidence before reading signal."}
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
              <label className="field-label" htmlFor="evidence-speaker-label">Diarized speaker <small>optional</small></label>
              <input
                id="evidence-speaker-label"
                onChange={(event) => setSpeakerLabel(event.target.value)}
                placeholder="e.g. Naomi or SPEAKER_01"
                value={speakerLabel}
              />
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

      {card.kind === "evidence" && (
        <section className="evidence-attribution">
          <div className="section-label">Evidence attribution</div>
          <p>Confirm who supplied this excerpt. Diarization can identify a speaker label; it does not establish whether that speaker is the participant or research team.</p>
          <label className="field-label" htmlFor="evidence-attribution-role">Whose voice or material?</label>
          <select
            id="evidence-attribution-role"
            onChange={(event) => setAttributionRole(event.target.value as EvidenceAttributionInput["role"] | "")}
            value={attributionRole}
          >
            <option value="">Not reviewed</option>
            <option value="participant">Participant or customer</option>
            <option value="research_team">Research team or interviewer</option>
            <option value="mixed_exchange">Mixed exchange</option>
            <option value="external_artifact">External artifact or behavioral record</option>
          </select>
          {!attributionRole && <small className="attribution-note">This card can stay in the field, but it will not influence signal or the current read until attribution is reviewed.</small>}
          {attributionRole === "research_team" && <small className="attribution-note">Research-team speech remains inspectable context and is excluded from directional signal.</small>}
          {attributionRole === "mixed_exchange" && <small className="attribution-note">Keep the exchange for context, then cut a participant-only excerpt before using it as directional evidence.</small>}
        </section>
      )}

      {activeDecisionFrame && card.kind !== "question" && (
        <section className="decision-relevance">
          <div className="section-label">Decision relevance</div>
          <p>Accept only links you can inspect and defend. Agent suggestions stay provisional until you set them here.</p>
          {(["continue", "reconsider"] as const).map((polarity) => (
            <div className="decision-relevance__group" key={polarity}>
              <span>{polarity === "continue" ? "Continue if" : "Reconsider if"}</span>
              {activeDecisionFrame.criteria
                .filter((criterion) => criterion.polarity === polarity)
                .map((criterion) => (
                  <label key={criterion.id}>
                    <strong>{criterion.statement}</strong>
                    <select
                      aria-label={`Relevance to ${criterion.statement}`}
                      onChange={(event) => setCriterionStances((current) => ({
                        ...current,
                        [criterion.id]: event.target.value as CriterionLinkInput["stance"] | "",
                      }))}
                      value={criterionStances[criterion.id] ?? ""}
                    >
                      <option value="">Not linked</option>
                      <option value="supports">Supports</option>
                      <option value="challenges">Challenges</option>
                    </select>
                  </label>
                ))}
            </div>
          ))}
        </section>
      )}

      <div className="inspector__actions">
        <button
          className="primary-button"
          disabled={busy || !isDirty || !title.trim()}
          onClick={() => onSave(
            card.id,
            title.trim(),
            body,
            card.kind === "evidence" ? sourceRef : undefined,
            nextCriterionLinks,
            card.kind === "evidence" ? evidenceAttribution : undefined,
          )}
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
