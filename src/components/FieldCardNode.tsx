import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Bot, FileText, Lightbulb, MessageCircleQuestion, Quote } from "lucide-react";

import type { FieldCard, Source } from "../shared/workspace.ts";
import type { PatternSignal } from "../sensemaking.ts";

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

export function FieldCardNode({ data, selected }: NodeProps<FieldNode>) {
  const { card, source, signal } = data;
  const Icon = kindIcons[card.kind];

  return (
    <article
      className={`field-card field-card--${card.kind}${selected ? " is-selected" : ""}`}
      data-created-by={card.createdBy}
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
      <h2>{card.title}</h2>
      <p>{card.body || "No detail yet."}</p>
      {card.kind === "evidence" && (
        <footer className={source ? "" : "needs-source"}>
          {source ? source.title : "Needs a source"}
          {card.sourceRef?.locator ? ` · ${card.sourceRef.locator}` : ""}
        </footer>
      )}
      {card.kind === "pattern" && signal && (
        <footer className="pattern-signal">
          <span>{signal.status}</span>
          {signal.evidenceCount} evidence · {signal.sourceCount} {signal.sourceCount === 1 ? "source" : "sources"} · {signal.contradictionCount} contrary
        </footer>
      )}
    </article>
  );
}
