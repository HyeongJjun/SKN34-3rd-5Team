import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile, readdir, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

// Compile the actual implementation. Test data, stores, clocks, provider calls,
// environment flags, and timers are isolated; no Next server or network is used.
const frontend = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "kbo-policy-test-"));
after(() => {
  const target = resolve(scratch);
  assert.ok(target.startsWith(`${resolve(tmpdir())}${sep}`) && basename(target).startsWith("kbo-policy-test-"));
  rmSync(target, { recursive: true, force: true });
});
const compiled = {};
for (const name of ["types", "policy", "store", "collector"]) {
  compiled[name] = ts.transpileModule(readFileSync(join(frontend, "lib", "kbo", `${name}.ts`), "utf8"), {
    fileName: `${name}.ts`, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  writeFileSync(join(scratch, `${name}.js`), compiled[name]);
}
const requireTest = createRequire(join(scratch, "entry.cjs"));
const policy = requireTest("./policy.js");
const storeApi = requireTest("./store.js");
const { FIVE_MINUTES, ONE_HOUR, MAX_FINAL_CHECKS, koreaDate, isGameComplete, assertCompleteCollection, planCollection, recordSuccessfulCollection, recordFailedCollection } = policy;
const DATE = "2026-09-09";
const TEAM_CODES = ["AA", "BB", "CC", "DD", "EE", "FF", "GG", "HH", "II", "JJ"];
const iso = (milliseconds) => new Date(milliseconds).toISOString();
const clock = (value = "2026-09-09T08:00:00.000Z") => new Date(value);
function standings(played = 100) {
  return TEAM_CODES.map((teamCode, index) => ({ rank: index + 1, teamCode, team: `테스트 구단 ${teamCode}`, played, wins: 50, draws: 0, losses: played - 50, winRate: ".500", gamesBehind: "0", streak: "1승", battingAverage: ".250", era: "4.00", lastTen: "5승 5패" }));
}
function game(overrides = {}) {
  return { id: "fixture-1", date: DATE, startsAt: "2026-09-09T09:30:00.000Z", time: "18:30", stadium: "테스트 구장", away: { code: "AA", name: "테스트 AA", score: null, startingPitcher: null }, home: { code: "BB", name: "테스트 BB", score: null, startingPitcher: null }, status: "scheduled", statusLabel: "경기 예정", ...overrides };
}
function finalGame(overrides = {}) {
  return game({ status: "final", statusLabel: "경기 종료", away: { code: "AA", name: "테스트 AA", score: 3, startingPitcher: null }, home: { code: "BB", name: "테스트 BB", score: 4, startingPitcher: null }, ...overrides });
}
function data(games = [], overrides = {}) { return { date: DATE, games, standings: standings(), sourceUpdatedAt: null, ...overrides }; }
function save(previous, source, now = clock()) { return recordSuccessfulCollection(previous, source, source.date, now); }
function expectedAfter(now, duration) { return iso(now.getTime() + duration); }
function playedAfter(source, additions) { return { ...source, standings: source.standings.map(team => ({ ...team, played: team.played + (additions[team.teamCode] ?? 0) })) }; }
function tempStore() { return mkdtempSync(join(scratch, "store-")); }
function diskStore(record) { return { version: 1, days: record ? { [record.data.date]: record } : {}, retries: {} }; }

function storeWithRenameFault(fault) {
  const exports = {};
  const calls = { renames: 0, delays: [] };
  const fs = requireTest("node:fs/promises");
  vm.runInNewContext(compiled.store, {
    exports, process: { cwd: () => scratch, pid: 99999 },
    require(id) {
      if (id === "node:fs/promises") return { ...fs, rename: async (...args) => { calls.renames++; fault(calls.renames); return fs.rename(...args); } };
      if (id === "node:timers/promises") return { setTimeout: async (milliseconds) => { calls.delays.push(milliseconds); } };
      if (id === "./policy") return policy;
      if (["node:path", "node:crypto"].includes(id)) return requireTest(id);
      throw new Error(`Unexpected store dependency: ${id}`);
    },
  }, { filename: "store.test.js" });
  return { api: exports, calls };
}

function collectorHarness({ directory = tempStore(), now = clock(), fetcher = async (date) => data([], { date }), writeHook, enabled = false } = {}) {
  let timestamp = now.getTime();
  const calls = { fetch: [], writes: 0, locks: 0, intervals: [], wakes: [], logs: [] };
  class FakeDate extends Date {
    constructor(value) { super(arguments.length ? value : timestamp); }
    static now() { return timestamp; }
  }
  const exports = {};
  const sandbox = {
    exports, Date: FakeDate, process: { env: { KBO_COLLECTOR_ENABLED: enabled ? "true" : "false" } },
    console: { info: (...args) => calls.logs.push(args), warn: (...args) => calls.logs.push(args) },
    setInterval: (callback, delay) => { const handle = { callback, delay, unref() {} }; calls.intervals.push(handle); return handle; },
    setTimeout: (callback, delay) => { const handle = { callback, delay, unref() {} }; calls.wakes.push(handle); return handle; },
    clearTimeout() {},
    require(id) {
      if (id === "./policy") return { ...policy, koreaDate: (now) => policy.koreaDate(now ?? new FakeDate()) };
      if (id === "./store") return {
        acquireKboLock: async () => { calls.locks++; return storeApi.acquireKboLock(directory); },
        readKboStore: () => storeApi.readKboStore(directory),
        writeKboStore: async (value) => { calls.writes++; await writeHook?.(value, calls.writes); return storeApi.writeKboStore(value, directory); },
      };
      if (id === "./tving") return { fetchTvingKbo: async (date) => { calls.fetch.push(date); return fetcher(date); } };
      throw new Error(`Unexpected dependency: ${id}`);
    },
  };
  vm.runInNewContext(compiled.collector, sandbox, { filename: "collector.test.js" });
  return { api: exports, calls, directory, setNow: (value) => { timestamp = new Date(value).getTime(); } };
}

// Policy: schedule cadence and sports data completeness.
test("a confirmed no-game day is checked hourly", () => {
  const now = clock();
  const result = planCollection(null, data(), now);
  assert.equal(result.control.mode, "hourly");
  assert.equal(result.control.nextCheckAt, expectedAfter(now, ONE_HOUR));
  assert.equal(result.control.finished, true);
});

test("before first start, check hourly but wake at the scheduled start", () => {
  const source = data([game()]);
  const early = clock("2026-09-09T07:00:00.000Z");
  const near = clock("2026-09-09T09:00:00.000Z");
  assert.equal(planCollection(null, source, early).control.nextCheckAt, expectedAfter(early, ONE_HOUR));
  const result = planCollection(null, source, near);
  assert.equal(result.control.mode, "hourly");
  assert.equal(result.control.nextCheckAt, source.games[0].startsAt);
});

test("at scheduled start and while live, refresh every five minutes", () => {
  for (const fixture of [game(), game({ status: "live" }), game({ status: "suspended" }), game({ startsAt: null, status: "unknown" })]) {
    const now = clock("2026-09-09T09:30:00.000Z");
    const result = planCollection(null, data([fixture]), now);
    assert.equal(result.control.mode, "five-minute", fixture.status);
    assert.equal(result.control.nextCheckAt, expectedAfter(now, FIVE_MINUTES));
    assert.equal(result.control.finished, false);
  }
});

test("cancelled early fixture does not bring forward the remaining start", () => {
  const now = clock("2026-09-09T08:10:00.000Z");
  const source = data([game({ id: "cancelled", status: "cancelled", startsAt: "2026-09-09T05:00:00.000Z" }), game()]);
  assert.equal(planCollection(null, source, now).control.mode, "hourly");
  assert.equal(planCollection(null, source, now).control.nextCheckAt, expectedAfter(now, ONE_HOUR));
});

test("final status requires both scores, including a legitimate zero", () => {
  assert.equal(isGameComplete(finalGame()), true);
  assert.equal(isGameComplete(finalGame({ away: { code: "AA", name: "AA", score: 0 } })), true);
  for (const field of ["home", "away"]) {
    const fixture = finalGame(); fixture[field].score = null;
    assert.equal(isGameComplete(fixture), false);
    assert.throws(() => assertCompleteCollection(null, data([fixture]), DATE), /점수/);
  }
});

test("cancellations and postponements complete; suspensions remain open", () => {
  for (const status of ["cancelled", "postponed"]) assert.equal(isGameComplete(game({ status })), true);
  for (const status of ["scheduled", "live", "suspended", "unknown"]) assert.equal(isGameComplete(game({ status })), false);
  const result = planCollection(null, data([game({ status: "cancelled" }), game({ id: "later", status: "postponed" })]), clock());
  assert.equal(result.control.finished, true);
  assert.equal(result.control.mode, "hourly");
});

test("doubleheader games retain separate IDs and two added games per team", () => {
  const earlier = data([game({ id: "double-1", status: "live" }), game({ id: "double-2", status: "live" })]);
  const previous = save(null, earlier);
  const completed = data([finalGame({ id: "double-1" }), finalGame({ id: "double-2" })]);
  assert.doesNotThrow(() => assertCompleteCollection(previous, completed, DATE));
  const result = planCollection(previous, completed, clock());
  assert.equal(result.control.minimumPlayed.AA, 102);
  assert.equal(result.control.minimumPlayed.BB, 102);
  assert.throws(() => assertCompleteCollection(null, data([game(), game()]), DATE), /식별/);
});

test("staggered doubleheader finals advance played targets one game at a time", () => {
  const initial = data([game({ id: "double-1", status: "live" }), game({ id: "double-2" })]);
  let record = save(null, initial);
  const midway = playedAfter(data([finalGame({ id: "double-1" }), game({ id: "double-2", status: "live" })]), { AA: 1, BB: 1 });
  record = save(record, midway);
  assert.equal(record.control.mode, "five-minute");
  assert.equal(record.control.minimumPlayed.AA, 101);
  const result = save(record, playedAfter(data([finalGame({ id: "double-1" }), finalGame({ id: "double-2" })]), { AA: 2, BB: 2 }));
  assert.equal(result.control.minimumPlayed.AA, 102);
  assert.equal(result.control.minimumPlayed.BB, 102);
  assert.equal(result.control.mode, "final-check");
});

test("empty or partial games cannot replace previously known fixtures", () => {
  const previous = save(null, data([game(), game({ id: "fixture-2" })]));
  assert.throws(() => assertCompleteCollection(previous, data(), DATE), /누락/);
  assert.throws(() => assertCompleteCollection(previous, data([game()]), DATE), /누락/);
});

test("wrong date, empty ranks, partial ranks and duplicate teams are rejected", () => {
  for (const source of [data([], { date: "2026-09-08" }), data([], { standings: [] }), data([], { standings: standings().slice(0, 9) }), data([], { standings: standings().map(team => ({ ...team, teamCode: "AA" })) }), data([game({ date: "2026-09-08" })])]) {
    assert.throws(() => assertCompleteCollection(null, source, DATE));
  }
});

test("all final games trigger a five-minute standings confirmation even when ranks caught up", () => {
  const now = clock();
  const previous = save(null, data([game({ status: "live" })]), now);
  const completed = playedAfter(data([finalGame()]), { AA: 1, BB: 1 });
  const first = save(previous, completed, new Date(now.getTime() + FIVE_MINUTES));
  assert.equal(first.control.mode, "final-check");
  assert.equal(first.control.finished, false);
  assert.equal(first.control.finalCheckAttempts, 0);
  const tooEarly = save(first, completed, new Date(Date.parse(first.fetchedAt) + FIVE_MINUTES - 1));
  assert.equal(tooEarly.control.finished, false);
  const confirmed = save(first, completed, new Date(Date.parse(first.fetchedAt) + FIVE_MINUTES));
  assert.equal(confirmed.control.mode, "hourly");
  assert.equal(confirmed.control.finished, true);
});

test("delayed played counts retry six times then use hourly warning until caught up", () => {
  const now = clock();
  let record = save(null, data([game({ status: "live" })]), now);
  record = save(record, data([finalGame()]), now);
  for (let attempt = 1; attempt <= MAX_FINAL_CHECKS; attempt++) {
    record = save(record, data([finalGame()]), new Date(now.getTime() + attempt * FIVE_MINUTES));
    assert.equal(record.control.finalCheckAttempts, attempt);
    assert.equal(record.control.finished, false);
    assert.equal(record.control.mode, attempt < MAX_FINAL_CHECKS ? "final-check" : "hourly");
    assert.match(record.warning, /순위 반영/);
  }
  assert.equal(record.control.nextCheckAt, iso(now.getTime() + MAX_FINAL_CHECKS * FIVE_MINUTES + ONE_HOUR));
  const caughtUp = save(record, playedAfter(data([finalGame()]), { AA: 1, BB: 1 }), new Date(Date.parse(record.control.nextCheckAt)));
  assert.equal(caughtUp.control.finished, true);
  assert.equal(caughtUp.warning, null);
});

test("a corrected final score starts a fresh five-minute confirmation", () => {
  const now = clock();
  let record = save(null, data([finalGame()]), now);
  record = save(record, data([finalGame()]), new Date(now.getTime() + FIVE_MINUTES));
  assert.equal(record.control.finished, true);
  const corrected = finalGame({ home: { code: "BB", name: "BB", score: 5 } });
  const later = new Date(now.getTime() + ONE_HOUR);
  const result = save(record, data([corrected]), later);
  assert.equal(result.control.finished, false);
  assert.equal(result.control.mode, "final-check");
  assert.equal(result.control.completionSeenAt, later.toISOString());
});

test("fixture response order does not restart final confirmation", () => {
  const now = clock();
  const one = finalGame(), two = game({ id: "cancelled", status: "cancelled" });
  const record = save(null, data([one, two]), now);
  const result = save(record, data([two, one]), new Date(now.getTime() + FIVE_MINUTES));
  assert.equal(result.control.finished, true);
});

test("provider-only timestamps refresh fetchedAt without changing sports updatedAt", () => {
  const now = clock();
  const original = save(null, data([game()]), now);
  const later = new Date(now.getTime() + ONE_HOUR);
  const result = save(original, data([game()], { sourceUpdatedAt: later.toISOString() }), later);
  assert.equal(result.updatedAt, original.updatedAt);
  assert.equal(result.fetchedAt, later.toISOString());
  assert.equal(result.failures, 0);
});

test("collection failure preserves data and success timestamps with bounded backoff", () => {
  const now = clock();
  const original = save(null, data([game()]), now);
  let record = original;
  for (const [index, delay] of [FIVE_MINUTES, 2 * FIVE_MINUTES, 4 * FIVE_MINUTES, 8 * FIVE_MINUTES, ONE_HOUR, ONE_HOUR].entries()) {
    record = recordFailedCollection(record, now);
    assert.equal(record.data, original.data);
    assert.equal(record.fetchedAt, original.fetchedAt);
    assert.equal(record.updatedAt, original.updatedAt);
    assert.equal(record.failures, index + 1);
    assert.equal(record.control.nextCheckAt, expectedAfter(now, delay));
    assert.match(record.warning, /마지막으로 저장/);
  }
});

test("Korean midnight changes date at 15:00 UTC and resets completion control", () => {
  assert.equal(koreaDate(new Date("2026-09-09T14:59:59.999Z")), "2026-09-09");
  assert.equal(koreaDate(new Date("2026-09-09T15:00:00.000Z")), "2026-09-10");
  const previous = save(null, data([finalGame()]), clock());
  previous.control.minimumPlayed = { AA: 1000 };
  const result = save(previous, data([], { date: "2026-09-10" }), clock("2026-09-09T15:00:00.000Z"));
  assert.deepEqual(result.control.minimumPlayed, {});
  assert.equal(result.control.completionKey, null);
});

// Store: actual isolated filesystem transactions and process exclusion.
test("a missing store is empty; valid snapshot round-trips without temp files", async () => {
  const directory = tempStore();
  assert.deepEqual(await storeApi.readKboStore(directory), diskStore());
  const saved = diskStore(save(null, data([game()])));
  await storeApi.writeKboStore(saved, directory);
  assert.deepEqual(await storeApi.readKboStore(directory), saved);
  assert.deepEqual(await readdir(directory), ["collection.json"]);
});

test("atomic replacement preserves complete snapshots under contention and commits after readers stop", async () => {
  const directory = tempStore();
  const one = diskStore(save(null, data([game()])));
  const two = diskStore(save(null, data([finalGame()])));
  await storeApi.writeKboStore(one, directory);
  let lastSuccessful = one;
  let reading = true;
  const observed = [];
  const reader = (async () => {
    while (reading) {
      observed.push(JSON.parse(await readFile(join(directory, "collection.json"), "utf8")));
      // A busy Windows reader may exhaust the bounded rename retry budget.
      // In that case, the last committed snapshot must remain intact.
      await new Promise(resolve => setTimeout(resolve, 2));
    }
  })();
  try {
    for (let index = 0; index < 12; index++) {
      const desired = index % 2 ? one : two;
      try {
        await storeApi.writeKboStore(desired, directory);
        lastSuccessful = desired;
      } catch (error) {
        if (!error || !["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
        assert.deepEqual(await storeApi.readKboStore(directory), lastSuccessful, "A failed replacement must preserve the last successful commit");
        assert.deepEqual(await readdir(directory), ["collection.json"], "A failed replacement must remove its temporary file");
        break;
      }
    }
  } finally { reading = false; await reader; }
  assert.ok(observed.length > 0);
  for (const value of observed) assert.ok(JSON.stringify(value) === JSON.stringify(one) || JSON.stringify(value) === JSON.stringify(two));
  assert.deepEqual(await storeApi.readKboStore(directory), lastSuccessful);
  assert.deepEqual(await readdir(directory), ["collection.json"]);
  await storeApi.writeKboStore(two, directory);
  assert.deepEqual(await storeApi.readKboStore(directory), two, "With competing readers stopped, the new snapshot must commit successfully");
  assert.deepEqual(await readdir(directory), ["collection.json"]);
});

test("temporary Windows rename contention retries and then commits the full snapshot", async () => {
  const directory = tempStore();
  const original = diskStore(save(null, data([game()])));
  const updated = diskStore(save(null, data([finalGame()])));
  await storeApi.writeKboStore(original, directory);
  const harness = storeWithRenameFault(attempt => { if (attempt <= 2) throw Object.assign(new Error("Simulated sharing violation"), { code: "EPERM" }); });
  await harness.api.writeKboStore(updated, directory);
  assert.equal(harness.calls.renames, 3);
  assert.equal(harness.calls.delays.length, 2);
  assert.ok(harness.calls.delays.every(delay => delay > 0 && delay <= 1000));
  assert.deepEqual(await storeApi.readKboStore(directory), updated);
  assert.deepEqual(await readdir(directory), ["collection.json"]);
});

test("permanent Windows contention exhausts a bounded budget and preserves the old snapshot", async () => {
  const directory = tempStore();
  const original = diskStore(save(null, data([game()])));
  await storeApi.writeKboStore(original, directory);
  const harness = storeWithRenameFault(() => { throw Object.assign(new Error("Simulated persistent sharing violation"), { code: "EBUSY" }); });
  await assert.rejects(harness.api.writeKboStore(diskStore(save(null, data([finalGame()]))), directory), { code: "EBUSY" });
  assert.ok(harness.calls.renames > 1 && harness.calls.renames <= 10);
  assert.ok(harness.calls.delays.reduce((sum, duration) => sum + duration, 0) <= 2000);
  assert.deepEqual(await storeApi.readKboStore(directory), original);
  assert.deepEqual(await readdir(directory), ["collection.json"]);
});

test("non-transient filesystem errors are surfaced without retrying", async () => {
  const directory = tempStore();
  const original = diskStore(save(null, data([game()])));
  await storeApi.writeKboStore(original, directory);
  const harness = storeWithRenameFault(() => { throw Object.assign(new Error("Simulated disk I/O error"), { code: "EIO" }); });
  await assert.rejects(harness.api.writeKboStore(diskStore(save(null, data([finalGame()]))), directory), { code: "EIO" });
  assert.equal(harness.calls.renames, 1);
  assert.deepEqual(harness.calls.delays, []);
  assert.deepEqual(await storeApi.readKboStore(directory), original);
});

test("failed serialization preserves the old snapshot and cleans its temporary file", async () => {
  const directory = tempStore();
  const original = diskStore(save(null, data([game()])));
  await storeApi.writeKboStore(original, directory);
  const invalid = { ...original }; invalid.circular = invalid;
  await assert.rejects(storeApi.writeKboStore(invalid, directory), TypeError);
  assert.deepEqual(await storeApi.readKboStore(directory), original);
  assert.deepEqual(await readdir(directory), ["collection.json"]);
});

test("corrupt stores fail closed and retain the diagnostic file", async () => {
  const directory = tempStore();
  const file = join(directory, "collection.json");
  for (const contents of ["{broken", JSON.stringify({ version: 2, days: {}, retries: {} }), JSON.stringify(diskStore({ data: data([], { standings: [] }) }))]) {
    await writeFile(file, contents);
    await assert.rejects(storeApi.readKboStore(directory));
    assert.equal(await readFile(file, "utf8"), contents);
  }
});

test("only one filesystem collector lock can be held and release permits another", async () => {
  const directory = tempStore();
  const contenders = await Promise.all(Array.from({ length: 8 }, () => storeApi.acquireKboLock(directory)));
  const owners = contenders.filter(Boolean);
  assert.equal(owners.length, 1);
  await owners[0]();
  const next = await storeApi.acquireKboLock(directory);
  assert.equal(typeof next, "function");
  await next();
  assert.deepEqual(await readdir(directory), []);
});

test("an abandoned old lock is recovered on the following acquisition", async () => {
  const directory = tempStore();
  await writeFile(join(directory, "collector.lock"), "99999999");
  const stale = new Date(Date.now() - 6 * 60_000);
  await utimes(join(directory, "collector.lock"), stale, stale);
  assert.equal(await storeApi.acquireKboLock(directory), null);
  const release = await storeApi.acquireKboLock(directory);
  assert.equal(typeof release, "function");
  await release();
});

test("a stale previous owner's release cannot remove a newer owner's lock", async () => {
  const directory = tempStore();
  const originalRelease = await storeApi.acquireKboLock(directory);
  const stale = new Date(Date.now() - 6 * 60_000);
  await utimes(join(directory, "collector.lock"), stale, stale);
  assert.equal(await storeApi.acquireKboLock(directory), null);
  const newRelease = await storeApi.acquireKboLock(directory);
  assert.equal(typeof newRelease, "function");
  try {
    await originalRelease();
    const thirdRelease = await storeApi.acquireKboLock(directory);
    if (thirdRelease) await thirdRelease();
    assert.equal(thirdRelease, null, "An old release must not allow a third collector during the new owner's collection");
  } finally { await newRelease(); }
});

// Collector: execute actual collector code with explicit fake provider and clock.
test("concurrent ticks share one promise and one source request", { timeout: 5000 }, async () => {
  let finish, started;
  const waiting = new Promise(resolve => { finish = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const harness = collectorHarness({ fetcher: async () => { started(); return waiting; } });
  const first = harness.api.tickKboCollection();
  const second = harness.api.tickKboCollection();
  assert.equal(first, second);
  await entered;
  assert.deepEqual(harness.calls.fetch, [DATE]);
  finish(data([game()]));
  await first;
  assert.equal(harness.calls.writes, 1);
  assert.equal(harness.calls.locks, 1);
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 1, "A stored future check is not refetched per visitor");
});

test("separate collector runtimes obey the shared filesystem lock", { timeout: 5000 }, async () => {
  let finish, started;
  const waiting = new Promise(resolve => { finish = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const directory = tempStore();
  const first = collectorHarness({ directory, fetcher: async () => { started(); return waiting; } });
  const second = collectorHarness({ directory, fetcher: async () => { throw new Error("Must not run concurrently"); } });
  const pending = first.api.tickKboCollection();
  await entered;
  await second.api.tickKboCollection();
  assert.equal(second.calls.fetch.length, 0);
  finish(data([game()]));
  await pending;
});

test("a partial upstream response preserves the last successful snapshot", async () => {
  const directory = tempStore();
  const original = save(null, data([game()]), clock("2026-09-09T06:00:00.000Z"));
  await storeApi.writeKboStore(diskStore(original), directory);
  const harness = collectorHarness({ directory, fetcher: async () => data() });
  await harness.api.tickKboCollection();
  const result = (await storeApi.readKboStore(directory)).days[DATE];
  assert.deepEqual(result.data, original.data);
  assert.equal(result.updatedAt, original.updatedAt);
  assert.equal(result.fetchedAt, original.fetchedAt);
  assert.equal(result.failures, 1);
  const response = await harness.api.getKboSnapshot();
  assert.equal(response.stale, true);
  assert.match(response.warning, /마지막으로 저장/);
});

test("failed durable write does not acknowledge new results or completion", async () => {
  const directory = tempStore();
  const original = save(null, data([game({ status: "live" })]), clock("2026-09-09T06:00:00.000Z"));
  await storeApi.writeKboStore(diskStore(original), directory);
  const harness = collectorHarness({ directory, fetcher: async () => data([finalGame()]), writeHook: async (_, count) => { if (count === 1) throw new Error("Simulated disk failure"); } });
  await harness.api.tickKboCollection();
  const result = (await storeApi.readKboStore(directory)).days[DATE];
  assert.deepEqual(result.data, original.data);
  assert.equal(result.control.finished, false);
  assert.equal(result.failures, 1);
  assert.equal(harness.calls.writes, 2);
});

test("a source failure before first snapshot stores backoff without invented fixtures", async () => {
  const harness = collectorHarness({ fetcher: async () => { throw new Error("Simulated provider outage"); } });
  await harness.api.tickKboCollection();
  const result = await storeApi.readKboStore(harness.directory);
  assert.deepEqual(result.days, {});
  assert.equal(result.retries[DATE].failures, 1);
  assert.equal(result.retries[DATE].nextCheckAt, expectedAfter(clock(), FIVE_MINUTES));
  assert.equal(await harness.api.getKboSnapshot(), null);
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 1);
});

test("a stored snapshot is returned while a due provider request remains pending", { timeout: 5000 }, async () => {
  const directory = tempStore();
  const original = save(null, data([game()]), clock("2026-09-09T06:00:00.000Z"));
  await storeApi.writeKboStore(diskStore(original), directory);
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  const harness = collectorHarness({ directory, enabled: true, fetcher: async () => waiting });
  const response = await harness.api.getKboSnapshot();
  assert.equal(response.updatedAt, original.updatedAt);
  assert.equal(response.games[0].status, "scheduled");
  finish(data([game({ status: "live" })]));
  await harness.api.tickKboCollection();
  assert.equal((await storeApi.readKboStore(directory)).days[DATE].data.games[0].status, "live");
});

test("old cache pitcher fields migrate once without bypassing the next scheduled check again", async () => {
  const directory = tempStore();
  const fixture = game();
  delete fixture.away.startingPitcher;
  delete fixture.home.startingPitcher;
  const original = save(null, data([fixture]), clock());
  await storeApi.writeKboStore(diskStore(original), directory);
  const harness = collectorHarness({ directory, fetcher: async () => data([game()]) });
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 1);
  const stored = (await storeApi.readKboStore(directory)).days[DATE];
  assert.equal(stored.data.games[0].away.startingPitcher, null);
  assert.equal(stored.data.games[0].home.startingPitcher, null);
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 1);
});

test("a corrupt store backs off globally without calling the provider per visitor", async () => {
  const directory = tempStore();
  await writeFile(join(directory, "collection.json"), "{invalid cache");
  const harness = collectorHarness({ directory });
  await harness.api.tickKboCollection();
  const firstLocks = harness.calls.locks;
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.locks, firstLocks);
  assert.equal(harness.calls.fetch.length, 0);
  harness.setNow(expectedAfter(clock(), FIVE_MINUTES));
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.locks, firstLocks + 1);
  assert.equal(await readFile(join(directory, "collection.json"), "utf8"), "{invalid cache");
});

test("KST midnight never exposes yesterday as today's schedule", async () => {
  const directory = tempStore();
  const original = save(null, data([game({ status: "live" })]), clock("2026-09-09T14:50:00.000Z"));
  await storeApi.writeKboStore(diskStore(original), directory);
  const harness = collectorHarness({ directory, now: clock("2026-09-09T15:00:00.000Z"), fetcher: async (date) => date === DATE ? data([finalGame()]) : data([], { date }) });
  assert.equal(await harness.api.getKboSnapshot(), null);
  await harness.api.tickKboCollection();
  assert.deepEqual(harness.calls.fetch, ["2026-09-10", "2026-09-09"]);
  const response = await harness.api.getKboSnapshot();
  assert.equal(response.date, "2026-09-10");
  assert.equal(response.games.length, 0);
  assert.ok((await storeApi.readKboStore(directory)).days[DATE], "Unfinished previous date is retained and checked separately");
});

test("starting the collector twice creates one interval and a precise next wake", async () => {
  const harness = collectorHarness({ enabled: true, now: clock("2026-09-09T09:00:00.000Z"), fetcher: async () => data([game()]) });
  harness.api.startKboCollector();
  harness.api.startKboCollector();
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.intervals.length, 1);
  assert.equal(harness.calls.intervals[0].delay, 60_000);
  assert.equal(harness.calls.wakes.length, 1);
  assert.equal(harness.calls.wakes[0].delay, 30 * 60_000);
  assert.equal(harness.calls.fetch.length, 1);
});

// Startup refresh is an instance-lifecycle event, independent of stored cadence.
test("startup refreshes today's future-due cache once then resumes hourly checks", async () => {
  const directory = tempStore();
  const original = save(null, data([game()]), clock("2026-09-09T07:45:00.000Z"));
  await storeApi.writeKboStore(diskStore(original), directory);
  const fresh = data([game({ stadium: "갱신된 테스트 구장" })]);
  const harness = collectorHarness({ directory, enabled: true, fetcher: async () => fresh });
  assert.ok(Date.parse(original.control.nextCheckAt) > clock().getTime());
  harness.api.startKboCollector();
  harness.api.startKboCollector();
  await harness.api.tickKboCollection();
  const saved = (await storeApi.readKboStore(directory)).days[DATE];
  assert.deepEqual(saved.data, fresh);
  assert.equal(saved.fetchedAt, clock().toISOString());
  assert.equal(saved.control.mode, "hourly");
  assert.equal(saved.control.nextCheckAt, expectedAfter(clock(), ONE_HOUR));
  assert.equal(harness.calls.fetch.length, 1);
  assert.equal(harness.calls.intervals.length, 1);
  await harness.api.getKboSnapshot();
  await harness.api.tickKboCollection();
  harness.calls.intervals[0].callback();
  await harness.api.tickKboCollection();
  harness.calls.wakes[0].callback();
  await harness.api.tickKboCollection();
  harness.api.startKboCollector();
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 1, "GET, ticks and duplicate start calls must not recreate a startup refresh");
  harness.setNow(saved.control.nextCheckAt);
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 2, "The next ordinary hourly check still runs when due");
});

