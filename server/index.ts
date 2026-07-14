import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ZodError } from "zod";

import { DomainError, operationSetSchema } from "../src/shared/workspace.ts";
import { kickAgentRunner, startAgentRunner } from "./agent-runner.ts";
import { cancelConnectorLogin, connectConnector, getConnectorStates } from "./connectors.ts";
import {
  readSourceAsset,
  readWorkspace,
  removeSourceAsset,
  RevisionConflictError,
  writeOperations,
  writeSourceAsset,
} from "./store.ts";

const app = new Hono();

app.get("/api/health", (context) => context.json({ ok: true }));

app.get("/api/workspace", async (context) => {
  context.header("Cache-Control", "no-store");
  return context.json(await readWorkspace());
});

app.get("/api/connectors", async (context) => {
  context.header("Cache-Control", "no-store");
  return context.json(await getConnectorStates());
});

app.post("/api/connectors/:id/connect", async (context) => {
  try {
    return context.json(await connectConnector(context.req.param("id")));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The connector could not be started.";
    return context.json({ error: "connector_failed", message }, 422);
  }
});

app.post("/api/connectors/:id/cancel", async (context) => {
  try {
    return context.json(await cancelConnectorLogin(context.req.param("id")));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The sign-in could not be stopped.";
    return context.json({ error: "connector_cancel_failed", message }, 422);
  }
});

app.get("/api/assets/:fileName", async (context) => {
  const fileName = context.req.param("fileName");
  const workspace = await readWorkspace();
  const source = workspace.sources.find((item) => item.asset?.fileName === fileName);
  if (!source?.asset) return context.json({ error: "not_found" }, 404);
  const safeDownloadName = source.asset.originalName.replace(/[^\x20-\x7E]|["\\]/g, "");
  context.header("Content-Type", source.asset.mimeType);
  context.header("Content-Disposition", `inline; filename="${safeDownloadName || "source"}"`);
  context.header("Cache-Control", "private, max-age=3600");
  return context.body(await readSourceAsset(fileName));
});

app.post("/api/operations", async (context) => {
  try {
    const input = operationSetSchema.parse(await context.req.json());
    const workspace = await writeOperations(input);
    kickAgentRunner();
    return context.json(workspace);
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return context.json(
        {
          error: "revision_conflict",
          message: error.message,
          expected: error.expected,
          actual: error.actual,
        },
        409,
      );
    }
    if (error instanceof ZodError) {
      return context.json(
        { error: "invalid_operation", message: "Operation did not match the schema.", issues: error.issues },
        422,
      );
    }
    if (error instanceof DomainError) {
      return context.json({ error: "domain_error", message: error.message }, 422);
    }
    console.error(error);
    return context.json({ error: "internal_error", message: "The workspace could not be updated." }, 500);
  }
});

app.post("/api/sources/import", async (context) => {
  let assetFileName: string | undefined;
  try {
    const body = await context.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return context.json({ error: "missing_file", message: "Choose a file to import." }, 422);
    }
    if (file.size > 50 * 1024 * 1024) {
      return context.json({ error: "file_too_large", message: "Files are limited to 50 MB locally." }, 413);
    }

    const baseRevision = Number(body.baseRevision);
    const title = String(body.title ?? "").trim();
    const kind = String(body.kind ?? "other");
    const origin = String(body.origin ?? "").trim();
    const suppliedSummary = String(body.summary ?? "").trim();
    const sourceId = `source-${crypto.randomUUID()}`;
    assetFileName = await writeSourceAsset(sourceId, file);

    const isText =
      file.type.startsWith("text/") ||
      ["application/json", "application/xml"].includes(file.type) ||
      /\.(txt|md|json|csv|tsv)$/i.test(file.name);
    const summary = suppliedSummary || (isText ? await file.text() : undefined);
    const importedAt = new Date().toISOString();
    const operations = [
      {
        type: "addSource" as const,
        source: {
          id: sourceId,
          title,
          kind,
          ...(origin ? { origin } : {}),
          ...(summary ? { summary } : {}),
          asset: {
            fileName: assetFileName,
            originalName: file.name,
            mimeType: file.type || "application/octet-stream",
            bytes: file.size,
          },
          extraction: {
            status: isText ? ("ready" as const) : ("queued" as const),
            ...(isText ? { method: "local-text" } : {}),
            updatedAt: importedAt,
          },
          importedAt,
        },
      },
      ...(!isText
        ? [
            {
              type: "addAgentRequest" as const,
              request: {
                id: `request-${crypto.randomUUID()}`,
                prompt: `Inspect ${`data/local/assets/${assetFileName}`} for source '${sourceId}'. Extract usable text or describe the observable material without inventing content. Update the source summary and extraction state through the field CLI; do not create insights unless separately requested.`,
                scopeCardIds: [],
              },
            },
          ]
        : []),
    ];

    const input = operationSetSchema.parse({ baseRevision, actor: "human", operations });
    const workspace = await writeOperations(input);
    kickAgentRunner();
    return context.json(workspace);
  } catch (error) {
    if (assetFileName) await removeSourceAsset(assetFileName);
    if (error instanceof RevisionConflictError) {
      return context.json(
        { error: "revision_conflict", message: error.message, expected: error.expected, actual: error.actual },
        409,
      );
    }
    if (error instanceof ZodError) {
      return context.json(
        { error: "invalid_source", message: "The source metadata was invalid.", issues: error.issues },
        422,
      );
    }
    console.error(error);
    return context.json({ error: "import_failed", message: "The source could not be imported." }, 500);
  }
});

const port = Number(process.env.PORT ?? 8787);
startAgentRunner();
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`Problem Field API listening on http://127.0.0.1:${info.port}`);
});
