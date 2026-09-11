import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getKboSnapshot } from "./collector";
import { FIVE_MINUTES, ONE_HOUR, isGameComplete, koreaDate } from "./policy";
import { acquireKboLock, readKboStore, retryFileOperation, STORE_DIRECTORY, writeAtomicKboJson } from "./store";
import { fetchTvingCalendar, fetchTvingScheduleDay } from "./tving";
import type { KboGame, KboScheduleDay, KboScheduleMonth, KboSnapshot } from "./types";

export const ARCHIVE_YEAR = 2026;
const WEEK = 7 * 24 * ONE_HOUR;
const DIRECTORY = path.join(STORE_DIRECTORY, "archive");
const FILE = path.join(DIRECTORY, "2026.json");
const SOURCE = { name: "TVING", url: "https://www.tving.com/sports/kbo/schedule" };

export type ArchivedDay = { games: KboGame[] | null; fetchedAt: string | null; nextCheckAt: string; failures: number };
export type ArchivedMonth = {
  calendar: number[] | null;
  checkedAt: string | null;
  nextCheckAt: string | null;
  failures: number;
  days: Record<string, ArchivedDay>;
};
export type KboArchive = { version: 1; year: 2026; months: Record<string, ArchivedMonth> };
type ArchiveRuntime = {
  requested?: Set<string>;
  inFlight?: Promise<void>;
  timer?: ReturnType<typeof setInterval>;
  failureAt?: number;
};
const shared = globalThis as typeof globalThis & { __kboArchive?: ArchiveRuntime };
const runtime = shared.__kboArchive ??= {};
runtime.requested ??= new Set();

export function isArchiveMonth(month: string): boolean { return /^2026-(?:0[1-9]|1[0-2])$/.test(month); }
function emptyMonth(): ArchivedMonth { return { calendar: null, checkedAt: null, nextCheckAt: null, failures: 0, days: {} }; }
function dayDate(month: string, day: number) { return `${month}-${String(day).padStart(2, "0")}`; }
function monthLength(month: string) { return new Date(Date.UTC(ARCHIVE_YEAR, Number(month.slice(5)), 0)).getUTCDate(); }
function nextAt(now: Date, milliseconds: number) { return new Date(now.getTime() + milliseconds).toISOString(); }
function backoff(failures: number) { return Math.min(ONE_HOUR, FIVE_MINUTES * 2 ** Math.min(failures - 1, 4)); }
function validTimestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }

export async function readKboArchive(): Promise<KboArchive> {
  try {
    const value = JSON.parse(await retryFileOperation(() => readFile(FILE, "utf8"))) as KboArchive;
    if (value.version !== 1 || value.year !== ARCHIVE_YEAR || !value.months || typeof value.months !== "object" || Array.isArray(value.months)) throw new Error("Invalid KBO archive");
    for (const [month, record] of Object.entries(value.months)) {
      if (!isArchiveMonth(month) || !record || !record.days || typeof record.days !== "object" || Array.isArray(record.days)) throw new Error("Invalid archive month");
      if (record.calendar !== null && (!Array.isArray(record.calendar) || new Set(record.calendar).size !== record.calendar.length || record.calendar.some(day => !Number.isInteger(day) || day < 1 || day > monthLength(month)))) throw new Error("Invalid archive calendar");
      if (!Number.isInteger(record.failures) || record.failures < 0 || (record.nextCheckAt !== null && !validTimestamp(record.nextCheckAt)) || (record.checkedAt !== null && !validTimestamp(record.checkedAt))) throw new Error("Invalid calendar metadata");
      for (const [date, entry] of Object.entries(record.days)) {
        if (!date.startsWith(`${month}-`) || !/^2026-\d{2}-\d{2}$/.test(date) || dayDate(month, Number(date.slice(8))) !== date || Number(date.slice(8)) < 1 || Number(date.slice(8)) > monthLength(month)) throw new Error("Invalid archive date");
        if (!entry || !validTimestamp(entry.nextCheckAt) || !Number.isInteger(entry.failures) || entry.failures < 0 || (entry.fetchedAt !== null && !validTimestamp(entry.fetchedAt))) throw new Error("Invalid archive day");
        if (entry.games !== null) validateGames(entry.games, date);
      }
    }
    return value;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return { version: 1, year: ARCHIVE_YEAR, months: {} };
    throw error;
  }
}

