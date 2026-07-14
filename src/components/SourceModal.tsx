import { useState } from "react";
import { FileUp, Plug, Plus, X } from "lucide-react";

import { inferSourceKind } from "../source-files.ts";
import type { Source } from "../shared/workspace.ts";

type SourceModalProps = {
  busy: boolean;
  initialFile?: File;
  onClose: () => void;
  onOpenConnectors: () => void;
  onCreate: (source: Source, file?: File) => Promise<void>;
};

export function SourceModal({ busy, initialFile, onClose, onCreate, onOpenConnectors }: SourceModalProps) {
  const [file, setFile] = useState<File | undefined>(initialFile);
  const [title, setTitle] = useState(initialFile?.name.replace(/\.[^.]+$/, "") ?? "");
  const [kind, setKind] = useState<Source["kind"]>(inferSourceKind(initialFile));
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
    }, file);
  }

  async function loadTextFile(file: File | undefined) {
    if (!file) return;
    setFile(file);
    if (file.type.startsWith("text/") || /\.(txt|md|json|csv|tsv)$/i.test(file.name)) {
      setContent(await file.text());
    } else {
      setContent("");
    }
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    setKind(inferSourceKind(file));
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
          Raw material stays separate from the evidence and interpretations you place on the canvas. Files remain local in this repository.
        </p>

        <button className="source-modal__connect" onClick={onOpenConnectors} type="button">
          <Plug aria-hidden="true" size={16} />
          <span><strong>Connect an existing workspace</strong><small>Linear, Notion, Figma, Granola, or PostHog through Codex</small></span>
        </button>

        <label className="file-drop">
          <FileUp aria-hidden="true" size={17} />
          <span>
            <strong>{file ? file.name : "Choose a file"}</strong>
            <small>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · kept as raw source` : "Text, image, PDF, audio, or video · up to 50 MB"}</small>
          </span>
          <input
            accept=".txt,.md,.json,.csv,.tsv,.pdf,image/*,audio/*,video/*,text/plain,text/markdown,application/json"
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
          <span className="field-label">{file ? "Extracted text or notes" : "Source content"}</span>
          <textarea
            onChange={(event) => setContent(event.target.value)}
            placeholder={file && !content ? "Extraction will be queued for Codex or Claude Code. Add context here if useful…" : "Paste the transcript or notes here…"}
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
