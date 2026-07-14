import { open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyOperationSet,
  type OperationSet,
  type Workspace,
  workspaceSchema,
} from "../src/shared/workspace.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const workspacePath = path.join(repositoryRoot, "data", "workspace.json");
const lockPath = `${workspacePath}.lock`;

export class RevisionConflictError extends Error {
  constructor(
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(`Workspace changed: expected revision ${expected}, found ${actual}.`);
    this.name = "RevisionConflictError";
  }
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function acquireLock() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 3_000) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
      return async () => {
        await handle.close();
        await unlink(lockPath).catch(() => undefined);
      };
    } catch (error) {
      if (!(error instanceof Error) || !(`${error.message}`.includes("EEXIST"))) throw error;

      const lockStat = await stat(lockPath).catch(() => null);
      if (lockStat && Date.now() - lockStat.mtimeMs > 30_000) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }
      await wait(40);
    }
  }

  throw new Error("Workspace is busy. Try the operation again.");
}

export async function readWorkspace(): Promise<Workspace> {
  const contents = await readFile(workspacePath, "utf8");
  return workspaceSchema.parse(JSON.parse(contents));
}

export async function writeOperations(input: OperationSet): Promise<Workspace> {
  const release = await acquireLock();
  try {
    const current = await readWorkspace();
    if (current.revision !== input.baseRevision) {
      throw new RevisionConflictError(input.baseRevision, current.revision);
    }

    const next = applyOperationSet(current, input);
    const temporaryPath = `${workspacePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporaryPath, workspacePath);
    return next;
  } finally {
    await release();
  }
}
