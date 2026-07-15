import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentRequest, FieldOperation } from "../src/shared/workspace.ts";
import {
  completeAgentRunEvent,
  finishAgentRunActivity,
  recordAgentRunEvent,
  startAgentRunActivity,
} from "./agent-activity.ts";
import { parseClaudeActivityLine, parseCodexActivityLine } from "./agent-events.ts";
import { readWorkspace, RevisionConflictError, writeOperations } from "./store.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runsPath = path.join(repositoryRoot, "data", "local", "agent-runs");
const provider = process.env.FIELD_AGENT_PROVIDER === "claude" ? "claude" : "codex";
const configuredTimeoutMs = Number(process.env.FIELD_AGENT_TIMEOUT_MS ?? 15 * 60 * 1_000);
const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
  ? configuredTimeoutMs
  : 15 * 60 * 1_000;
const codexModel = process.env.FIELD_CODEX_MODEL ?? "gpt-5.6-terra";
const codexEffort = process.env.FIELD_CODEX_REASONING_EFFORT ?? "medium";
const claudeModel = process.env.FIELD_CLAUDE_MODEL ?? "sonnet";
const claudeEffort = process.env.FIELD_CLAUDE_REASONING_EFFORT ?? "medium";

let loopStarted = false;
let running = false;
let wakeRequested = false;

function truncate(value: string, length = 20_000) {
  const clean = value.trim();
  return clean.length <= length ? clean : `${clean.slice(0, length - 26)}\n\n[output truncated]`;
}

async function applySystemOperation(operation: FieldOperation) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const workspace = await readWorkspace();
    try {
      return await writeOperations({
        baseRevision: workspace.revision,
        actor: "system",
        operations: [operation],
      });
    } catch (error) {
      if (error instanceof RevisionConflictError) continue;
      throw error;
    }
  }
  throw new Error("The agent runner could not update the field after repeated revision conflicts.");
}

async function claimNextRequest() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const workspace = await readWorkspace();
    const request = workspace.agentRequests.find((item) => item.status === "queued");
    if (!request) return null;
    const runId = `run-${crypto.randomUUID()}`;
    try {
      await writeOperations({
        baseRevision: workspace.revision,
        actor: "system",
        operations: [{
          type: "startAgentRequest",
          requestId: request.id,
          runId,
          provider,
        }],
      });
      return { request, runId };
    } catch (error) {
      if (error instanceof RevisionConflictError) continue;
      throw error;
    }
  }
  return null;
}

function agentPrompt(request: AgentRequest) {
  return `You are the bounded sensemaking worker for Problem Field.

Process exactly this request: ${request.id}
${request.prompt}

Work only on field content for this request. Do not modify application code, configuration, package files, or documentation. Follow AGENTS.md and use the repository's field CLI as the only write boundary. Begin with \`npm run field -- context ${request.id}\`. Re-read context immediately before writing, create a uniquely named operation file under work/, and apply it with \`npm run field -- apply <file>\`. If the revision changed, regenerate the operation set from fresh context. Never edit data/local/workspace.json directly. Do not resolve or finish the request yourself; the local runner owns its lifecycle. Treat the current field as durable truth: never recreate material already present, and if this is a retry, continue from the existing state. You may use relevant read-only MCP tools already configured on this agent host; do not alter connector configuration. Preserve exact evidence and provenance, and snapshot any selected external material as a source with an externalRef. Keep interpretations provisional through addAgentProposal. Whenever you add or update project or card meaning, also provide faithful display copy for the visual surfaces: a title of at most 60 characters and a summary of at most 120 characters. Preserve uncertainty and qualifiers; display copy never replaces the full content. End with a short description of what you changed or why no safe change was possible.`;
}

type CommandResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

