import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  KBO_TEAM_CODES, type KboAthleteDetail, type KboDetailEntry, type KboDetailSnapshot,
  type KboDetailStore, type KboTeamCode, type KboTeamDetail,
} from "./details-types";
import { fetchTvingAthleteDetail, fetchTvingTeamDetail } from "./tving-details";
import { acquireKboDetailLock, acquireKboDetailRunLock, readKboDetailStore, writeKboDetailStore } from "./details-store";
import { readKboStore } from "./store";
import { koreaDate } from "./policy";

const SOURCE = { name: "TVING" as const, url: "https://www.tving.com/sports/kbo/history" };
const RETRY_INTERVAL = 5 * 60_000;
const DAILY_INTERVAL = 24 * 60 * 60_000;

type DetailRuntime = {
  fullInFlight?: Promise<void>;
  timer?: ReturnType<typeof setInterval>;
  teamInFlight: Map<string, Promise<KboTeamDetail>>;
  athleteInFlight: Map<string, Promise<KboAthleteDetail>>;
  updateQueue: Promise<void>;
  lastFailureAt?: number;
};
const globalRuntime = globalThis as typeof globalThis & { __kboDetailsCollector?: DetailRuntime };
const runtime: DetailRuntime = globalRuntime.__kboDetailsCollector ??= {
  teamInFlight: new Map(), athleteInFlight: new Map(), updateQueue: Promise.resolve(),
};

async function withStoreUpdate(update: (store: KboDetailStore) => KboDetailStore | void): Promise<KboDetailStore> {
  let result: KboDetailStore | undefined;
  const operation = runtime.updateQueue.catch(() => {}).then(async () => {
    let release: (() => Promise<void>) | null = null;
    for (let attempt = 0; attempt < 100 && !release; attempt++) {
      release = await acquireKboDetailLock();
      if (!release) await delay(50);
    }
    if (!release) throw new Error("KBO 상세 저장 잠금을 얻지 못했습니다");
    try {
      const store = await readKboDetailStore();
      result = update(store) ?? store;
      await writeKboDetailStore(result);
    } finally { await release(); }
  });
  runtime.updateQueue = operation;
  await operation;
  return result!;
}

function entry<T>(data: T, generation: string): KboDetailEntry<T> {
  return { data, generation, fetchedAt: new Date().toISOString() };
}

async function fetchTeamOnce(code: KboTeamCode): Promise<KboTeamDetail> {
  const current = runtime.teamInFlight.get(code);
  if (current) return current;
  const pending = fetchTvingTeamDetail(code).finally(() => runtime.teamInFlight.delete(code));
  runtime.teamInFlight.set(code, pending);
  return pending;
}

async function collectTeam(code: KboTeamCode, generation: string): Promise<KboTeamDetail> {
  const data = await fetchTeamOnce(code);
  await withStoreUpdate((store) => ({ ...store, teams: { ...store.teams, [code]: entry(data, generation) } }));
  return data;
}

async function fetchAthleteOnce(code: string): Promise<KboAthleteDetail> {
  const current = runtime.athleteInFlight.get(code);
  if (current) return current;
  const pending = fetchTvingAthleteDetail(code).finally(() => runtime.athleteInFlight.delete(code));
  runtime.athleteInFlight.set(code, pending);
  return pending;
}

async function collectAthlete(code: string, generation: string): Promise<KboAthleteDetail> {
  const data = await fetchAthleteOnce(code);
  await withStoreUpdate((store) => ({ ...store, athletes: { ...store.athletes, [code]: entry(data, generation) } }));
  return data;
}

async function desiredGeneration(store: KboDetailStore, now = new Date()): Promise<string | null> {
  const collection = await readKboStore();
  const finished = Object.entries(collection.days).filter(([, record]) => record.control.finished && record.control.completionKey).sort(([a], [b]) => b.localeCompare(a))[0];
  if (finished) {
    const [date, record] = finished;
    const hash = createHash("sha256").update(record.control.completionKey!).digest("hex").slice(0, 12);
    const completed = `games:${date}:${hash}`;
    if (store.lastGameGeneration !== completed) return completed;
  }
  if (!store.lastCompletedGeneration) return "initial";
  const completedAt = store.progress.completedAt ? Date.parse(store.progress.completedAt) : NaN;
  if (!Number.isFinite(completedAt) || now.getTime() - completedAt >= DAILY_INTERVAL) return `daily:${koreaDate(now)}`;
  return null;
}

async function settleLimited<T, R>(values: T[], concurrency: number, callback: (value: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try { results[index] = { status: "fulfilled", value: await callback(values[index]) }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  }));
  return results;
}

function athleteCodesFromTeams(store: KboDetailStore, generation: string): string[] {
  const codes = new Set<string>();
  for (const code of KBO_TEAM_CODES) {
    const team = store.teams[code];
    if (!team || team.generation !== generation) continue;
    for (const athletes of Object.values(team.data.rosters)) for (const athlete of athletes) codes.add(athlete.code);
    for (const groups of Object.values(team.data.rankings)) for (const group of groups) for (const athlete of group.athletes) codes.add(athlete.code);
  }
  return [...codes].sort();
}