function validateGames(games: KboGame[], date: string, previous?: KboGame[] | null) {
  if (!Array.isArray(games) || games.some(game => !game || game.date !== date || !game.id || !game.away || !game.home || (game.status === "final" && !isGameComplete(game))) || new Set(games.map(game => game.id)).size !== games.length) throw new Error("Invalid archived fixtures");
  const ids = new Set(games.map(game => game.id));
  if (previous?.some(game => !ids.has(game.id))) throw new Error("Missing previously stored fixture");
}

export function archiveMonths(today = koreaDate()): string[] {
  const count = today < "2026-01-01" ? 0 : today > "2026-12-31" ? 12 : Number(today.slice(5, 7));
  return Array.from({ length: count }, (_, index) => `2026-${String(count - index).padStart(2, "0")}`);
}

type ArchiveJob = { month: string; date?: string };
export function nextArchiveJob(store: KboArchive, months: string[], now = new Date()): ArchiveJob | null {
  const today = koreaDate(now);
  for (const month of months) {
    if (!isArchiveMonth(month)) continue;
    const record = store.months[month];
    if (!record?.nextCheckAt || Date.parse(record.nextCheckAt) <= now.getTime()) return { month };
    if (!record.calendar) continue;
    // Most recent dates appear first while the rest of 2026 is backfilled.
    for (const day of [...record.calendar].sort((a, b) => b - a)) {
      const date = dayDate(month, day);
      if (date === today) continue; // Today's games have exactly one owner: the live collector.
      const saved = record.days[date];
      if (!saved || Date.parse(saved.nextCheckAt) <= now.getTime()) return { month, date };
    }
  }
  return null;
}

async function runArchiveJob(): Promise<boolean> {
  const release = await acquireKboLock(DIRECTORY);
  if (!release) return false;
  try {
    const store = await readKboArchive();
    const today = koreaDate();
    const months = [...new Set([...runtime.requested!].reverse().concat(archiveMonths(today)))];
    const job = nextArchiveJob(store, months);
    if (!job) return false;
    const month = store.months[job.month] ?? emptyMonth();
    let updated: ArchivedMonth;
    if (!job.date) {
      try {
        const calendar = await fetchTvingCalendar(job.month);
        // Missing previously saved results are a partial feed, not an off-day.
        if (Object.entries(month.days).some(([date, entry]) => date < today && entry.games?.some(game => game.status === "final") && !calendar.includes(Number(date.slice(8))))) throw new Error("Calendar dropped stored results");
        const now = new Date();
        updated = { ...month, calendar, checkedAt: now.toISOString(), nextCheckAt: nextAt(now, job.month < today.slice(0, 7) ? WEEK : ONE_HOUR), failures: 0 };
      } catch {
        const failures = month.failures + 1;
        updated = { ...month, failures, nextCheckAt: nextAt(new Date(), backoff(failures)) };
      }
    } else {
      const date = job.date;
      if (date === koreaDate()) return true;
      const previous = month.days[date];
      let entry: ArchivedDay;
      try {
        // Reuse completed snapshots left by the live collector at midnight.
        const existing = (await readKboStore()).days[date];
        const reusable = !previous && existing?.failures === 0 && existing.data.games.every(isGameComplete);
        const games = reusable ? existing.data.games : await fetchTvingScheduleDay(date);
        validateGames(games, date, previous?.games);
        const now = new Date();
        const ttl = date > koreaDate(now) ? ONE_HOUR : games.every(isGameComplete) ? WEEK : FIVE_MINUTES;
        entry = { games, fetchedAt: reusable ? existing.fetchedAt : now.toISOString(), nextCheckAt: nextAt(now, ttl), failures: 0 };
      } catch {
        const failures = (previous?.failures ?? 0) + 1;
        entry = { games: previous?.games ?? null, fetchedAt: previous?.fetchedAt ?? null, failures, nextCheckAt: nextAt(new Date(), backoff(failures)) };
      }
      updated = { ...month, days: { ...month.days, [date]: entry } };
    }
    await writeAtomicKboJson(FILE, { ...store, months: { ...store.months, [job.month]: updated } });
    return true;
  } finally { await release(); }
}

