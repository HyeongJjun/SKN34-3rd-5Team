import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

// Compile actual modules; all provider calls, clocks and timers below are fake.
// Stores live only in this test's scratch directory. No .env or network access.
const frontend = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "kbo-archive-test-"));
after(() => {
  const target = resolve(scratch);
  assert.ok(target.startsWith(`${resolve(tmpdir())}${sep}`) && basename(target).startsWith("kbo-archive-test-"));
  rmSync(target, { recursive: true, force: true });
});
function compile(relative) {
  return ts.transpileModule(readFileSync(join(frontend, relative), "utf8"), {
    fileName: relative, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
}
for (const moduleName of ["policy", "store"]) writeFileSync(join(scratch, `${moduleName}.js`), compile(`lib/kbo/${moduleName}.ts`));
const compiledArchive = compile("lib/kbo/archive.ts");
const compiledRoute = compile("app/kbo-api/schedule/route.ts");
const requireTest = createRequire(join(scratch, "entry.cjs"));
const policy = requireTest("./policy.js");
const store = requireTest("./store.js");
const NOW = "2026-09-09T08:00:00.000Z";
const TODAY = "2026-09-09";
const FUTURE = "2026-12-31T23:59:59.000Z";
const BEFORE = "2026-09-09T07:00:00.000Z";
const plain = value => JSON.parse(JSON.stringify(value));
const add = milliseconds => new Date(Date.parse(NOW) + milliseconds).toISOString();
function game(date = TODAY, overrides = {}) {
  return { id: `game-${date}`, date, startsAt: `${date}T09:30:00.000Z`, time: "18:30", stadium: "테스트 구장", away: { code: "AA", name: "테스트 AA", score: null, startingPitcher: null }, home: { code: "BB", name: "테스트 BB", score: null, startingPitcher: null }, status: "scheduled", statusLabel: "경기 예정", ...overrides };
}
function finalGame(date, overrides = {}) {
  return game(date, { status: "final", statusLabel: "경기 종료", away: { code: "AA", name: "테스트 AA", score: 3, startingPitcher: null }, home: { code: "BB", name: "테스트 BB", score: 4, startingPitcher: null }, ...overrides });
}
function entry(games, overrides = {}) { return { games, fetchedAt: BEFORE, nextCheckAt: FUTURE, failures: 0, ...overrides }; }
function month(overrides = {}) { return { calendar: [], checkedAt: BEFORE, nextCheckAt: FUTURE, failures: 0, days: {}, ...overrides }; }
function archive(months = {}) { return { version: 1, year: 2026, months }; }
function filledArchive(overrides = {}) {
  return archive({ ...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`2026-${String(index + 1).padStart(2, "0")}`, month()])), ...overrides });
}
function live(games = [], overrides = {}) {
  return { date: TODAY, games, standings: [], sourceUpdatedAt: null, fetchedAt: NOW, updatedAt: NOW, nextCheckAt: add(policy.FIVE_MINUTES), mode: "five-minute", source: { name: "테스트 공통 수집기", url: "https://example.test/kbo" }, stale: false, warning: null, ...overrides };
}
function harness({ directory = mkdtempSync(join(scratch, "store-")), now = NOW, calendarFetcher = async () => [], dayFetcher = async date => [finalGame(date)], liveSnapshot = null, liveStore = { version: 1, days: {}, retries: {} }, enabled = false } = {}) {
  let timestamp = Date.parse(now);
  const calls = { calendars: [], days: [], live: 0, writes: 0, locks: 0, waits: [], intervals: [], warnings: [] };
  class FakeDate extends Date { constructor(value) { super(arguments.length ? value : timestamp); } static now() { return timestamp; } }
  const exports = {};
  vm.runInNewContext(compiledArchive, {
    exports, Date: FakeDate, process: { env: { KBO_COLLECTOR_ENABLED: enabled ? "true" : "false" } },
    console: { warn: (...args) => calls.warnings.push(args) },
    setInterval: (callback, milliseconds) => { const timer = { callback, milliseconds, unref() {} }; calls.intervals.push(timer); return timer; },
    require(id) {
      if (id === "./policy") return { ...policy, koreaDate: now => policy.koreaDate(now ?? new FakeDate()) };
      if (id === "./store") return {
        STORE_DIRECTORY: directory, retryFileOperation: store.retryFileOperation,
        acquireKboLock: async path => { calls.locks++; return store.acquireKboLock(path); },
        readKboStore: async () => liveStore,
        writeAtomicKboJson: async (file, value) => { calls.writes++; return store.writeAtomicKboJson(file, value); },
      };
      if (id === "./collector") return { getKboSnapshot: async () => { calls.live++; return typeof liveSnapshot === "function" ? liveSnapshot() : liveSnapshot; } };
      if (id === "./tving") return {
        fetchTvingCalendar: async value => { calls.calendars.push(value); return calendarFetcher(value); },
        fetchTvingScheduleDay: async value => { calls.days.push(value); return dayFetcher(value); },
      };
      if (id === "node:timers/promises") return { setTimeout: async milliseconds => { calls.waits.push(milliseconds); assert.ok(calls.waits.length <= 200, "Archive worker must terminate when all jobs are scheduled in the future"); } };
      if (["node:fs/promises", "node:path"].includes(id)) return requireTest(id);
      throw new Error(`Unexpected dependency: ${id}`);
    },
  }, { filename: "archive.test.js" });
  const file = join(directory, "archive", "2026.json");
  return { api: exports, calls, directory, file, seed: value => store.writeAtomicKboJson(file, value), read: async () => plain(await exports.readKboArchive()), setNow: value => { timestamp = Date.parse(value); } };
}
function routeHarness({ api, today = TODAY } = {}) {
  const exports = {};
  vm.runInNewContext(compiledRoute, { exports, URL, Response, require(id) {
    if (id === "@/lib/kbo/archive") return api;
    if (id === "@/lib/kbo/policy") return { koreaDate: () => today };
    throw new Error(`Unexpected route dependency: ${id}`);
  } }, { filename: "archive-route.test.js" });
  return exports;
}