test("startup refresh switches a future hourly cache to five-minute checks when a game is live", async () => {
  const directory = tempStore();
  const original = save(null, data([game()]), clock());
  await storeApi.writeKboStore(diskStore(original), directory);
  const now = clock("2026-09-09T08:05:00.000Z");
  const harness = collectorHarness({ directory, enabled: true, now, fetcher: async () => data([game({ status: "live" })]) });
  harness.api.startKboCollector();
  await harness.api.tickKboCollection();
  const saved = (await storeApi.readKboStore(directory)).days[DATE];
  assert.equal(harness.calls.fetch.length, 1);
  assert.equal(saved.data.games[0].status, "live");
  assert.equal(saved.control.mode, "five-minute");
  assert.equal(saved.control.nextCheckAt, expectedAfter(now, FIVE_MINUTES));
});

test("a failed startup refresh preserves cached data and obeys failure backoff without refetching per GET", async () => {
  const directory = tempStore();
  const original = save(null, data([game()]), clock("2026-09-09T07:45:00.000Z"));
  await storeApi.writeKboStore(diskStore(original), directory);
  const harness = collectorHarness({ directory, enabled: true, fetcher: async () => { throw new Error("Simulated startup provider failure"); } });
  harness.api.startKboCollector();
  await harness.api.tickKboCollection();
  const failed = (await storeApi.readKboStore(directory)).days[DATE];
  assert.equal(harness.calls.fetch.length, 1);
  assert.deepEqual(failed.data, original.data);
  assert.equal(failed.fetchedAt, original.fetchedAt);
  assert.equal(failed.updatedAt, original.updatedAt);
  assert.equal(failed.failures, 1);
  assert.equal(failed.control.nextCheckAt, expectedAfter(clock(), FIVE_MINUTES));
  assert.match(failed.warning, /마지막으로 저장/);
  harness.api.startKboCollector();
  await harness.api.getKboSnapshot();
  await harness.api.tickKboCollection();
  harness.calls.intervals[0].callback();
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 1);
  harness.setNow(failed.control.nextCheckAt);
  await harness.api.tickKboCollection();
  const retried = (await storeApi.readKboStore(directory)).days[DATE];
  assert.equal(harness.calls.fetch.length, 2);
  assert.equal(retried.failures, 2);
  assert.equal(retried.control.nextCheckAt, iso(Date.parse(failed.control.nextCheckAt) + 2 * FIVE_MINUTES));
});

