import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { connectorCatalog, getConnectorDefinition, type ConnectorId } from "../src/shared/connectors.ts";

const execFileAsync = promisify(execFile);
const codexPath = process.env.CODEX_PATH ?? "codex";
const claudePath = process.env.CLAUDE_PATH ?? "claude";
const provider = process.env.FIELD_AGENT_PROVIDER === "claude" ? "claude" : "codex";
const providerLabel = provider === "claude" ? "Claude Code" : "Codex";

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

const transientConnections = new Map<ConnectorId, TransientConnection>();

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
  if (connector.availability === "setup-required") return { status: "unavailable" as const };
  if (server?.auth_status === "authenticated") return { status: "connected" as const };
  if (server) return { status: "configured" as const };
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

function beginLogin(id: ConnectorId) {
  transientConnections.set(id, { status: "connecting", message: "Finish sign-in in the browser window." });
  const child = spawn(provider === "claude" ? claudePath : codexPath, ["mcp", "login", id], {
    env: process.env,
    shell: false,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.once("error", (error) => {
    transientConnections.set(id, { status: "failed", message: error.message });
  });
  child.once("close", (code) => {
    if (code === 0) transientConnections.set(id, { status: "connected", message: `Connected to ${providerLabel}.` });
    else transientConnections.set(id, {
      status: "failed",
      message: stderr.trim().slice(0, 500) || "Sign-in did not complete.",
    });
  });
}

export async function connectConnector(id: string) {
  const connector = getConnectorDefinition(id);
  if (!connector) throw new Error("Unknown connector.");
  if (connector.availability !== "featured" || !connector.endpoint) {
    throw new Error(connector.constraint ?? "This connector needs manual setup.");
  }
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
