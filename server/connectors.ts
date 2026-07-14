import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { connectorCatalog, getConnectorDefinition, type ConnectorId } from "../src/shared/connectors.ts";

const execFileAsync = promisify(execFile);
const codexPath = process.env.CODEX_PATH ?? "codex";
const claudePath = process.env.CLAUDE_PATH ?? "claude";
const provider = process.env.FIELD_AGENT_PROVIDER === "claude" ? "claude" : "codex";
const providerLabel = provider === "claude" ? "Claude Code" : "Codex";
const loginTimeoutMs = Number(process.env.FIELD_CONNECTOR_LOGIN_TIMEOUT_MS ?? 3 * 60 * 1_000);

type McpServer = {
  name: string;
  enabled: boolean;
  auth_status?: string;
  transport?: { type?: string; url?: string };
};

type TransientConnection = {
  status: "connecting" | "connected" | "failed";
  message?: string;
};

type ActiveLogin = {
  child: ReturnType<typeof spawn>;
  settled: boolean;
  timer?: NodeJS.Timeout;
};

const transientConnections = new Map<ConnectorId, TransientConnection>();
const activeLogins = new Map<ConnectorId, ActiveLogin>();

process.once("exit", () => {
  for (const login of activeLogins.values()) login.child.kill("SIGTERM");
});

async function listMcpServers(): Promise<McpServer[]> {
  if (provider === "claude") {
    const results: Array<McpServer | null> = await Promise.all(connectorCatalog.map(async (connector): Promise<McpServer | null> => {
      try {
        const { stdout } = await execFileAsync(claudePath, ["mcp", "get", connector.id], {
          maxBuffer: 512 * 1024,
        });
        const connected = /Status:.*Connected/i.test(stdout) && !/Failed to connect/i.test(stdout);
        return {
          name: connector.id,
          enabled: true,
          auth_status: connected ? "authenticated" : "unauthenticated",
          transport: { type: "streamable_http", url: connector.endpoint },
        };
      } catch {
        return null;
      }
    }));
    return results.filter((server): server is McpServer => server !== null);
  }
  try {
    const { stdout } = await execFileAsync(codexPath, ["mcp", "list", "--json"], {
      maxBuffer: 2 * 1024 * 1024,
    });
    return JSON.parse(stdout) as McpServer[];
  } catch (error) {
    console.error("Could not read Codex MCP configuration", error);
    return [];
  }
}

function connectorState(connector: (typeof connectorCatalog)[number], server?: McpServer) {
  const transient = transientConnections.get(connector.id);
  if (transient) return transient;
  if (server?.auth_status === "authenticated") return { status: "connected" as const };
  if (server) return {
    status: "configured" as const,
    message: `Configured in ${providerLabel}; this host does not report OAuth health.`,
  };
  return { status: "available" as const };
}

export async function getConnectorStates() {
  const servers = await listMcpServers();
  return {
    provider,
    connectors: connectorCatalog.map((connector) => {
      const server = servers.find((item) => item.name === connector.id);
      return { ...connector, ...connectorState(connector, server) };
    }),
  };
}

function settleLogin(id: ConnectorId, state: TransientConnection) {
  const login = activeLogins.get(id);
  if (!login || login.settled) return;
  login.settled = true;
  if (login.timer) clearTimeout(login.timer);
  activeLogins.delete(id);
  transientConnections.set(id, state);
}

function stopLogin(id: ConnectorId, message: string) {
  const login = activeLogins.get(id);
  if (!login || login.settled) {
    transientConnections.set(id, { status: "failed", message });
    return;
  }
  settleLogin(id, { status: "failed", message });
  login.child.kill("SIGTERM");
  setTimeout(() => {
    if (login.child.exitCode === null) login.child.kill("SIGKILL");
  }, 5_000).unref();
}

function beginLogin(id: ConnectorId) {
  if (activeLogins.has(id)) return;
  transientConnections.set(id, {
    status: "connecting",
    message: "Waiting for the browser to return. You can cancel and try again.",
  });
  const child = spawn(provider === "claude" ? claudePath : codexPath, ["mcp", "login", id], {
    env: process.env,
    shell: false,
    stdio: ["ignore", "ignore", "pipe"],
  });
  const login: ActiveLogin = { child, settled: false };
  activeLogins.set(id, login);
  login.timer = setTimeout(() => {
    stopLogin(id, "Sign-in timed out. Try again when you are ready.");
  }, loginTimeoutMs);
  login.timer.unref();
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.once("error", (error) => {
    settleLogin(id, { status: "failed", message: error.message });
  });
  child.once("close", (code) => {
    if (code === 0) settleLogin(id, { status: "connected", message: `Connected to ${providerLabel}.` });
    else settleLogin(id, {
      status: "failed",
      message: stderr.trim().slice(0, 500) || "Sign-in did not complete.",
    });
  });
}

export async function connectConnector(id: string) {
  const connector = getConnectorDefinition(id);
  if (!connector) throw new Error("Unknown connector.");
  const servers = await listMcpServers();
  const existing = servers.find((server) => server.name === connector.id);
  if (!existing) {
    const command = provider === "claude" ? claudePath : codexPath;
    const args = provider === "claude"
      ? ["mcp", "add", "--transport", "http", "--scope", "user", connector.id, connector.endpoint]
      : ["mcp", "add", connector.id, "--url", connector.endpoint];
    await execFileAsync(command, args, {
      maxBuffer: 2 * 1024 * 1024,
    });
  }
  if (existing?.auth_status === "authenticated") {
    transientConnections.set(connector.id, { status: "connected", message: `Already connected to ${providerLabel}.` });
  } else if (transientConnections.get(connector.id)?.status !== "connecting") {
    beginLogin(connector.id);
  }
  return getConnectorStates();
}

export async function cancelConnectorLogin(id: string) {
  const connector = getConnectorDefinition(id);
  if (!connector) throw new Error("Unknown connector.");
  stopLogin(connector.id, "Sign-in stopped. Try again when you are ready.");
  return getConnectorStates();
}