const pure = harness().api;
test("archive month input accepts exactly the twelve zero-padded months of 2026", () => {
  for (let number = 1; number <= 12; number++) assert.equal(pure.isArchiveMonth(`2026-${String(number).padStart(2, "0")}`), true);
  for (const value of ["2025-12", "2027-01", "2026-00", "2026-13", "2026-2", "2026-02-01", " 2026-02", "2026-02/", "../../2026-02", ""]) assert.equal(pure.isArchiveMonth(value), false, value);
});

test("backfill month range is bounded to 2026 and ordered from the current month backwards", () => {
  assert.deepEqual(plain(pure.archiveMonths("2025-12-31")), []);
  assert.deepEqual(plain(pure.archiveMonths("2026-01-01")), ["2026-01"]);
  assert.deepEqual(plain(pure.archiveMonths(TODAY)), ["2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02", "2026-01"]);
  const afterYear = plain(pure.archiveMonths("2027-01-01"));
  assert.equal(afterYear.length, 12);
  assert.equal(afterYear[0], "2026-12");
  assert.equal(afterYear.at(-1), "2026-01");
});

test("month rendering uses the actual non-leap-year calendar and rejects unsupported years", () => {
  for (const [requested, length] of [["2026-02", 28], ["2026-04", 30], ["2026-12", 31]]) {
    const result = pure.buildScheduleMonth(requested, archive(), null, new Date(NOW));
    assert.equal(result.days.length, length);
    assert.equal(result.days.at(-1).date, `${requested}-${length}`);
  }
  assert.throws(() => pure.buildScheduleMonth("2024-02", archive(), null, new Date(NOW)), /2026/);
});

test("next job stays within requested valid months and refreshes an expired calendar first", () => {
  const value = archive({ "2026-02": month({ nextCheckAt: BEFORE, calendar: [28] }), "2026-01": month({ calendar: [31] }) });
  assert.deepEqual(plain(pure.nextArchiveJob(value, ["2027-01", "2026-02", "2026-01"], new Date(NOW))), { month: "2026-02" });
  assert.equal(pure.nextArchiveJob(value, ["2027-01", "2025-12"], new Date(NOW)), null);
  const waiting = archive({ "2026-02": month({ calendar: null, failures: 1 }) });
  assert.equal(pure.nextArchiveJob(waiting, ["2026-02"], new Date(NOW)), null);
});

test("next date job prefers recent dates, skips today, and respects stored due times", () => {
  const value = archive({ "2026-09": month({ calendar: [1, 8, 9, 10] }) });
  assert.deepEqual(plain(pure.nextArchiveJob(value, ["2026-09"], new Date(NOW))), { month: "2026-09", date: "2026-09-10" });
  value.months["2026-09"].days["2026-09-10"] = entry([game("2026-09-10")]);
  assert.deepEqual(plain(pure.nextArchiveJob(value, ["2026-09"], new Date(NOW))), { month: "2026-09", date: "2026-09-08" });
  const todayOnly = archive({ "2026-09": month({ calendar: [9], days: { [TODAY]: entry([game()], { nextCheckAt: BEFORE }) } }) });
  assert.equal(pure.nextArchiveJob(todayOnly, ["2026-09"], new Date(NOW)), null);
});