function runCommand(command: string, args: string[], onStdoutLine?: (line: string) => void): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stdoutLineBuffer = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      const value = String(chunk);
      stdout += value;
      stdoutLineBuffer += value;
      const lines = stdoutLineBuffer.split(/\r?\n/);
      stdoutLineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) onStdoutLine?.(line);
      }
    });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (stdoutLineBuffer.trim()) onStdoutLine?.(stdoutLineBuffer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

async function executeRequest(request: AgentRequest, runId: string) {
  const execution = provider === "codex"
    ? { model: codexModel, effort: codexEffort }
    : { model: claudeModel, effort: claudeEffort };
  await startAgentRunActivity(runId, provider, execution);
  await mkdir(runsPath, { recursive: true });
  const outputPath = path.join(runsPath, `${runId}-final.txt`);
  const prompt = agentPrompt(request);
  const command = provider === "claude"
    ? process.env.CLAUDE_PATH ?? "claude"
    : process.env.CODEX_PATH ?? "codex";
  const args = provider === "claude"
    ? [
        "-p", prompt,
        "--model", claudeModel,
        "--effort", claudeEffort,
        "--permission-mode", "acceptEdits",
        "--no-session-persistence",
        "--output-format", "stream-json",
        "--verbose",
      ]
    : [
        "--ask-for-approval", "never",
        "--sandbox", "workspace-write",
        "--cd", repositoryRoot,
        "--model", codexModel,
        "--config", `model_reasoning_effort=${JSON.stringify(codexEffort)}`,
        "exec",
        "--ephemeral",
        "--json",
        "--output-last-message", outputPath,
        prompt,
      ];
  let streamedFinalMessage = "";
  const result = await runCommand(command, args, (line) => {
    const updates = provider === "codex" ? [parseCodexActivityLine(line)] : parseClaudeActivityLine(line);
    for (const update of updates) {
      if (update.event) recordAgentRunEvent(runId, update.event);
      if (update.completeEventId) completeAgentRunEvent(runId, update.completeEventId);
      if (update.finalMessage) streamedFinalMessage = update.finalMessage;
    }
  });
  const finalMessage = provider === "codex"
    ? await readFile(outputPath, "utf8").catch(() => result.stdout)
    : streamedFinalMessage;
  await writeFile(
    path.join(runsPath, `${runId}.log`),
    `${result.stdout}\n\n--- stderr ---\n${result.stderr}`,
    "utf8",
  );

  if (result.timedOut) {
    throw new Error(`The run reached the ${Math.round(timeoutMs / 60_000)}-minute safety limit. Completed field operations are already saved; continue safely to resume from the current field.`);
  }
  if (result.code !== 0) {
    throw new Error(truncate(result.stderr || `${provider} exited with code ${result.code}.`));
  }
  return truncate(finalMessage || `${provider} completed the request.`);
}

async function finish(requestId: string, runId: string, outcome: "completed" | "failed", message: string) {
  await applySystemOperation({
    type: "finishAgentRequest",
    requestId,
    runId,
    outcome,
    ...(outcome === "completed" ? { response: truncate(message) } : { error: truncate(message) }),
  });
}

async function drainQueue() {
  if (running) {
    wakeRequested = true;
    return;
  }
  running = true;
  try {
    do {
      wakeRequested = false;
      const claim = await claimNextRequest();
      if (!claim) break;
      try {
        const response = await executeRequest(claim.request, claim.runId);
        await finish(claim.request.id, claim.runId, "completed", response);
        await finishAgentRunActivity(claim.runId, "completed", response);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The agent run failed.";
        await finish(claim.request.id, claim.runId, "failed", message).catch((finishError) => {
          console.error("Could not record agent failure", finishError);
        });
        await finishAgentRunActivity(claim.runId, "failed", message).catch((activityError) => {
          console.error("Could not record agent activity failure", activityError);
        });
      }
    } while (wakeRequested || (await readWorkspace()).agentRequests.some((item) => item.status === "queued"));
  } catch (error) {
    console.error("Agent runner failed", error);
  } finally {
    running = false;
  }
}

async function failInterruptedRuns() {
  const workspace = await readWorkspace();
  for (const request of workspace.agentRequests.filter((item) => item.status === "running" && item.runId)) {
    const message = "The local app restarted during this run, so it was stopped to prevent two agents from writing at once. Continue safely to resume from the current field.";
    await finish(
      request.id,
      request.runId!,
      "failed",
      message,
    ).catch((error) => console.error("Could not recover interrupted agent request", error));
    await finishAgentRunActivity(request.runId!, "failed", message)
      .catch((error) => console.error("Could not recover interrupted agent activity", error));
  }
}

export function kickAgentRunner() {
  void drainQueue();
}

export function startAgentRunner() {
  if (loopStarted) return;
  loopStarted = true;
  void failInterruptedRuns().then(() => drainQueue());
  setInterval(() => void drainQueue(), 2_500).unref();
}
