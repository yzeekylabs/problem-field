import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyOperationSet,
  parseWorkspace,
  type OperationSet,
  type Workspace,
} from "../src/shared/workspace.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedWorkspacePath = path.join(repositoryRoot, "data", "workspace.json");
const localDataPath = path.join(repositoryRoot, "data", "local");
export const workspacePath = path.join(localDataPath, "workspace.json");
export const assetsPath = path.join(localDataPath, "assets");
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

async function ensureLocalWorkspace() {
  await mkdir(localDataPath, { recursive: true });
  try {
    await stat(workspacePath);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ENOENT")) throw error;
    const seed = await readFile(seedWorkspacePath, "utf8");
    await writeFile(workspacePath, seed, { encoding: "utf8", flag: "wx" }).catch((writeError) => {
      if (!(writeError instanceof Error) || !writeError.message.includes("EEXIST")) throw writeError;
    });
  }
}

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
  await ensureLocalWorkspace();
  const contents = await readFile(workspacePath, "utf8");
  return parseWorkspace(JSON.parse(contents));
}

export async function writeOperations(input: OperationSet): Promise<Workspace> {
  await ensureLocalWorkspace();
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

function safeExtension(originalName: string) {
  const extension = path.extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
}

export async function writeSourceAsset(sourceId: string, file: File) {
  await mkdir(assetsPath, { recursive: true });
  const fileName = `${sourceId}-${crypto.randomUUID()}${safeExtension(file.name)}`;
  const destination = path.join(assetsPath, fileName);
  await writeFile(destination, new Uint8Array(await file.arrayBuffer()), { flag: "wx" });
  return fileName;
}

export async function removeSourceAsset(fileName: string) {
  await unlink(path.join(assetsPath, path.basename(fileName))).catch(() => undefined);
}

export async function readSourceAsset(fileName: string) {
  if (path.basename(fileName) !== fileName) throw new Error("Invalid asset name.");
  return readFile(path.join(assetsPath, fileName));
}
