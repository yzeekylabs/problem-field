import { useState } from "react";
import { Bot, Save } from "lucide-react";

import type { Source, SourceResearchQualityInput } from "../shared/workspace.ts";

type SourceQualityEditorProps = {
  source: Source;
  busy: boolean;
  onSave: (assessment: SourceResearchQualityInput | null) => Promise<void>;
  onReviewWithAgent: () => Promise<void>;
};

export function SourceQualityEditor({ source, busy, onSave, onReviewWithAgent }: SourceQualityEditorProps) {
  const [transcriptFidelity, setTranscriptFidelity] = useState<NonNullable<SourceResearchQualityInput["transcriptFidelity"]>>(
    source.researchQuality?.transcriptFidelity ?? "unreviewed",
  );
  const [sessionEvidence, setSessionEvidence] = useState<NonNullable<SourceResearchQualityInput["sessionEvidence"]>>(
    source.researchQuality?.sessionEvidence ?? "unassessed",
  );
  const [note, setNote] = useState(source.researchQuality?.note ?? "");
  const isConversation = source.kind === "transcript" || source.kind === "audio" || source.kind === "video";
  if (!isConversation) return null;

  const assessment: SourceResearchQualityInput = {
    transcriptFidelity,
    sessionEvidence,
    ...(note.trim() ? { note: note.trim() } : {}),
  };
  const current = source.researchQuality
    ? {
        transcriptFidelity: source.researchQuality.transcriptFidelity,
        sessionEvidence: source.researchQuality.sessionEvidence,
        ...(source.researchQuality.note ? { note: source.researchQuality.note } : {}),
      }
    : null;
  const isDirty = JSON.stringify(assessment) !== JSON.stringify(current);

  return (
    <section className="source-quality" aria-labelledby="source-quality-title">
      <header>
        <div>
          <span>Research context</span>
          <strong id="source-quality-title">How should this call be read?</strong>
        </div>
        <button disabled={busy} onClick={() => void onReviewWithAgent()} type="button">
          <Bot aria-hidden="true" size={13} /> Review with agent
        </button>
      </header>
      <p>The agent can flag exact moments and caveats. You decide what belongs in the record.</p>
      <div className="source-quality__fields">
        <label>
          <span>Transcript fidelity</span>
          <select onChange={(event) => setTranscriptFidelity(event.target.value as typeof transcriptFidelity)} value={transcriptFidelity}>
            <option value="unreviewed">Not reviewed</option>
            <option value="spot_checked">Spot-checked against recording</option>
            <option value="needs_review">Needs review</option>
          </select>
        </label>
        <label>
          <span>Session evidence</span>
          <select onChange={(event) => setSessionEvidence(event.target.value as typeof sessionEvidence)} value={sessionEvidence}>
            <option value="unassessed">Not assessed</option>
            <option value="behavior_rich">Behavior-rich</option>
            <option value="mixed">Mixed</option>
            <option value="mostly_hypothetical">Mostly hypothetical</option>
          </select>
        </label>
      </div>
      <label>
        <span>Context note <small>optional</small></span>
        <textarea
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. Two leading prompts; strong recent example at 18:40"
          rows={2}
          value={note}
        />
      </label>
      <footer>
        {source.researchQuality && <button disabled={busy} onClick={() => void onSave(null)} type="button">Clear</button>}
        <button className="source-quality__save" disabled={busy || !isDirty} onClick={() => void onSave(assessment)} type="button">
          <Save aria-hidden="true" size={13} /> Save context
        </button>
      </footer>
    </section>
  );
}