test("month output distinguishes confirmed empty days, pending dates, failed dates and ready games", () => {
  const value = archive({ "2026-09": month({ calendar: [5, 6, 8, 9], days: {
    "2026-09-05": entry(null, { failures: 1, fetchedAt: null }),
    "2026-09-08": entry([finalGame("2026-09-08")]),
  } }) });
  const result = pure.buildScheduleMonth("2026-09", value, live(), new Date(NOW));
  const status = day => result.days.find(item => item.date === `2026-09-${day}`).status;
  assert.equal(status("05"), "error");
  assert.equal(status("06"), "pending");
  assert.equal(status("07"), "empty");
  assert.equal(status("08"), "ready");
  assert.equal(status("09"), "empty");
  assert.equal(result.loading, true);
  assert.equal(result.stale, true);
  assert.match(result.warning, /일부 경기/);
});

test("an unfetched month remains pending instead of appearing to have no games", () => {
  const result = pure.buildScheduleMonth("2026-02", archive(), null, new Date(NOW));
  assert.ok(result.days.every(day => day.status === "pending"));
  assert.equal(result.games.length, 0);
  assert.equal(result.fetchedAt, null);
  assert.equal(result.loading, true);
});

test("today's shared live snapshot wins over a formerly future cached fixture", () => {
  const cached = game(TODAY, { id: "same-game" });
  const current = game(TODAY, { id: "same-game", status: "live", stadium: "공통 수집기가 갱신한 구장" });
  const value = archive({ "2026-09": month({ calendar: [9], days: { [TODAY]: entry([cached]) } }) });
  const result = pure.buildScheduleMonth("2026-09", value, live([current]), new Date(NOW));
  assert.equal(result.games.length, 1);
  assert.equal(result.games[0].status, "live");
  assert.equal(result.games[0].stadium, current.stadium);
  assert.equal(result.fetchedAt, NOW);
});

test("today's archive entry is not used when the shared live snapshot is unavailable", () => {
  const value = archive({ "2026-09": month({ calendar: [9], days: { [TODAY]: entry([game()]) } }) });
  const result = pure.buildScheduleMonth("2026-09", value, null, new Date(NOW));
  assert.equal(result.games.length, 0);
  assert.equal(result.days[8].status, "pending");
  const wrongDate = pure.buildScheduleMonth("2026-09", value, live([game("2026-09-08")], { date: "2026-09-08" }), new Date(NOW));
  assert.equal(wrongDate.days[8].status, "pending");
});

test("without a live snapshot, today remains pending even if the archive calendar says no game", () => {
  const value = archive({ "2026-09": month({ calendar: [], days: { [TODAY]: entry([game()]) } }) });
  const result = pure.buildScheduleMonth("2026-09", value, null, new Date(NOW));
  assert.equal(result.days[8].status, "pending");
  assert.equal(result.days[8].gameCount, 0);
  assert.equal(result.games.length, 0);
  assert.equal(result.loading, true);
});

test("an explicitly empty live snapshot replaces old cached fixtures for today", () => {
  const value = archive({ "2026-09": month({ calendar: [9], days: { [TODAY]: entry([game()]) } }) });
  const result = pure.buildScheduleMonth("2026-09", value, live(), new Date(NOW));
  assert.equal(result.days[8].status, "empty");
  assert.equal(result.days[8].gameCount, 0);
  assert.equal(result.games.length, 0);
});

test("doubleheader IDs are preserved and games sort by date, time and ID", () => {
  const fixtures = [finalGame("2026-09-08", { id: "double-2", time: "18:30" }), finalGame("2026-09-08", { id: "double-1", time: "14:00" })];
  const value = archive({ "2026-09": month({ calendar: [8], days: { "2026-09-08": entry(fixtures) } }) });
  const result = pure.buildScheduleMonth("2026-09", value, live(), new Date(NOW));
  assert.deepEqual(plain(result.games.map(game => game.id)), ["double-1", "double-2"]);
  assert.equal(result.days[7].gameCount, 2);
  assert.deepEqual(fixtures.map(game => game.id), ["double-2", "double-1"], "Rendering must not mutate the stored fixture order");
});

