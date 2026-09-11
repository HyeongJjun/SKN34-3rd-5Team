import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { assertCompleteCollection, type CollectionRecord } from "./policy";

export type KboStore = {
  version: 1;
  days: Record<string, CollectionRecord>;
  retries: Record<string, { nextCheckAt: string; failures: number }>;
};
export const STORE_DIRECTORY = path.join(process.cwd(), ".cache", "kbo");
const FILE_NAME = "collection.json";

export async function retryFileOperation<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const transient = error && typeof error === "object" && "code" in error && ["EPERM", "EACCES", "EBUSY"].includes(String(error.code));
      if (!transient || attempt >= 5) throw error;
      // Windows readers/antivirus can briefly hold the replacement destination.
      // Never remove the good snapshot to make a rename succeed.
      await delay(25 * 2 ** attempt);
    }
  }
}

export async function readKboStore(directory = STORE_DIRECTORY): Promise<KboStore> {
  try {
    const value = JSON.parse(await retryFileOperation(() => readFile(path.join(directory, FILE_NAME), "utf8"))) as KboStore;
    if (value.version !== 1 || !value.days || typeof value.days !== "object" || Array.isArray(value.days) || !value.retries || typeof value.retries !== "object") throw new Error("Invalid KBO cache");
    for (const [date, record] of Object.entries(value.days)) {
      assertCompleteCollection(null, record.data, date);
      if (![record.fetchedAt, record.updatedAt, record.control?.nextCheckAt].every(item => Number.isFinite(Date.parse(item))) || !["hourly", "five-minute", "final-check"].includes(record.control?.mode) || !Number.isInteger(record.failures)) throw new Error("Invalid KBO cache metadata");
    }
    return value;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return { version: 1, days: {}, retries: {} };
    // Keep a corrupt file for diagnosis; do not silently overwrite stored results.
    throw error;
  }
}

export async function writeKboStore(store: KboStore, directory = STORE_DIRECTORY): Promise<void> {
  await writeAtomicKboJson(path.join(directory, FILE_NAME), store);
}

export async function writeAtomicKboJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
    await retryFileOperation(() => rename(temporary, file));
  } finally { await unlink(temporary).catch(() => {}); }
}

// Filesystem exclusion also covers dev reloads and a second local Next process.
// One collection is timeout-bounded well below this abandoned-lock timeout.
export async function acquireKboLock(directory = STORE_DIRECTORY): Promise<(() => Promise<void>) | null> {
  await mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, "collector.lock");
  const owner = `${process.pid}:${randomUUID()}`;
  try {
    const handle = await open(lockPath, "wx");
    try { await handle.writeFile(owner); }
    catch (error) { await handle.close(); await unlink(lockPath).catch(() => {}); throw error; }
    return async () => {
      await handle.close();
      // An abandoned lock may have been replaced while this worker was paused.
      if (await readFile(lockPath, "utf8").catch(() => null) === owner) await unlink(lockPath).catch(() => {});
    };
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
    const info = await stat(lockPath).catch(() => null);
    if (info && Date.now() - info.mtimeMs > 5 * 60_000) await unlink(lockPath).catch(() => {});
    return null;
  }
}
