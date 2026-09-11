import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { KboDetailStore } from "./details-types";

export const DETAILS_STORE_DIRECTORY = path.join(process.cwd(), ".cache", "kbo");
const DETAILS_FILE = "details.json";

export function emptyKboDetailStore(): KboDetailStore {
  return {
    version: 1, teams: {}, athletes: {}, lastCompletedGeneration: null, lastGameGeneration: null,
    progress: {
      state: "idle", generation: null, startedAt: null, completedAt: null,
      teamTotal: 10, teamDone: 0, athleteTotal: 0, athleteDone: 0, failures: [],
    },
  };
}

async function retryFileOperation<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const transient = error && typeof error === "object" && "code" in error && ["EPERM", "EACCES", "EBUSY"].includes(String(error.code));
      if (!transient || attempt >= 5) throw error;
      await delay(25 * 2 ** attempt);
    }
  }
}

export async function readKboDetailStore(directory = DETAILS_STORE_DIRECTORY): Promise<KboDetailStore> {
  try {
    const value = JSON.parse(await retryFileOperation(() => readFile(path.join(directory, DETAILS_FILE), "utf8"))) as KboDetailStore;
    if (value.version !== 1 || !value.teams || Array.isArray(value.teams) || !value.athletes || Array.isArray(value.athletes)
      || !value.progress || !["idle", "collecting", "partial", "complete"].includes(value.progress.state)) {
      throw new Error("Invalid KBO detail cache");
    }
    // Cache created by the first detail-collector revision remains usable.
    const legacy = value as unknown as { lastGameGeneration?: string | null };
    if (legacy.lastGameGeneration === undefined) value.lastGameGeneration = value.lastCompletedGeneration?.startsWith("games:") ? value.lastCompletedGeneration : null;
    return value;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return emptyKboDetailStore();
    throw error;
  }
}

export async function writeKboDetailStore(store: KboDetailStore, directory = DETAILS_STORE_DIRECTORY): Promise<void> {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, DETAILS_FILE);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
    await retryFileOperation(() => rename(temporary, target));
  } finally { await unlink(temporary).catch(() => {}); }
}

async function acquireNamedLock(name: string, staleAfter: number, directory = DETAILS_STORE_DIRECTORY): Promise<(() => Promise<void>) | null> {
  await mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, name);
  const owner = `${process.pid}:${randomUUID()}`;
  try {
    const handle = await open(lockPath, "wx");
    try { await handle.writeFile(owner); }
    catch (error) { await handle.close(); await unlink(lockPath).catch(() => {}); throw error; }
    return async () => {
      await handle.close();
      if (await readFile(lockPath, "utf8").catch(() => null) === owner) await unlink(lockPath).catch(() => {});
    };
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
    const info = await stat(lockPath).catch(() => null);
    if (info && Date.now() - info.mtimeMs > staleAfter) await unlink(lockPath).catch(() => {});
    return null;
  }
}

export function acquireKboDetailLock(directory = DETAILS_STORE_DIRECTORY): Promise<(() => Promise<void>) | null> {
  return acquireNamedLock("details.lock", 2 * 60_000, directory);
}

export function acquireKboDetailRunLock(directory = DETAILS_STORE_DIRECTORY): Promise<(() => Promise<void>) | null> {
  return acquireNamedLock("details-collector.lock", 30 * 60_000, directory);
}