test("a new runtime refreshes the same recently updated cache once on restart", async () => {
  const directory = tempStore();
  await storeApi.writeKboStore(diskStore(save(null, data([game()]), clock())), directory);
  const first = collectorHarness({ directory, enabled: true, fetcher: async () => data([game({ stadium: "첫 서버 테스트 구장" })]) });
  first.api.startKboCollector();
  await first.api.tickKboCollection();
  assert.equal(first.calls.fetch.length, 1);
  const restartedAt = clock("2026-09-09T08:01:00.000Z");
  const second = collectorHarness({ directory, enabled: true, now: restartedAt, fetcher: async () => data([game({ stadium: "재시작 서버 테스트 구장" })]) });
  second.api.startKboCollector();
  await second.api.tickKboCollection();
  const saved = (await storeApi.readKboStore(directory)).days[DATE];
  assert.equal(second.calls.fetch.length, 1);
  assert.equal(saved.fetchedAt, restartedAt.toISOString());
  assert.equal(saved.data.games[0].stadium, "재시작 서버 테스트 구장");
  second.api.startKboCollector();
  await second.api.getKboSnapshot();
  await second.api.tickKboCollection();
  assert.equal(second.calls.fetch.length, 1);
});

test("startup refresh remains pending while another process owns the lock", async () => {
  const directory = tempStore();
  await storeApi.writeKboStore(diskStore(save(null, data([game()]), clock())), directory);
  const release = await storeApi.acquireKboLock(directory);
  const harness = collectorHarness({ directory, enabled: true, fetcher: async () => data([game()]) });
  try {
    harness.api.startKboCollector();
    await harness.api.tickKboCollection();
    assert.equal(harness.calls.fetch.length, 0);
  } finally { await release(); }
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 1, "Lock contention must not consume the pending startup refresh");
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 1);
});

