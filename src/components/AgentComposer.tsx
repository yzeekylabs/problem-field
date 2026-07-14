import { useState } from "react";
import { ArrowUp, Bot, Focus } from "lucide-react";

type AgentComposerProps = {
  busy: boolean;
  selectedTitle?: string;
  onSubmit: (prompt: string) => Promise<void>;
};

export function AgentComposer({ busy, selectedTitle, onSubmit }: AgentComposerProps) {
  const [prompt, setPrompt] = useState("");

  async function submit() {
    if (!prompt.trim() || busy) return;
    await onSubmit(prompt.trim());
    setPrompt("");
  }

  return (
    <div className="agent-composer">
      <div className="agent-composer__identity">
        <Bot aria-hidden="true" size={17} />
      </div>
      <div className="agent-composer__input">
        <input
          aria-label="Ask the field"
          disabled={busy}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          placeholder="Ask the field what is missing, repeated, or unsupported…"
          value={prompt}
        />
        <span>
          <Focus aria-hidden="true" size={12} />
          {selectedTitle ? `Scoped to “${selectedTitle}”` : "Whole field"}
        </span>
      </div>
      <button
        aria-label="Queue question for agent"
        disabled={!prompt.trim() || busy}
        onClick={() => void submit()}
        type="button"
      >
        <ArrowUp aria-hidden="true" size={17} />
      </button>
    </div>
  );
}
