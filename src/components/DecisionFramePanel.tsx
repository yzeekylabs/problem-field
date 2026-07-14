import { useState } from "react";
import { Bot, Pencil, Plus, Save, Trash2 } from "lucide-react";

import type { DecisionReadout } from "../sensemaking.ts";
import {
  getActiveDecisionFrame,
  type DecisionCriterion,
  type DecisionFrameInput,
  type Workspace,
} from "../shared/workspace.ts";

type CriterionDraft = Pick<DecisionCriterion, "id" | "statement">;

type DecisionFramePanelProps = {
  workspace: Workspace;
  readout: DecisionReadout;
  busy: boolean;
  onSave: (frame: DecisionFrameInput) => Promise<void>;
  onReviewWithAgent: () => Promise<void>;
};

function initialCriteria(criteria: DecisionCriterion[], polarity: DecisionCriterion["polarity"]): CriterionDraft[] {
  const matching = criteria
    .filter((criterion) => criterion.polarity === polarity)
    .map(({ id, statement }) => ({ id, statement }));
  return matching.length > 0 ? matching : [{ id: `criterion-${crypto.randomUUID()}`, statement: "" }];
}

function criterionMeta(read: DecisionReadout["criterionReads"][number]) {
  if (read.status === "untested") return "No accepted evidence";
  if (read.status === "mixed") return `${read.supportCount} support · ${read.challengeCount} challenge`;
  if (read.status === "supported") return `${read.supportCount} support · ${read.sourceCount} ${read.sourceCount === 1 ? "source" : "sources"}`;
  return `${read.challengeCount} challenge · ${read.sourceCount} ${read.sourceCount === 1 ? "source" : "sources"}`;
}

