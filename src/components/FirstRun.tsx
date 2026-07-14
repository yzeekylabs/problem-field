import { useState } from "react";
import { ArrowRight, File as FileIcon, FileUp, LockKeyhole, Sparkles, X } from "lucide-react";

export type BootstrapInput = {
  name: string;
  question: string;
  context: string;
  files: File[];
};

type FirstRunProps = {
  busy: boolean;
  onSubmit: (input: BootstrapInput) => Promise<void>;
};

export function FirstRun({ busy, onSubmit }: FirstRunProps) {
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
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

  return (
    <section className="first-run" aria-labelledby="first-run-title">
      <div className="first-run__panel">
        <header className="first-run__header">
          <div className="first-run__mark"><Sparkles aria-hidden="true" size={18} /></div>
          <span>Open a new problem field</span>
        </header>

        <div className="first-run__intro">
          <h1 id="first-run-title">What are you trying to understand?</h1>
          <p>Give the field a direction, then bring in whatever happened—calls, notes, screenshots, recordings, or documents. You can stay messy; the structure will emerge from the evidence.</p>
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
            <span>Active focus</span>
            <textarea
              autoFocus
              maxLength={1_000}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What problem, behavior, or uncertainty do you need to make sense of?"
              rows={3}
              value={question}
            />
            <small>This can change as the field teaches you something.</small>
          </label>
          <label>
            <span>Starting context <small>optional</small></span>
            <textarea
              onChange={(event) => setContext(event.target.value)}
              placeholder="What led here? What have you tried, heard, or assumed so far?"
              rows={3}
              value={context}
            />
          </label>
        </div>

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
          <span><strong>Drop starting material</strong><small>Text, image, PDF, audio, or video · 50 MB each</small></span>
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
          <span><LockKeyhole aria-hidden="true" size={13} /> Your field and source files stay local and outside Git.</span>
          <button
            disabled={busy || !question.trim()}
            onClick={() => void onSubmit({
              name: name.trim() || "Untitled field",
              question: question.trim(),
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
