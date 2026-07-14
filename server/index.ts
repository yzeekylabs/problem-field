import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ZodError } from "zod";

import { DomainError, operationSetSchema } from "../src/shared/workspace.ts";
import { readWorkspace, RevisionConflictError, writeOperations } from "./store.ts";

const app = new Hono();

app.get("/api/health", (context) => context.json({ ok: true }));

app.get("/api/workspace", async (context) => {
  context.header("Cache-Control", "no-store");
  return context.json(await readWorkspace());
});

app.post("/api/operations", async (context) => {
  try {
    const input = operationSetSchema.parse(await context.req.json());
    const workspace = await writeOperations(input);
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

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`Problem Field API listening on http://127.0.0.1:${info.port}`);
});
