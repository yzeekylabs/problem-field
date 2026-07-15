import { Move, Workflow } from "lucide-react";

import type { CanvasLayoutMode } from "../field-layout.ts";

type CanvasLayoutControlProps = {
  mode: CanvasLayoutMode;
  onChange: (mode: CanvasLayoutMode) => void;
};

export function CanvasLayoutControl({ mode, onChange }: CanvasLayoutControlProps) {
  return (
    <div className="canvas-layout-control" role="group" aria-label="Canvas arrangement">
      <button
        aria-pressed={mode === "custom"}
        onClick={() => onChange("custom")}
        title="Return to your saved card positions"
        type="button"
      >
        <Move aria-hidden="true" size={13} />
        Custom
      </button>
      <button
        aria-pressed={mode === "grouped"}
        onClick={() => onChange("grouped")}
        title="Arrange cards temporarily around their relationships"
        type="button"
      >
        <Workflow aria-hidden="true" size={13} />
        Grouped
      </button>
      <span className="sr-only">Grouped is a temporary view and does not change saved custom positions.</span>
    </div>
  );
}