test("startup force applies only to today while an unfinished earlier date keeps its own due time", async () => {
  const directory = tempStore();
  const yesterday = "2026-09-08";
  const previous = save(null, data([game({ id: "unfinished-yesterday", date: yesterday, startsAt: "2026-09-08T09:30:00.000Z", status: "suspended" })], { date: yesterday }), clock("2026-09-09T07:59:00.000Z"));
  const today = save(null, data([game()]), clock("2026-09-09T07:55:00.000Z"));
  await storeApi.writeKboStore({ version: 1, days: { [DATE]: today, [yesterday]: previous }, retries: {} }, directory);
  const harness = collectorHarness({ directory, enabled: true, fetcher: async (date) => date === DATE ? data([game()]) : previous.data });
  harness.api.startKboCollector();
  await harness.api.tickKboCollection();
  assert.deepEqual(harness.calls.fetch, [DATE]);
  assert.deepEqual((await storeApi.readKboStore(directory)).days[yesterday], previous);
  harness.setNow(previous.control.nextCheckAt);
  await harness.api.tickKboCollection();
  assert.deepEqual(harness.calls.fetch, [DATE, yesterday]);
});

test("startup refresh survives a store read failure and runs after the store-level backoff", async () => {
  const directory = tempStore();
  await writeFile(join(directory, "collection.json"), "{temporarily unreadable");
  const harness = collectorHarness({ directory, enabled: true, fetcher: async () => data([game()]) });
  harness.api.startKboCollector();
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 0);
  await storeApi.writeKboStore(diskStore(save(null, data([game()]), clock())), directory);
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 0, "Storage failure backoff must still apply");
  harness.setNow(expectedAfter(clock(), FIVE_MINUTES));
  await harness.api.tickKboCollection();
  assert.equal(harness.calls.fetch.length, 1, "A failed store read must not consume the pending startup attempt");
});

test("disabled automatic collection neither starts a timer nor refreshes a cached snapshot", async () => {
  const directory = tempStore();
  const original = save(null, data([game()]), clock("2026-09-09T06:00:00.000Z"));
  await storeApi.writeKboStore(diskStore(original), directory);
  const harness = collectorHarness({ directory, enabled: false, fetcher: async () => { throw new Error("Disabled collector must not call its provider"); } });
  harness.api.startKboCollector();
  harness.api.startKboCollector();
  const snapshot = await harness.api.getKboSnapshot();
  assert.equal(snapshot.updatedAt, original.updatedAt);
  assert.equal(harness.calls.intervals.length, 0);
  assert.equal(harness.calls.fetch.length, 0);
  assert.equal(harness.calls.locks, 0);
  assert.deepEqual((await storeApi.readKboStore(directory)).days[DATE], original);
});