test("failed refreshes can show saved ready fixtures with a stale warning", () => {
  const value = archive({ "2026-09": month({ calendar: [8], days: { "2026-09-08": entry([finalGame("2026-09-08")], { failures: 2 }) } }) });
  const result = pure.buildScheduleMonth("2026-09", value, live(), new Date(NOW));
  assert.equal(result.days[7].status, "ready");
  assert.equal(result.stale, true);
  assert.match(result.warning, /저장된 자료/);
});

test("archive worker never fetches today's daily schedule even when today is in the calendar", async () => {
  const worker = harness();
  await worker.seed(filledArchive({ "2026-09": month({ calendar: [8, 9] }) }));
  await worker.api.tickKboArchive();
  assert.deepEqual(worker.calls.days, ["2026-09-08"]);
  assert.equal(worker.calls.live, 0);
  assert.equal(worker.calls.calendars.length, 0);
  assert.equal((await worker.read()).months["2026-09"].days[TODAY], undefined);
});

test("future dates refresh hourly while completed past results use the archive interval", async () => {
  const worker = harness({ dayFetcher: async date => [date > TODAY ? game(date) : finalGame(date)] });
  await worker.seed(filledArchive({ "2026-09": month({ calendar: [8, 9, 10] }) }));
  await worker.api.tickKboArchive();
  const saved = (await worker.read()).months["2026-09"].days;
  assert.equal(saved["2026-09-10"].nextCheckAt, add(policy.ONE_HOUR));
  assert.equal(saved["2026-09-08"].nextCheckAt, add(7 * 24 * policy.ONE_HOUR));
  assert.deepEqual(worker.calls.days, ["2026-09-10", "2026-09-08"]);
});

test("partial daily responses preserve both stored doubleheader games and back off", async () => {
  const first = finalGame("2026-09-08", { id: "double-1" });
  const second = finalGame("2026-09-08", { id: "double-2" });
  const savedEntry = entry([first, second], { nextCheckAt: BEFORE });
  const worker = harness({ dayFetcher: async () => [first] });
  await worker.seed(filledArchive({ "2026-09": month({ calendar: [8], days: { "2026-09-08": savedEntry } }) }));
  await worker.api.tickKboArchive();
  const result = (await worker.read()).months["2026-09"].days["2026-09-08"];
  assert.deepEqual(result.games, savedEntry.games);
  assert.equal(result.fetchedAt, savedEntry.fetchedAt);
  assert.equal(result.failures, 1);
  assert.equal(result.nextCheckAt, add(policy.FIVE_MINUTES));
  await worker.api.tickKboArchive();
  assert.equal(worker.calls.days.length, 1);
});

test("a calendar that drops previously stored completed games is rejected without erasing results", async () => {
  const original = month({ calendar: [8], nextCheckAt: BEFORE, days: { "2026-09-08": entry([finalGame("2026-09-08")]) } });
  const worker = harness({ calendarFetcher: async () => [] });
  await worker.seed(filledArchive({ "2026-09": original }));
  await worker.api.tickKboArchive();
  const result = (await worker.read()).months["2026-09"];
  assert.deepEqual(result.calendar, [8]);
  assert.deepEqual(result.days, original.days);
  assert.equal(result.checkedAt, original.checkedAt);
  assert.equal(result.failures, 1);
});

test("completed live-collector snapshots are reused for yesterday without another source request", async () => {
  const date = "2026-09-08";
  const finished = [finalGame(date)];
  const shared = { version: 1, days: { [date]: { data: { date, games: finished }, failures: 0, fetchedAt: BEFORE } }, retries: {} };
  const worker = harness({ liveStore: shared, dayFetcher: async () => { throw new Error("Completed shared snapshot should be reused"); } });
  await worker.seed(filledArchive({ "2026-09": month({ calendar: [8] }) }));
  await worker.api.tickKboArchive();
  const result = (await worker.read()).months["2026-09"].days[date];
  assert.deepEqual(result.games, finished);
  assert.equal(result.fetchedAt, BEFORE);
  assert.equal(result.failures, 0);
  assert.equal(worker.calls.days.length, 0);
});

