import { fetchTvingKbo } from "./tving";
import { FIVE_MINUTES, ONE_HOUR, koreaDate, recordFailedCollection, recordSuccessfulCollection } from "./policy";
import { acquireKboLock, readKboStore, writeKboStore } from "./store";
import type { KboSnapshot } from "./types";

const SOURCE = { name: "TVING", url: "https://www.tving.com/sports/kbo" };
type CollectorRuntime = {
  inFlight?: Promise<void>;
  timer?: ReturnType<typeof setInterval>;
  nextWake?: ReturnType<typeof setTimeout>;
  lastFailureAt?: number;
  startupRefreshPending?: boolean;
};
const shared = globalThis as typeof globalThis & { __kboCollector?: CollectorRuntime };
const runtime = shared.__kboCollector ??= {};

async function collectDueDays(now: Date): Promise<void> {
  const release = await acquireKboLock();
  if (!release) return;
  try {
    let store = await readKboStore();
    const today = koreaDate(now);
    const previousDates = Object.keys(store.days).filter(date => date < today && !store.days[date].control.finished).sort().slice(-2);
    for (const date of [today, ...previousDates]) {
      const previous = store.days[date] ?? null;
      const due = previous?.control.nextCheckAt ?? store.retries[date]?.nextCheckAt;
      const startupRefresh = date === today && runtime.startupRefreshPending;
      const needsPitcherFields = previous?.failures === 0 && previous.data.games.some(game => !Object.hasOwn(game.away, "startingPitcher") || !Object.hasOwn(game.home, "startingPitcher"));
      const needsIndividualRankings = previous?.failures === 0
        && (!previous.data.individualRankings || !previous.data.individualRankings.pitchers.length || !previous.data.individualRankings.hitters.length);
      if (!startupRefresh && !needsPitcherFields && !needsIndividualRankings && due && Date.parse(due) > now.getTime()) continue;
      // Consume only after acquiring the shared lock. A failed source request
      // then follows normal backoff instead of being forced again by visitors.
      if (startupRefresh) runtime.startupRefreshPending = false;
      try {
        const data = await fetchTvingKbo(date);
        const record = recordSuccessfulCollection(previous, data, date, new Date());
        const updated = { ...store, days: { ...store.days, [date]: record }, retries: { ...store.retries } };
        delete updated.retries[date];
        // Persist the result and schedule as one atomic transaction. Completion
        // is never acknowledged if storing the result fails.
        await writeKboStore(updated);
        store = updated;
        console.info(`[KBO] ${date}: ${data.games.length} games, ${data.standings.length} teams, ${data.individualRankings?.pitchers.length ?? 0} pitchers, ${data.individualRankings?.hitters.length ?? 0} hitters, ${record.control.mode}`);
      } catch {
        const failedAt = new Date();
        if (previous) {
          const failed = recordFailedCollection(previous, failedAt);
          const updated = { ...store, days: { ...store.days, [date]: failed } };
          await writeKboStore(updated);
          store = updated;
        } else {
          const failures = (store.retries[date]?.failures ?? 0) + 1;
          const delay = Math.min(ONE_HOUR, FIVE_MINUTES * 2 ** Math.min(failures - 1, 4));
          const updated = { ...store, retries: { ...store.retries, [date]: { failures, nextCheckAt: new Date(failedAt.getTime() + delay).toISOString() } } };
          await writeKboStore(updated);
          store = updated;
        }
        console.warn(`[KBO] ${date}: collection failed; keeping the last saved snapshot.`);
      }
    }
    // A timer at the next scheduled start avoids waiting for the next hourly tick.
    const todayDue = store.days[today]?.control.nextCheckAt ?? store.retries[today]?.nextCheckAt;
    if (runtime.timer && todayDue) {
      if (runtime.nextWake) clearTimeout(runtime.nextWake);
      runtime.nextWake = setTimeout(() => { void tickKboCollection(); }, Math.max(1000, Date.parse(todayDue) - Date.now()));
      runtime.nextWake.unref?.();
    }
  } finally { await release(); }
}

export function tickKboCollection(): Promise<void> {
  if (runtime.inFlight) return runtime.inFlight;
  // A storage-level failure also backs off rather than retrying per visitor.
  if (runtime.lastFailureAt && Date.now() - runtime.lastFailureAt < FIVE_MINUTES) return Promise.resolve();
  runtime.inFlight = collectDueDays(new Date()).catch(() => {
    runtime.lastFailureAt = Date.now();
    console.warn("[KBO] The collection store is unavailable; retrying later.");
  }).finally(() => { runtime.inFlight = undefined; });
  return runtime.inFlight;
}

export function startKboCollector(): void {
  if (runtime.timer || process.env.KBO_COLLECTOR_ENABLED === "false") return;
  // The global runtime survives dev module reloads, but a restarted server gets
  // one fresh check even if the persisted next check is still in the future.
  runtime.startupRefreshPending = true;
  runtime.timer = setInterval(() => { void tickKboCollection(); }, 60_000);
  runtime.timer.unref?.();
  void tickKboCollection();
}

export async function getKboSnapshot(): Promise<KboSnapshot | null> {
  const today = koreaDate();
  let store = await readKboStore();
  if (process.env.KBO_COLLECTOR_ENABLED !== "false") {
    startKboCollector();
    if (!store.days[today]) {
      await tickKboCollection();
      store = await readKboStore();
    } else {
      // Serve the durable snapshot promptly while a due collection runs.
      void tickKboCollection();
    }
  }
  // Never label yesterday's fixtures as today's games after the KST date changes.
  const record = store.days[today];
  if (!record) return null;
  const overdue = Date.now() > Date.parse(record.control.nextCheckAt) + 2 * 60_000;
  return {
    ...record.data, fetchedAt: record.fetchedAt, updatedAt: record.updatedAt,
    nextCheckAt: record.control.nextCheckAt, mode: record.control.mode, source: SOURCE,
    stale: record.failures > 0 || overdue,
    warning: record.warning ?? (overdue ? "업데이트가 지연되어 마지막으로 저장한 정보를 표시하고 있어요." : null),
  };
}