async function runFullCollection(generation: string): Promise<void> {
  const startedAt = new Date().toISOString();
  await withStoreUpdate((store) => ({
    ...store, progress: { state: "collecting", generation, startedAt, completedAt: null, teamTotal: KBO_TEAM_CODES.length,
      teamDone: KBO_TEAM_CODES.filter((code) => store.teams[code]?.generation === generation).length,
      athleteTotal: 0, athleteDone: 0, failures: [] },
  }));
  const failures: string[] = [];
  let existing = await readKboDetailStore();
  const pendingTeams = KBO_TEAM_CODES.filter((code) => existing.teams[code]?.generation !== generation);
  const teamResults = await settleLimited(pendingTeams, 2, fetchTeamOnce);
  await withStoreUpdate((store) => {
    const teams = { ...store.teams };
    teamResults.forEach((result, index) => {
      const code = pendingTeams[index];
      if (result.status === "fulfilled") teams[code] = entry(result.value, generation);
      else failures.push(`team:${code}`);
    });
    return { ...store, teams, progress: { ...store.progress, teamDone: KBO_TEAM_CODES.filter((code) => teams[code]?.generation === generation).length, failures: [...failures] } };
  });

  existing = await readKboDetailStore();
  const athleteCodes = athleteCodesFromTeams(existing, generation);
  await withStoreUpdate((store) => ({ ...store, progress: { ...store.progress, athleteTotal: athleteCodes.length, athleteDone: athleteCodes.filter((code) => store.athletes[code]?.generation === generation).length, failures: [...failures] } }));
  const pendingAthletes = athleteCodes.filter((code) => existing.athletes[code]?.generation !== generation);
  for (let index = 0; index < pendingAthletes.length; index += 40) {
    const batch = pendingAthletes.slice(index, index + 40);
    const results = await settleLimited(batch, 4, fetchAthleteOnce);
    await withStoreUpdate((store) => {
      const athletes = { ...store.athletes };
      results.forEach((result, resultIndex) => {
        const code = batch[resultIndex];
        if (result.status === "fulfilled") athletes[code] = entry(result.value, generation);
        else failures.push(`athlete:${code}`);
      });
      return { ...store, athletes, progress: { ...store.progress,
        athleteDone: athleteCodes.filter((code) => athletes[code]?.generation === generation).length,
        failures: [...new Set(failures)].slice(0, 200) } };
    });
  }

  const finalStore = await readKboDetailStore();
  const teamDone = KBO_TEAM_CODES.filter((code) => finalStore.teams[code]?.generation === generation).length;
  const athleteDone = athleteCodes.filter((code) => finalStore.athletes[code]?.generation === generation).length;
  const complete = teamDone === KBO_TEAM_CODES.length && athleteCodes.length > 0 && athleteDone === athleteCodes.length && failures.length === 0;
  await withStoreUpdate((store) => ({
    ...store, lastCompletedGeneration: complete ? generation : store.lastCompletedGeneration,
    lastGameGeneration: complete && generation.startsWith("games:") ? generation : store.lastGameGeneration,
    progress: { ...store.progress, state: complete ? "complete" : "partial", generation, completedAt: complete ? new Date().toISOString() : null,
      teamDone, athleteTotal: athleteCodes.length, athleteDone, failures: [...new Set(failures)].slice(0, 200) },
  }));
  console.info(`[KBO details] ${generation}: ${teamDone}/${KBO_TEAM_CODES.length} teams, ${athleteDone}/${athleteCodes.length} athletes, ${complete ? "complete" : "partial"}`);
}

export async function tickKboDetailsCollection(): Promise<void> {
  if (runtime.fullInFlight) return runtime.fullInFlight;
  if (runtime.lastFailureAt && Date.now() - runtime.lastFailureAt < RETRY_INTERVAL) return;
  runtime.fullInFlight = (async () => {
    const release = await acquireKboDetailRunLock();
    if (!release) return;
    try {
      const store = await readKboDetailStore();
      const generation = await desiredGeneration(store);
      if (generation) await runFullCollection(generation);
    } finally { await release(); }
  })().catch(() => {
    runtime.lastFailureAt = Date.now();
    console.warn("[KBO details] collection failed; keeping the saved details.");
  }).finally(() => { runtime.fullInFlight = undefined; });
  return runtime.fullInFlight;
}

export function startKboDetailsCollector(): void {
  if (runtime.timer || process.env.KBO_COLLECTOR_ENABLED === "false") return;
  runtime.timer = setInterval(() => { void tickKboDetailsCollection(); }, RETRY_INTERVAL);
  runtime.timer.unref?.();
  void tickKboDetailsCollection();
}

function snapshot<T>(stored: KboDetailEntry<T>, store: KboDetailStore, url: string): KboDetailSnapshot<T> {
  return { ...stored.data, fetchedAt: stored.fetchedAt, source: { ...SOURCE, url }, collecting: store.progress.state === "collecting", progress: store.progress };
}

export async function getKboTeamDetail(code: KboTeamCode): Promise<KboDetailSnapshot<KboTeamDetail> | null> {
  let store = await readKboDetailStore();
  if (!store.teams[code] && process.env.KBO_COLLECTOR_ENABLED !== "false") {
    const generation = store.progress.generation ?? store.lastCompletedGeneration ?? "initial";
    await collectTeam(code, generation).catch(() => null);
    store = await readKboDetailStore();
  }
  void tickKboDetailsCollection();
  const stored = store.teams[code];
  return stored ? snapshot(stored, store, `https://www.tving.com/sports/kbo/team/${code}`) : null;
}

export async function getKboAthleteDetail(code: string): Promise<KboDetailSnapshot<KboAthleteDetail> | null> {
  let store = await readKboDetailStore();
  if (!store.athletes[code] && process.env.KBO_COLLECTOR_ENABLED !== "false") {
    const generation = store.progress.generation ?? store.lastCompletedGeneration ?? "initial";
    await collectAthlete(code, generation).catch(() => null);
    store = await readKboDetailStore();
  }
  void tickKboDetailsCollection();
  const stored = store.athletes[code];
  return stored ? snapshot(stored, store, `https://www.tving.com/sports/kbo/athlete/${code}`) : null;
}

export async function getKboDetailsStatus(): Promise<KboDetailStore["progress"]> {
  void tickKboDetailsCollection();
  return (await readKboDetailStore()).progress;
}
