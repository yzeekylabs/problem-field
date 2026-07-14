import { useState } from "react";
import { ArrowRight, File as FileIcon, FileUp, LockKeyhole, Plus, Trash2, X } from "lucide-react";

import { FieldLogo } from "./FieldLogo.tsx";
import type { DecisionFrameInput } from "../shared/workspace.ts";

export type BootstrapInput = {
  name: string;
  decisionFrame: DecisionFrameInput;
  context: string;
  files: File[];
};

type FirstRunProps = {
  busy: boolean;
  onSubmit: (input: BootstrapInput) => Promise<void>;
};

export function FirstRun({ busy, onSubmit }: FirstRunProps) {
  const [name, setName] = useState("");
  const [decision, setDecision] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [continueCriteria, setContinueCriteria] = useState([{ id: `criterion-${crypto.randomUUID()}`, statement: "" }]);
  const [reconsiderCriteria, setReconsiderCriteria] = useState([{ id: `criterion-${crypto.randomUUID()}`, statement: "" }]);
  const [context, setContext] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);

  function addFiles(incoming: FileList | File[]) {
    setFiles((current) => {
      const next = [...current];
      for (const file of Array.from(incoming)) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!next.some((item) => `${item.name}:${item.size}:${item.lastModified}` === key)) next.push(file);
      }
      return next;
    });
  }

  function updateCriterion(
    polarity: "continue" | "reconsider",
    id: string,
    statement: string,
  ) {
    const setter = polarity === "continue" ? setContinueCriteria : setReconsiderCriteria;
    setter((current) => current.map((criterion) => criterion.id === id ? { ...criterion, statement } : criterion));
  }

  function removeCriterion(polarity: "continue" | "reconsider", id: string) {
    const setter = polarity === "continue" ? setContinueCriteria : setReconsiderCriteria;
    setter((current) => current.filter((criterion) => criterion.id !== id));
  }

  const readyContinueCriteria = continueCriteria.filter((criterion) => criterion.statement.trim());
  const readyReconsiderCriteria = reconsiderCriteria.filter((criterion) => criterion.statement.trim());
  const canOpen = Boolean(
    decision.trim()
    && hypothesis.trim()
    && readyContinueCriteria.length > 0
    && readyReconsiderCriteria.length > 0,
  );

  return (
    <section className="first-run" aria-labelledby="first-run-title">
      <div className="first-run__panel">
        <header className="first-run__header">
          <FieldLogo className="first-run__mark" />
          <span>Start a problem field</span>
        </header>

        <div className="first-run__intro">
          <h1 id="first-run-title">Start with the decision.</h1>
          <p>Name your working hypothesis and agree what would make you continue or reconsider. The field can stay exploratory without moving the evidence bar after the fact.</p>
        </div>

        <div className="first-run__fields">
          <label>
            <span>Field name <small>optional</small></span>
            <input
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Why onboarding stalls"
              value={name}
            />
          </label>
          <label>
            <span>Decision</span>
            <textarea
              autoFocus
              maxLength={1_000}
              onChange={(event) => setDecision(event.target.value)}
              placeholder="What decision will this research inform?"
              rows={3}
              value={decision}
            />
            <small>Decision-first research works backwards from the choice you need to make.</small>
          </label>
          <label>
            <span>Working hypothesis</span>
            <textarea
              maxLength={2_000}
              onChange={(event) => setHypothesis(event.target.value)}
              placeholder="What do you currently believe is true—and for whom?"
              rows={3}
              value={hypothesis}
            />
            <small>This is a claim to test, not a conclusion to defend.</small>
          </label>
        </div>

        <section className="first-run__bar" aria-labelledby="first-run-bar-title">
          <header>
            <div><span>Evidence bar</span><strong id="first-run-bar-title">What would change your mind?</strong></div>
            <p>Keep the criteria observable. An agent can challenge the framing later, but only you can agree or change it.</p>
          </header>
          <div>
            {(["continue", "reconsider"] as const).map((polarity) => {
              const criteria = polarity === "continue" ? continueCriteria : reconsiderCriteria;
              const setter = polarity === "continue" ? setContinueCriteria : setReconsiderCriteria;
              return (
                <section key={polarity}>
                  <header>
                    <div><strong>{polarity === "continue" ? "Continue if" : "Reconsider if"}</strong><small>{polarity === "continue" ? "Evidence that earns deeper investment" : "Evidence that changes the direction"}</small></div>
                    {criteria.length < 4 && (
                      <button onClick={() => setter((current) => [...current, { id: `criterion-${crypto.randomUUID()}`, statement: "" }])} type="button">
                        <Plus aria-hidden="true" size={12} /> Add
                      </button>
                    )}
                  </header>
                  {criteria.map((criterion) => (
                    <div className="first-run__criterion" key={criterion.id}>
                      <textarea
                        aria-label={`${polarity === "continue" ? "Continue" : "Reconsider"} criterion`}
                        onChange={(event) => updateCriterion(polarity, criterion.id, event.target.value)}
                        placeholder={polarity === "continue" ? "Recent workarounds recur across independent teams" : "The issue is revision history, not alternative exploration"}
                        rows={2}
                        value={criterion.statement}
                      />
                      {criteria.length > 1 && (
                        <button aria-label="Remove criterion" onClick={() => removeCriterion(polarity, criterion.id)} type="button">
                          <Trash2 aria-hidden="true" size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        </section>

        <label className="first-run__context">
          <span>Starting context <small>optional</small></span>
          <textarea
            onChange={(event) => setContext(event.target.value)}
            placeholder="What led here? What have you tried, heard, or assumed so far?"
            rows={3}
            value={context}
          />
        </label>

        <div
          className={`first-run__drop${dragActive ? " is-active" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <FileUp aria-hidden="true" size={18} />
          <span><strong>Bring in what you have</strong><small>Text, image, PDF, audio, or video · 50 MB each</small></span>
          <label>
            Choose files
            <input
              accept=".txt,.md,.json,.csv,.tsv,.pdf,image/*,audio/*,video/*,text/plain,text/markdown,application/json"
              multiple
              onChange={(event) => { if (event.target.files) addFiles(event.target.files); }}
              type="file"
            />
          </label>
        </div>

        {files.length > 0 && (
          <div className="first-run__files" aria-label="Files ready to import">
            {files.map((file) => (
              <span key={`${file.name}:${file.size}:${file.lastModified}`}>
                <FileIcon aria-hidden="true" size={13} />
                <strong>{file.name}</strong>
                <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
                <button
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                  type="button"
                >
                  <X aria-hidden="true" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <footer className="first-run__footer">
          <span><LockKeyhole aria-hidden="true" size={13} /> Your field stays on this device and outside Git.</span>
          <button
            disabled={busy || !canOpen}
            onClick={() => void onSubmit({
              name: name.trim() || "Untitled field",
              decisionFrame: {
                id: `frame-${crypto.randomUUID()}`,
                decision: decision.trim(),
                hypothesis: hypothesis.trim(),
                criteria: [
                  ...readyContinueCriteria.map((criterion) => ({ ...criterion, statement: criterion.statement.trim(), polarity: "continue" as const })),
                  ...readyReconsiderCriteria.map((criterion) => ({ ...criterion, statement: criterion.statement.trim(), polarity: "reconsider" as const })),
                ],
              },
              context: context.trim(),
              files,
            })}
            type="button"
          >
            {busy ? "Opening field…" : "Open the field"}
            {!busy && <ArrowRight aria-hidden="true" size={15} />}
          </button>
        </footer>
      </div>
    </section>
  );
}
