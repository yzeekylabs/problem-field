import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentRequest, FieldOperation } from "../src/shared/workspace.ts";
import { readWorkspace, RevisionConflictError, writeOperations } from "./store.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runsPath = path.join(repositoryRoot, "data", "local", "agent-runs");
const provider = process.env.FIELD_AGENT_PROVIDER === "claude" ? "claude" : "codex";
const timeoutMs = Number(process.env.FIELD_AGENT_TIMEOUT_MS ?? 8 * 60 * 1_000);

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

Work only on field content for this request. Do not modify application code, configuration, package files, or documentation. Follow AGENTS.md and use the repository's field CLI as the only write boundary. Begin with \`npm run field -- context ${request.id}\`. Re-read context immediately before writing, create a uniquely named operation file under work/, and apply it with \`npm run field -- apply <file>\`. If the revision changed, regenerate the operation set from fresh context. Never edit data/local/workspace.json directly. Do not resolve or finish the request yourself; the local runner owns its lifecycle. You may use relevant read-only MCP tools already configured on this agent host; do not alter connector configuration. Preserve exact evidence and provenance, and snapshot any selected external material as a source with an externalRef. Keep interpretations provisional through addAgentProposal. End with a short description of what you changed or why no safe change was possible.`;
}

type CommandResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

async function executeRequest(request: AgentRequest, runId: string) {
  await mkdir(runsPath, { recursive: true });
  const outputPath = path.join(runsPath, `${runId}-final.txt`);
  const prompt = agentPrompt(request);
  const command = provider === "claude"
    ? process.env.CLAUDE_PATH ?? "claude"
    : process.env.CODEX_PATH ?? "codex";
  const args = provider === "claude"
    ? ["-p", prompt, "--permission-mode", "acceptEdits", "--no-session-persistence", "--output-format", "text"]
    : [
        "--ask-for-approval", "never",
        "--sandbox", "workspace-write",
        "--cd", repositoryRoot,
        "exec",
        "--ephemeral",
        "--output-last-message", outputPath,
        prompt,
      ];
  const result = await runCommand(command, args);
  const finalMessage = provider === "codex"
    ? await readFile(outputPath, "utf8").catch(() => result.stdout)
    : result.stdout;
  await writeFile(
    path.join(runsPath, `${runId}.log`),
    `${result.stdout}\n\n--- stderr ---\n${result.stderr}`,
    "utf8",
  );

  if (result.timedOut) throw new Error(`The ${provider} run exceeded ${Math.round(timeoutMs / 60_000)} minutes.`);
  if (result.code !== 0) {
    throw new Error(truncate(result.stderr || result.stdout || `${provider} exited with code ${result.code}.`));
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "The agent run failed.";
        await finish(claim.request.id, claim.runId, "failed", message).catch((finishError) => {
          console.error("Could not record agent failure", finishError);
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
    await finish(
      request.id,
      request.runId!,
      "failed",
      "The local API stopped before this run completed. Queue the request again to retry.",
    ).catch((error) => console.error("Could not recover interrupted agent request", error));
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
