import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentActivityEvent, AgentRunActivity } from "../src/shared/agent-activity.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runsPath = path.join(repositoryRoot, "data", "local", "agent-runs");
const safeRunId = /^run-[a-f0-9-]+$/;
const activityByRun = new Map<string, AgentRunActivity>();
const persistenceByRun = new Map<string, Promise<void>>();

function assertRunId(runId: string) {
  if (!safeRunId.test(runId)) throw new Error("Invalid agent run ID.");
}

function activityPath(runId: string) {
  assertRunId(runId);
  return path.join(runsPath, `${runId}-activity.json`);
}

function cleanText(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1)}…`;
}

function queuePersistence(activity: AgentRunActivity) {
  const snapshot = JSON.stringify(activity, null, 2);
  const previous = persistenceByRun.get(activity.runId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(runsPath, { recursive: true });
      const target = activityPath(activity.runId);
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, snapshot, "utf8");
      await rename(temporary, target);
    });
  persistenceByRun.set(activity.runId, next);
  return next;
}

export async function startAgentRunActivity(
  runId: string,
  provider: "codex" | "claude",
  execution: { model: string; effort: string },
) {
  assertRunId(runId);
  const now = new Date().toISOString();
  const activity: AgentRunActivity = {
    runId,
    provider,
    model: execution.model,
    effort: execution.effort,
    status: "running",
    startedAt: now,
    updatedAt: now,
    events: [{
      id: "launch",
      at: now,
      kind: "status",
      label: `Starting ${provider === "codex" ? "Codex" : "Claude Code"}`,
      detail: `${execution.model} · ${execution.effort} reasoning`,
      state: "active",
    }],
  };
  activityByRun.set(runId, activity);
  await queuePersistence(activity);
}

export function recordAgentRunEvent(runId: string, event: Omit<AgentActivityEvent, "at"> & { at?: string }) {
  const current = activityByRun.get(runId);
  if (!current || current.status !== "running") return;
  const now = event.at ?? new Date().toISOString();
  const existingEvent = current.events.find((item) => item.id === event.id);
  const nextEvent: AgentActivityEvent = {
    ...existingEvent,
    ...event,
    at: now,
    label: cleanText(event.label, 160),
    ...(event.detail
      ? { detail: cleanText(event.detail, 500) }
      : existingEvent?.detail
        ? { detail: existingEvent.detail }
        : {}),
  };
  const existingIndex = current.events.findIndex((item) => item.id === event.id);
  const events = [...current.events];
  if (existingIndex >= 0) events[existingIndex] = nextEvent;
  else events.push(nextEvent);
  const next = { ...current, updatedAt: now, events: events.slice(-30) };
  activityByRun.set(runId, next);
  void queuePersistence(next);
}

export function completeAgentRunEvent(runId: string, eventId: string) {
  const current = activityByRun.get(runId);
  if (!current || current.status !== "running") return;
  const event = current.events.find((item) => item.id === eventId);
  if (!event) return;
  recordAgentRunEvent(runId, { ...event, state: "completed" });
}

export async function finishAgentRunActivity(runId: string, status: "completed" | "failed", detail?: string) {
  const current = activityByRun.get(runId) ?? await readAgentRunActivity(runId);
  if (!current) return;
  const now = new Date().toISOString();
  const events = current.events.map((event) => event.state === "active"
    ? { ...event, state: status === "failed" ? "failed" as const : "completed" as const }
    : event);
  events.push({
    id: "finish",
    at: now,
    kind: "status",
    label: status === "completed" ? "Run completed" : "Run stopped",
    ...(status === "failed" && detail ? { detail: cleanText(detail, 500) } : {}),
    state: status,
  });
  const next: AgentRunActivity = { ...current, status, updatedAt: now, events: events.slice(-30) };
  activityByRun.set(runId, next);
  await queuePersistence(next);
}

export async function readAgentRunActivity(runId: string) {
  assertRunId(runId);
  const current = activityByRun.get(runId);
  if (current) return current;
  try {
    const parsed = JSON.parse(await readFile(activityPath(runId), "utf8")) as AgentRunActivity;
    if (parsed.runId !== runId || !Array.isArray(parsed.events)) return null;
    activityByRun.set(runId, parsed);
    return parsed;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return null;
    throw error;
  }
}
