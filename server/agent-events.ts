import type { AgentActivityEvent, AgentActivityKind } from "../src/shared/agent-activity.ts";

export type ProviderLineUpdate = {
  event?: Omit<AgentActivityEvent, "at">;
  completeEventId?: string;
  finalMessage?: string;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" ? value as JsonRecord : undefined;
}

function text(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function safeIdentifier(value: unknown) {
  const raw = text(value)?.replace(/[^a-zA-Z0-9_.:-]/g, " ").replace(/\s+/g, " ").trim();
  return raw ? raw.slice(0, 80) : undefined;
}

function commandMilestone(command: string, completed: boolean): { kind: AgentActivityKind; label: string } {
  const normalized = command.toLowerCase();
  if (normalized.includes("npm run field -- context")) {
    return { kind: "field", label: completed ? "Current field read" : "Reading the current field" };
  }
  if (normalized.includes("npm run field -- apply")) {
    return { kind: "field", label: completed ? "Grounded changes applied" : "Applying grounded changes" };
  }
  if (/\b(test|vitest|lint|build|typecheck|tsc)\b/.test(normalized)) {
    return { kind: "check", label: completed ? "Checks completed" : "Checking the work" };
  }
  if (/\b(pdf|image|screenshot|transcript|audio|video|asset)\b/.test(normalized)) {
    return { kind: "source", label: completed ? "Source material inspected" : "Inspecting source material" };
  }
  return { kind: "status", label: completed ? "Workspace inspection completed" : "Inspecting the workspace" };
}

function toolMilestone(name: string, completed: boolean): { kind: AgentActivityKind; label: string; detail?: string } {
  const normalized = name.toLowerCase();
  const toolLeaf = normalized.split("__").at(-1) ?? normalized;
  if (normalized === "bash" || normalized === "shell" || normalized.includes("command")) {
    return { kind: "status", label: completed ? "Local step completed" : "Running a local step" };
  }
  if (normalized.startsWith("mcp__")) {
    return {
      kind: "connector",
      label: completed ? "Connected source checked" : "Checking a connected source",
      detail: safeIdentifier(name),
    };
  }
  if (["read", "search", "glob", "grep"].some((tool) => toolLeaf === tool || toolLeaf.startsWith(`${tool}_`))) {
    return { kind: "source", label: completed ? "Relevant material inspected" : "Inspecting relevant material" };
  }
  if (["write", "edit"].some((tool) => toolLeaf === tool || toolLeaf.startsWith(`${tool}_`))) {
    return { kind: "field", label: completed ? "Field operation prepared" : "Preparing a field operation" };
  }
  return { kind: "status", label: completed ? "Agent step completed" : "Working through the next step" };
}

function codexItemUpdate(item: JsonRecord, completed: boolean): ProviderLineUpdate {
  const itemType = text(item.type) ?? "";
  const itemId = safeIdentifier(item.id) ?? `${itemType || "item"}-${completed ? "done" : "active"}`;
  const state = completed ? "completed" as const : "active" as const;

  if (itemType === "reasoning") return {};
  if (itemType === "agent_message") {
    const message = text(item.text);
    if (!message || !completed) return {};
    return {
      event: { id: itemId, kind: "message", label: "Agent update", detail: message, state },
      finalMessage: message,
    };
  }
  if (itemType === "command_execution") {
    const milestone = commandMilestone(text(item.command) ?? "", completed);
    return { event: { id: itemId, ...milestone, state } };
  }
  if (itemType === "mcp_tool_call" || itemType === "tool_call") {
    const server = safeIdentifier(item.server) ?? safeIdentifier(item.connector);
    const tool = safeIdentifier(item.tool) ?? safeIdentifier(item.name);
    return {
      event: {
        id: itemId,
        kind: "connector",
        label: completed ? "Connected source checked" : "Checking a connected source",
        ...(server || tool ? { detail: [server, tool].filter(Boolean).join(" · ") } : {}),
        state,
      },
    };
  }
  if (itemType === "file_change") {
    return { event: { id: itemId, kind: "field", label: completed ? "Field operation prepared" : "Preparing a field operation", state } };
  }
  return {};
}

export function parseCodexActivityLine(line: string): ProviderLineUpdate {
  let payload: JsonRecord;
  try {
    payload = JSON.parse(line) as JsonRecord;
  } catch {
    return {};
  }
  const type = text(payload.type);
  if (type === "thread.started") {
    return { event: { id: "launch", kind: "status", label: "Codex started", state: "completed" } };
  }
  if (type === "turn.started") {
    return { event: { id: "turn", kind: "status", label: "Planning the pass", state: "active" } };
  }
  if (type === "turn.completed") {
    return { event: { id: "turn", kind: "status", label: "Pass completed", state: "completed" } };
  }
  if (type === "turn.failed") {
    return { event: { id: "turn", kind: "status", label: "The pass needs attention", state: "failed" } };
  }
  if (type === "item.started" || type === "item.completed") {
    const item = record(payload.item);
    return item ? codexItemUpdate(item, type === "item.completed") : {};
  }
  return {};
}

export function parseClaudeActivityLine(line: string): ProviderLineUpdate[] {
  let payload: JsonRecord;
  try {
    payload = JSON.parse(line) as JsonRecord;
  } catch {
    return [];
  }
  const type = text(payload.type);
  if (type === "system") {
    return [{ event: { id: "launch", kind: "status", label: "Claude Code started", state: "completed" } }];
  }
  if (type === "result") {
    const finalMessage = text(payload.result);
    return [{
      event: { id: "turn", kind: "status", label: "Pass completed", state: "completed" },
      ...(finalMessage ? { finalMessage } : {}),
    }];
  }
  if (type === "assistant") {
    const message = record(payload.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    const updates: ProviderLineUpdate[] = [];
    for (const blockValue of content) {
      const block = record(blockValue);
      if (!block) continue;
      const blockType = text(block.type);
      if (blockType === "thinking" || blockType === "redacted_thinking") continue;
      if (blockType === "tool_use") {
        const name = safeIdentifier(block.name) ?? "tool";
        const input = record(block.input);
        const milestone = name.toLowerCase() === "bash"
          ? commandMilestone(text(input?.command) ?? "", false)
          : toolMilestone(name, false);
        updates.push({
          event: {
            id: safeIdentifier(block.id) ?? `tool-${updates.length}`,
            ...milestone,
            state: "active",
          },
        });
      }
    }
    return updates;
  }
  if (type === "user") {
    const message = record(payload.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    return content.flatMap((blockValue) => {
      const block = record(blockValue);
      if (!block || text(block.type) !== "tool_result") return [];
      const id = safeIdentifier(block.tool_use_id);
      return id ? [{ completeEventId: id }] : [];
    });
  }
  return [];
}
