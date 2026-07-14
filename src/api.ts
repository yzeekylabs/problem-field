import type { OperationSet, Workspace } from "./shared/workspace.ts";
import type { ConnectorDefinition } from "./shared/connectors.ts";

type ApiErrorBody = {
  error?: string;
  message?: string;
  actual?: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function getWorkspace(): Promise<Workspace> {
  const response = await fetch("/api/workspace", { cache: "no-store" });
  if (!response.ok) throw new ApiError("Could not load the field.", response.status, {});
  return response.json() as Promise<Workspace>;
}

export async function postOperations(input: OperationSet): Promise<Workspace> {
  const response = await fetch("/api/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(body.message ?? "The field could not be updated.", response.status, body);
  }
  return response.json() as Promise<Workspace>;
}

export async function importSourceFile(
  baseRevision: number,
  file: File,
  metadata: { title: string; kind: string; origin?: string; summary?: string },
): Promise<Workspace> {
  const body = new FormData();
  body.set("baseRevision", String(baseRevision));
  body.set("file", file);
  body.set("title", metadata.title);
  body.set("kind", metadata.kind);
  if (metadata.origin) body.set("origin", metadata.origin);
  if (metadata.summary) body.set("summary", metadata.summary);

  const response = await fetch("/api/sources/import", { method: "POST", body });
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(errorBody.message ?? "The source could not be imported.", response.status, errorBody);
  }
  return response.json() as Promise<Workspace>;
}

export type ConnectorState = ConnectorDefinition & {
  status: "available" | "configured" | "connecting" | "connected" | "failed";
  message?: string;
};

export type ConnectorStateResponse = {
  provider: "codex" | "claude";
  connectors: ConnectorState[];
};

export async function getConnectors(): Promise<ConnectorStateResponse> {
  const response = await fetch("/api/connectors", { cache: "no-store" });
  if (!response.ok) throw new ApiError("Could not read connector availability.", response.status, {});
  return response.json() as Promise<ConnectorStateResponse>;
}

export async function connectConnector(id: string): Promise<ConnectorStateResponse> {
  const response = await fetch(`/api/connectors/${encodeURIComponent(id)}/connect`, { method: "POST" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(body.message ?? "The connector could not be started.", response.status, body);
  }
  return response.json() as Promise<ConnectorStateResponse>;
}

export async function cancelConnectorLogin(id: string): Promise<ConnectorStateResponse> {
  const response = await fetch(`/api/connectors/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(body.message ?? "The sign-in could not be stopped.", response.status, body);
  }
  return response.json() as Promise<ConnectorStateResponse>;
}