export function DecisionFramePanel(props: DecisionFramePanelProps) {
  const frame = getActiveDecisionFrame(props.workspace);
  const [editing, setEditing] = useState(!frame);
  const [decision, setDecision] = useState(frame?.decision ?? "");
  const [hypothesis, setHypothesis] = useState(frame?.hypothesis ?? "");
  const [continueCriteria, setContinueCriteria] = useState(() => initialCriteria(frame?.criteria ?? [], "continue"));
  const [reconsiderCriteria, setReconsiderCriteria] = useState(() => initialCriteria(frame?.criteria ?? [], "reconsider"));

  function startEditing() {
    const current = getActiveDecisionFrame(props.workspace);
    setDecision(current?.decision ?? "");
    setHypothesis(current?.hypothesis ?? "");
    setContinueCriteria(initialCriteria(current?.criteria ?? [], "continue"));
    setReconsiderCriteria(initialCriteria(current?.criteria ?? [], "reconsider"));
    setEditing(true);
  }

  function updateCriterion(
    polarity: DecisionCriterion["polarity"],
    id: string,
    statement: string,
  ) {
    const setter = polarity === "continue" ? setContinueCriteria : setReconsiderCriteria;
    setter((current) => current.map((criterion) => criterion.id === id ? { ...criterion, statement } : criterion));
  }

  function removeCriterion(polarity: DecisionCriterion["polarity"], id: string) {
    const setter = polarity === "continue" ? setContinueCriteria : setReconsiderCriteria;
    setter((current) => current.filter((criterion) => criterion.id !== id));
  }

  async function save() {
    const continueItems = continueCriteria.filter((criterion) => criterion.statement.trim());
    const reconsiderItems = reconsiderCriteria.filter((criterion) => criterion.statement.trim());
    if (!decision.trim() || !hypothesis.trim() || continueItems.length === 0 || reconsiderItems.length === 0) return;
    await props.onSave({
      id: `frame-${crypto.randomUUID()}`,
      decision: decision.trim(),
      hypothesis: hypothesis.trim(),
      criteria: [
        ...continueItems.map((criterion) => ({ ...criterion, statement: criterion.statement.trim(), polarity: "continue" as const })),
        ...reconsiderItems.map((criterion) => ({ ...criterion, statement: criterion.statement.trim(), polarity: "reconsider" as const })),
      ],
    });
    setEditing(false);
  }

  if (!editing && frame) {
    return (
      <section className="decision-frame" aria-labelledby="decision-frame-title">
        <header className="decision-frame__header">
          <div>
            <span>Decision frame · v{frame.version}</span>
            <h2 id="decision-frame-title">{props.readout.label}</h2>
            <small>Confidence · {props.readout.basisLabel}</small>
          </div>
          <div>
            <button disabled={props.busy} onClick={() => void props.onReviewWithAgent()} type="button">
              <Bot aria-hidden="true" size={14} /> Review with agent
            </button>
            <button onClick={startEditing} type="button">
              <Pencil aria-hidden="true" size={14} /> Edit bar
            </button>
          </div>
        </header>

        <p className="decision-frame__summary">{props.readout.summary}</p>

        <div className="decision-frame__premise">
          <div><span>Decision</span><p>{frame.decision}</p></div>
          <div><span>Working hypothesis</span><p>{frame.hypothesis}</p></div>
        </div>

        <div className="criterion-ledger">
          {(["continue", "reconsider"] as const).map((polarity) => (
            <section key={polarity}>
              <header>{polarity === "continue" ? "Continue if" : "Reconsider if"}</header>
              {props.readout.criterionReads
                .filter((read) => read.criterion.polarity === polarity)
                .map((read) => (
                  <div className={`criterion-read criterion-read--${read.status}`} key={read.criterion.id}>
                    <i aria-hidden="true" />
                    <span><strong>{read.criterion.statement}</strong><small>{criterionMeta(read)}</small></span>
                  </div>
                ))}
            </section>
          ))}
        </div>
      </section>
    );
  }

  const canSave = Boolean(
    decision.trim()
    && hypothesis.trim()
    && continueCriteria.some((criterion) => criterion.statement.trim())
    && reconsiderCriteria.some((criterion) => criterion.statement.trim()),
  );

  return (
    <section className="decision-frame decision-frame--editing" aria-labelledby="decision-frame-editor-title">
      <header className="decision-frame__editor-intro">
        <div>
          <span>{frame ? `Update decision frame · v${frame.version + 1}` : "Decision-first research"}</span>
          <h2 id="decision-frame-editor-title">Set the evidence bar</h2>
        </div>
        <p>You own the bar. The agent can challenge wording and gaps, but it cannot approve or change this frame.</p>
      </header>

      <div className="decision-frame__fields">
        <label>
          <span>Decision</span>
          <textarea
            onChange={(event) => setDecision(event.target.value)}
            placeholder="What decision will this research inform?"
            rows={2}
            value={decision}
          />
        </label>
        <label>
          <span>Working hypothesis</span>
          <textarea
            onChange={(event) => setHypothesis(event.target.value)}
            placeholder="What do you currently believe is true—and for whom?"
            rows={2}
            value={hypothesis}
          />
        </label>
      </div>

      <div className="decision-criteria-editor">
        {(["continue", "reconsider"] as const).map((polarity) => {
          const criteria = polarity === "continue" ? continueCriteria : reconsiderCriteria;
          const setter = polarity === "continue" ? setContinueCriteria : setReconsiderCriteria;
          return (
            <section key={polarity}>
              <header>
                <div><strong>{polarity === "continue" ? "Continue if" : "Reconsider if"}</strong><small>{polarity === "continue" ? "Evidence that earns deeper investment" : "Evidence that would change the direction"}</small></div>
                {criteria.length < 4 && (
                  <button onClick={() => setter((current) => [...current, { id: `criterion-${crypto.randomUUID()}`, statement: "" }])} type="button">
                    <Plus aria-hidden="true" size={13} /> Add
                  </button>
                )}
              </header>
              {criteria.map((criterion) => (
                <div className="criterion-input" key={criterion.id}>
                  <textarea
                    aria-label={`${polarity === "continue" ? "Continue" : "Reconsider"} criterion`}
                    onChange={(event) => updateCriterion(polarity, criterion.id, event.target.value)}
                    placeholder={polarity === "continue" ? "e.g. Recent workarounds recur across independent teams" : "e.g. The issue is revision history, not alternative exploration"}
                    rows={2}
                    value={criterion.statement}
                  />
                  {criteria.length > 1 && (
                    <button aria-label="Remove criterion" onClick={() => removeCriterion(polarity, criterion.id)} type="button">
                      <Trash2 aria-hidden="true" size={13} />
                    </button>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>

      <footer className="decision-frame__actions">
        <span>{frame ? "Unchanged criteria keep their evidence links; changed criteria return to untested." : "Make each criterion observable enough that you can recognise it in evidence."}</span>
        <div>
          {frame && <button onClick={() => setEditing(false)} type="button">Cancel</button>}
          <button className="decision-frame__save" disabled={props.busy || !canSave} onClick={() => void save()} type="button">
            <Save aria-hidden="true" size={14} /> Agree evidence bar
          </button>
        </div>
      </footer>
    </section>
  );
}
