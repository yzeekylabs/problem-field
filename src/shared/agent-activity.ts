export type AgentActivityState = "active" | "completed" | "failed";

export type AgentActivityKind = "status" | "field" | "source" | "connector" | "check" | "message";

export type AgentActivityEvent = {
  id: string;
  at: string;
  kind: AgentActivityKind;
  label: string;
  detail?: string;
  state: AgentActivityState;
};

export type AgentRunActivity = {
  runId: string;
  provider: "codex" | "claude";
  model: string;
  effort: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  updatedAt: string;
  events: AgentActivityEvent[];
};