export function tickKboArchive(): Promise<void> {
  if (runtime.inFlight) return runtime.inFlight;
  if (runtime.failureAt && Date.now() - runtime.failureAt < FIVE_MINUTES) return Promise.resolve();
  runtime.inFlight = (async () => {
    // One public request at a time. Release the disk lock after every date so
    // concurrent servers/readers can use complete snapshots during backfill.
    while (await runArchiveJob()) await delay(500);
  })().catch(() => {
    runtime.failureAt = Date.now();
    console.warn("[KBO archive] Storage unavailable; retaining saved results and retrying later.");
  }).finally(() => { runtime.inFlight = undefined; });
  return runtime.inFlight;
}

export function startKboArchive(): void {
  if (runtime.timer || process.env.KBO_COLLECTOR_ENABLED === "false") return;
  runtime.timer = setInterval(() => { void tickKboArchive(); }, 60_000);
  runtime.timer.unref?.();
  void tickKboArchive();
}

export function buildScheduleMonth(month: string, archive: KboArchive, live: KboSnapshot | null, now = new Date()): KboScheduleMonth {
  if (!isArchiveMonth(month)) throw new Error("Only 2026 schedules are supported");
  const today = koreaDate(now);
  const record = archive.months[month];
  const games: KboGame[] = [];
  const timestamps: string[] = [];
  let stale = Boolean(record?.failures);
  const days: KboScheduleDay[] = Array.from({ length: monthLength(month) }, (_, index) => {
    const date = dayDate(month, index + 1);
    // The homepage and this page show the same live snapshot, even when a
    // formerly future fixture still exists in the historical cache.
    if (date === today && live?.date === date) {
      games.push(...live.games);
      timestamps.push(live.fetchedAt);
      stale ||= live.stale;
      return { date, status: live.games.length ? "ready" : "empty", gameCount: live.games.length };
    }
    if (date === today) return { date, status: "pending", gameCount: 0 };
    const entry = date === today ? undefined : record?.days[date];
    if (entry?.games) {
      games.push(...entry.games);
      if (entry.fetchedAt) timestamps.push(entry.fetchedAt);
      stale ||= entry.failures > 0;
      return { date, status: entry.games.length ? "ready" : "empty", gameCount: entry.games.length };
    }
    if (record?.calendar && !record.calendar.includes(index + 1)) return { date, status: "empty", gameCount: 0 };
    return { date, status: entry?.failures || record?.failures ? "error" : "pending", gameCount: 0 };
  });
  if (record?.checkedAt) timestamps.push(record.checkedAt);
  const loading = days.some(day => day.status === "pending");
  const error = days.some(day => day.status === "error");
  return {
    year: ARCHIVE_YEAR, month, today, days,
    games: games.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id)),
    fetchedAt: timestamps.sort().at(-1) ?? null,
    stale: stale || error,
    warning: error || stale ? "일부 경기의 최신 정보를 확인하지 못해 저장된 자료를 표시하고 있어요." : null,
    loading, source: SOURCE,
  };
}

export async function getKboScheduleMonth(month: string): Promise<KboScheduleMonth> {
  if (!isArchiveMonth(month)) throw new Error("Only 2026 schedules are supported");
  runtime.requested!.delete(month);
  runtime.requested!.add(month);
  startKboArchive();
  if (process.env.KBO_COLLECTOR_ENABLED !== "false") void tickKboArchive();
  const archive = await readKboArchive();
  const live = month === koreaDate().slice(0, 7) ? await getKboSnapshot().catch(() => null) : null;
  return buildScheduleMonth(month, archive, live);
}
