import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Bot, FileText, Lightbulb, MessageCircleQuestion, Quote } from "lucide-react";

import type { FieldCard, Source } from "../shared/workspace.ts";
import type { PatternSignal } from "../sensemaking.ts";
import { getCardDisplayCopy, getCompactLabel } from "../presentation-copy.ts";

export type FieldNodeData = {
  card: FieldCard;
  source?: Source;
  signal?: PatternSignal;
};

export type FieldNode = Node<FieldNodeData, "fieldCard">;

const kindIcons = {
  evidence: Quote,
  observation: FileText,
  pattern: Lightbulb,
  question: MessageCircleQuestion,
};

const attributionLabels = {
  participant: "Participant",
  research_team: "Research context",
  mixed_exchange: "Mixed voices",
  external_artifact: "External evidence",
} as const;

export function FieldCardNode({ data, selected }: NodeProps<FieldNode>) {
  const { card, source, signal } = data;
  const Icon = kindIcons[card.kind];
  const display = getCardDisplayCopy(card);
  const sourceLabel = source ? getCompactLabel(source.title, 42) : "Needs a source";
  const attributionLabel = card.kind === "evidence"
    ? card.evidenceAttribution
      ? attributionLabels[card.evidenceAttribution.role]
      : "Attribution needed"
    : "";
  const provenanceTitle = [
    attributionLabel,
    card.sourceRef?.speakerLabel ? `Speaker: ${card.sourceRef.speakerLabel}` : undefined,
    source?.title ?? "Needs a source",
    card.sourceRef?.locator,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`field-card field-card--${card.kind}${selected ? " is-selected" : ""}`}
      data-created-by={card.createdBy}
      aria-label={`${card.kind}: ${display.title}`}
    >
      <Handle className="field-handle field-handle--target" id="top" type="target" position={Position.Top} />
      <Handle className="field-handle field-handle--target" id="right" type="target" position={Position.Right} />
      <Handle className="field-handle field-handle--target" id="bottom" type="target" position={Position.Bottom} />
      <Handle className="field-handle field-handle--target" id="left" type="target" position={Position.Left} />
      <Handle className="field-handle" id="top" type="source" position={Position.Top} />
      <Handle className="field-handle" id="right" type="source" position={Position.Right} />
      <Handle className="field-handle" id="bottom" type="source" position={Position.Bottom} />
      <Handle className="field-handle" id="left" type="source" position={Position.Left} />
      <header className="field-card__meta">
        <span className="field-card__kind">
          <Icon aria-hidden="true" size={13} strokeWidth={1.8} />
          {card.kind}
        </span>
        {card.createdBy === "agent" && (
          <span className="field-card__agent" title="Suggested by an agent">
            <Bot aria-hidden="true" size={13} />
            agent
          </span>
        )}
      </header>
      <h2 title={card.title}>{display.title}</h2>
      <p title={card.body}>{display.summary}</p>
      {card.kind === "evidence" && (
        <footer className={source ? "" : "needs-source"} title={provenanceTitle}>
          <span className={`evidence-attribution-tag evidence-attribution-tag--${card.evidenceAttribution?.role ?? "unreviewed"}`}>
            {attributionLabel}
          </span>
          {card.sourceRef?.speakerLabel ? `${getCompactLabel(card.sourceRef.speakerLabel, 18)} · ` : ""}{sourceLabel}
        </footer>
      )}
      {card.kind === "pattern" && signal && (
        <footer className="pattern-signal">
          <span>{signal.status}</span>
          {signal.status === "unreviewed"
            ? `${signal.attributionPendingCount} attribution · ${signal.researchContextCount} context`
            : `${signal.evidenceCount} evidence · ${signal.sourceCount} ${signal.sourceCount === 1 ? "source" : "sources"} · ${signal.contradictionCount} contrary`}
        </footer>
      )}
    </article>
  );
}