test("concurrent archive ticks share one in-flight request", { timeout: 5000 }, async () => {
  let finish, started;
  const pending = new Promise(resolve => { finish = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const worker = harness({ dayFetcher: async () => { started(); return pending; } });
  await worker.seed(filledArchive({ "2026-09": month({ calendar: [8] }) }));
  const first = worker.api.tickKboArchive();
  const second = worker.api.tickKboArchive();
  assert.equal(first, second);
  await entered;
  assert.equal(worker.calls.days.length, 1);
  finish([finalGame("2026-09-08")]);
  await first;
  await worker.api.tickKboArchive();
  assert.equal(worker.calls.days.length, 1);
});

test("separate archive runtimes cannot collect the same date concurrently", { timeout: 5000 }, async () => {
  let finish, started;
  const pending = new Promise(resolve => { finish = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const first = harness({ dayFetcher: async () => { started(); return pending; } });
  const second = harness({ directory: first.directory });
  await first.seed(filledArchive({ "2026-09": month({ calendar: [8] }) }));
  const running = first.api.tickKboArchive();
  await entered;
  await second.api.tickKboArchive();
  assert.equal(second.calls.days.length, 0);
  finish([finalGame("2026-09-08")]);
  await running;
  await second.api.tickKboArchive();
  assert.equal(second.calls.days.length, 0);
});

test("archive reads reject invalid February dates and preserve corrupt cache files", async () => {
  const worker = harness();
  for (const value of [
    { version: 1, year: 2027, months: {} },
    archive({ "2026-02": month({ calendar: [29] }) }),
    archive({ "2026-02": month({ calendar: [28, 28] }) }),
    archive({ "2026-02": month({ days: { "2026-02-29": entry([]) } }) }),
    archive({ "2026-02": month({ days: { "2026-02-28": entry([game("2026-02-28", { status: "final" })]) } }) }),
  ]) {
    await worker.seed(value);
    const before = await readFile(worker.file, "utf8");
    await assert.rejects(worker.api.readKboArchive());
    assert.equal(await readFile(worker.file, "utf8"), before);
  }
  assert.deepEqual(await readdir(join(worker.directory, "archive")), ["2026.json"]);
});

test("current-month getter uses the shared homepage snapshot while disabled archive work stays off", async () => {
  const current = game(TODAY, { status: "live" });
  const worker = harness({ liveSnapshot: live([current]), enabled: false });
  await worker.seed(filledArchive({ "2026-09": month({ calendar: [9], days: { [TODAY]: entry([game()]) } }) }));
  const result = await worker.api.getKboScheduleMonth("2026-09");
  assert.equal(result.games[0].status, "live");
  assert.equal(worker.calls.live, 1);
  await worker.api.getKboScheduleMonth("2026-02");
  assert.equal(worker.calls.live, 1, "Other months must not invoke today's live collector");
  assert.equal(worker.calls.days.length, 0);
  assert.equal(worker.calls.calendars.length, 0);
  assert.equal(worker.calls.intervals.length, 0);
});

test("an explicitly requested future 2026 month is queued before background historical months", async () => {
  const worker = harness({ calendarFetcher: async () => [15], dayFetcher: async date => [game(date)] });
  const value = filledArchive();
  delete value.months["2026-12"];
  await worker.seed(value);
  const pending = await worker.api.getKboScheduleMonth("2026-12");
  assert.equal(pending.loading, true);
  assert.equal(worker.calls.calendars.length, 0);
  await worker.api.tickKboArchive();
  assert.deepEqual(worker.calls.calendars, ["2026-12"]);
  assert.deepEqual(worker.calls.days, ["2026-12-15"]);
  const result = await worker.api.getKboScheduleMonth("2026-12");
  assert.equal(result.days[14].status, "ready");
  assert.equal(result.days[14].gameCount, 1);
  assert.equal(worker.calls.live, 0);
});

test("schedule route rejects unsupported months before reading or collecting data", async () => {
  let calls = 0;
  const route = routeHarness({ api: { isArchiveMonth: pure.isArchiveMonth, getKboScheduleMonth: async () => { calls++; } } });
  for (const value of ["2025-12", "2027-01", "2026-13", "2026-2", "../../private"]) {
    const response = await route.GET(new Request(`http://example.test/kbo-api/schedule?month=${encodeURIComponent(value)}`));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).data, null);
  }
  assert.equal(calls, 0);
});

test("schedule route defaults to the current 2026 month and sanitizes storage errors", async () => {
  const calls = [];
  const route = routeHarness({ api: { isArchiveMonth: pure.isArchiveMonth, getKboScheduleMonth: async value => { calls.push(value); throw new Error("private provider body or local filesystem path"); } } });
  const response = await route.GET(new Request("http://example.test/kbo-api/schedule"));
  assert.deepEqual(calls, ["2026-09"]);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.data, null);
  assert.doesNotMatch(body.error, /private|provider|filesystem/);
});
