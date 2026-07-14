import { useState } from "react";
import { FileUp, Plus, X } from "lucide-react";

import type { Source } from "../shared/workspace.ts";

type SourceModalProps = {
  busy: boolean;
  onClose: () => void;
  onCreate: (source: Source) => Promise<void>;
};

export function SourceModal({ busy, onClose, onCreate }: SourceModalProps) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Source["kind"]>("transcript");
  const [origin, setOrigin] = useState("");
  const [content, setContent] = useState("");

  async function submit() {
    if (!title.trim() || busy) return;
    await onCreate({
      id: `source-${crypto.randomUUID()}`,
      title: title.trim(),
      kind,
      ...(origin.trim() ? { origin: origin.trim() } : {}),
      ...(content.trim() ? { summary: content.trim() } : {}),
      importedAt: new Date().toISOString(),
    });
  }

  async function loadTextFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setContent(text);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    if (file.name.endsWith(".md") || file.name.endsWith(".txt")) setKind("note");
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="source-modal-title"
        aria-modal="true"
        className="source-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <span className="section-label">Bring material into the field</span>
            <h2 id="source-modal-title">Add a source</h2>
          </div>
          <button aria-label="Close source dialog" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={17} />
          </button>
        </header>

        <p className="source-modal__intro">
          Start with a transcript, note, or document. The original content stays separate from the evidence and interpretations you place on the canvas.
        </p>

        <label className="file-drop">
          <FileUp aria-hidden="true" size={17} />
          <span>
            <strong>Load a text file</strong>
            <small>.txt, .md, or .json</small>
          </span>
          <input
            accept=".txt,.md,.json,text/plain,text/markdown,application/json"
            onChange={(event) => void loadTextFile(event.target.files?.[0])}
            type="file"
          />
        </label>

        <div className="source-modal__row">
          <label>
            <span className="field-label">Title</span>
            <input onChange={(event) => setTitle(event.target.value)} placeholder="Customer call — Jane" value={title} />
          </label>
          <label>
            <span className="field-label">Type</span>
            <select onChange={(event) => setKind(event.target.value as Source["kind"])} value={kind}>
              <option value="transcript">Transcript</option>
              <option value="note">Note</option>
              <option value="document">Document</option>
              <option value="image">Image reference</option>
              <option value="video">Video reference</option>
              <option value="audio">Audio reference</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <label>
          <span className="field-label">Origin or context</span>
          <input
            onChange={(event) => setOrigin(event.target.value)}
            placeholder="Call on 14 July · 32 minutes"
            value={origin}
          />
        </label>

        <label>
          <span className="field-label">Source content</span>
          <textarea
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste the transcript or notes here…"
            rows={10}
            value={content}
          />
        </label>

        <footer>
          <button className="secondary-button" onClick={onClose} type="button">Cancel</button>
          <button
            className="primary-button"
            disabled={!title.trim() || busy}
            onClick={() => void submit()}
            type="button"
          >
            <Plus aria-hidden="true" size={15} />
            Add source
          </button>
        </footer>
      </section>
    </div>
  );
}
