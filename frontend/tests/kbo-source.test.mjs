import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const frontend = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "kbo-source-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
const { outputText } = ts.transpileModule(readFileSync(join(frontend, "lib/kbo/tving.ts"), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
writeFileSync(join(scratch, "tving.cjs"), outputText);
const requireTestModule = createRequire(join(scratch, "entry.cjs"));
const { parseTvingCalendar, parseTvingSchedule, parseTvingStandings, fetchTvingCalendar, fetchTvingScheduleDay, fetchTvingKbo } = requireTestModule("./tving.cjs");
// Trimmed public statistics captured on 2026-09-09; no cookies or credentials.
const fixture = (name) => JSON.parse(readFileSync(join(frontend, "tests/fixtures", name), "utf8"));
const today = () => fixture("tving-schedule-20260909.json");
const ended = () => fixture("tving-schedule-20260908.json");
const standings = () => fixture("tving-standings-2026.json");
const scheduleBand = (payload) => payload.data.bands[0];

test("public daily schedule preserves all four actual games, KST, and hides placeholder zero scores", () => {
  const games = parseTvingSchedule(today(), "2026-09-09");
  assert.equal(games.length, 4);
  assert.deepEqual(new Set(games.map((g) => `${g.away.name}-${g.home.name}`)), new Set(["NC-KIA", "KT-삼성", "LG-한화", "SSG-두산"]));
  assert.ok(games.every((g) => g.status === "scheduled" && g.time === "18:30" && g.startsAt === "2026-09-09T18:30:00+09:00"));
  assert.ok(games.every((g) => g.away.score === null && g.home.score === null));
  const ncKia = games.find((g) => g.away.code === "NC");
  assert.equal(ncKia.away.startingPitcher, "송명기");
  assert.equal(ncKia.home.startingPitcher, "황동하");
});

test("the previous day's five final results have actual numeric scores", () => {
  const games = parseTvingSchedule(ended(), "2026-09-08");
  assert.equal(games.length, 5);
  assert.ok(games.every((g) => g.status === "final"));
  const samsung = games.find((g) => g.home.code === "SS");
  assert.equal(samsung.away.score, 4);
  assert.equal(samsung.home.score, 6);
  assert.equal(samsung.away.startingPitcher, "시라카와");
  assert.equal(samsung.home.startingPitcher, "최원태");
});

test("the verified All-Star schedule accepts WE/EA without treating its 9999-prefixed ID as the game date", () => {
  const payload = fixture("tving-schedule-20260711.json");
  const games = parseTvingSchedule(payload, "2026-07-11");
  assert.equal(games.length, 1);
  assert.equal(games[0].id, "99990711WEEA02026");
  assert.equal(games[0].date, "2026-07-11");
  assert.equal(games[0].startsAt, "2026-07-11T18:00:00+09:00");
  assert.equal(games[0].status, "final");
  assert.deepEqual(games[0].away, { code: "WE", name: "나눔", score: 10, startingPitcher: "안우진" });
  assert.deepEqual(games[0].home, { code: "EA", name: "드림", score: 2, startingPitcher: "현도훈" });
  const ranking = standings();
  ranking.data.bands[0].items[0].code = "WE";
  ranking.data.bands[0].items[0].name = "나눔";
  assert.throws(() => parseTvingStandings(ranking, "2026-07-11"), /순위 팀 정보/);
});

test("unannounced or malformed pitcher names remain null without dropping the game", () => {
  for (const pitcherName of [undefined, null, "", "   ", "미정", "-", "TBD", 123, {}, "가".repeat(61), "선수\n이름", "<이름>"]) {
    const payload = today();
    const first = scheduleBand(payload).items[0];
    first.away.pitcherName = pitcherName;
    const result = parseTvingSchedule(payload, "2026-09-09").find((g) => g.id === first.code);
    assert.equal(result.away.startingPitcher, null);
  }
  const payload = today();
  const first = scheduleBand(payload).items[0];
  first.away.pitcherName = "  송명기  ";
  assert.equal(parseTvingSchedule(payload, "2026-09-09").find((g) => g.id === first.code).away.startingPitcher, "송명기");
});

test("READY remains scheduled; NOW, CANCEL and SUSPENDED remain distinct", () => {
  const payload = today();
  const items = scheduleBand(payload).items;
  ["READY", "NOW", "CANCEL", "SUSPENDED"].forEach((status, i) => { items[i].status = status; });
  const games = parseTvingSchedule(payload, "2026-09-09");
  const byId = new Map(games.map((g) => [g.id, g]));
  assert.equal(byId.get(items[0].code).status, "scheduled");
  assert.equal(byId.get(items[1].code).status, "live");
  assert.equal(byId.get(items[2].code).status, "cancelled");
  assert.equal(byId.get(items[2].code).away.score, null);
  assert.equal(byId.get(items[3].code).status, "suspended");
});

test("distinct game IDs preserve both games of a synthetic doubleheader", () => {
  const payload = today();
  const first = scheduleBand(payload).items[0];
  scheduleBand(payload).items = [{ ...first, code: "doubleheader-1", dateTime: 202609091400 }, { ...first, code: "doubleheader-2", dateTime: 202609091830 }];
  assert.deepEqual(parseTvingSchedule(payload, "2026-09-09").map((g) => g.id), ["doubleheader-1", "doubleheader-2"]);
});

test("an off-day response redirected to tomorrow requires explicit monthly calendar confirmation", () => {
  // The live endpoint answered a 20260907 request with focusDate 20260908.
  const payload = ended();
  assert.throws(() => parseTvingSchedule(payload, "2026-09-07"), /기준 날짜/);
  const calendar = { code: "0000", data: { calendar: scheduleBand(payload).calendar } };
  assert.deepEqual(parseTvingSchedule(payload, "2026-09-07", calendar), []);
  assert.throws(() => parseTvingSchedule(payload, "2026-09-09", calendar), /누락/);
  assert.throws(() => parseTvingSchedule(payload, "2026-09-07", { code: "0000", data: {} }), /월별/);
});

test("only explicit complete empty schedules represent a day without games", () => {
  const payload = today();
  scheduleBand(payload).items = [];
  assert.throws(() => parseTvingSchedule(payload, "2026-09-09"), /비어/);
  delete scheduleBand(payload).calendar;
  assert.throws(() => parseTvingSchedule(payload, "2026-09-09"), /월별 경기일 확인/);
  assert.deepEqual(parseTvingSchedule(payload, "2026-09-09", { code: "0000", data: { calendar: [8, 10] } }), []);
  assert.throws(() => parseTvingSchedule(payload, "2026-09-09", { code: "0000", data: { calendar: [8, 9, 10] } }), /비어/);
  scheduleBand(payload).calendar = [];
  assert.deepEqual(parseTvingSchedule(payload, "2026-09-09"), []);
  delete scheduleBand(payload).items;
  assert.throws(() => parseTvingSchedule(payload, "2026-09-09"), /누락/);
});

test("broken, partial, wrong-date and unfamiliar status responses fail instead of erasing the cache", () => {
  for (const mutate of [
    (p) => { p.code = "ERROR"; },
    (p) => { scheduleBand(p).items[0].status = "NEW_UNDOCUMENTED_STATUS"; },
    (p) => { scheduleBand(p).items[0].dateTime = 202609081830; },
    (p) => { scheduleBand(p).items[0].dateTime = 202609092930; },
    (p) => { scheduleBand(p).items.push(scheduleBand(p).items[0]); },
    (p) => { scheduleBand(p).items[0].status = "END"; delete scheduleBand(p).items[0].home.score; },
    (p) => { delete scheduleBand(p).items[0].away; },
  ]) {
    const payload = today(); mutate(payload);
    assert.throws(() => parseTvingSchedule(payload, "2026-09-09"));
  }
  assert.throws(() => parseTvingSchedule("<html>Access denied</html>", "2026-09-09"));
  assert.throws(() => parseTvingSchedule(today(), "2026-02-30"));
});

test("regular-season standings contain all ten teams, consistent totals and shared team codes", () => {
  const rows = parseTvingStandings(standings(), "2026-09-09");
  assert.equal(rows.length, 10);
  assert.equal(rows[0].team, "삼성");
  assert.equal(rows[0].wins, 73);
  assert.equal(rows[0].winRate, "0.613");
  assert.ok(rows.every((r) => r.played === r.wins + r.draws + r.losses));
  const codes = new Set(rows.map((r) => r.teamCode));
  assert.ok(parseTvingSchedule(today(), "2026-09-09").every((g) => codes.has(g.away.code) && codes.has(g.home.code)));
});

test("wrong season, duplicate/missing teams and partial standing totals are rejected; tied ranks are allowed", () => {
  for (const mutate of [
    (b) => { b.focusYearSeason.code = "2025"; },
    (b) => { b.focusGameSeason.code = "1"; },
    (b) => { b.items.pop(); },
    (b) => { b.items[1] = b.items[0]; },
    (b) => { b.items[0].wins = "99"; },
  ]) {
    const payload = standings(); mutate(payload.data.bands[0]);
    assert.throws(() => parseTvingStandings(payload, "2026-09-09"));
  }
  const payload = standings(); payload.data.bands[0].items[1].rank = 1;
  assert.equal(parseTvingStandings(payload, "2026-09-09")[1].rank, 1);
});

test("fetch uses only public date/season URLs and confirms a redirected off-day with a calendar", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push(String(url));
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers.Authorization, undefined);
    const payload = String(url).includes("history/team") ? standings()
      : String(url).includes("schedule/day") ? { code: "0000", data: { calendar: scheduleBand(ended()).calendar } }
        : ended();
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
  });
  const result = await fetchTvingKbo("2026-09-07");
  assert.equal(result.games.length, 0);
  assert.equal(result.standings.length, 10);
  assert.equal(result.sourceUpdatedAt, null);
  assert.deepEqual(calls, [
    "https://gw.tving.com/bff/sports/v2/kbo/schedule?date=20260907",
    "https://gw.tving.com/bff/sports/v2/kbo/history/team?yearSeason=2026&gameSeason=0",
    "https://gw.tving.com/bff/sports/v2/kbo/schedule/day?date=202609",
  ]);
});

test("fetch confirms an empty same-date response with a separate calendar when its calendar is missing", async (t) => {
  const calls = [];
  const payload = today();
  scheduleBand(payload).items = [];
  delete scheduleBand(payload).calendar;
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    const data = String(url).includes("history/team") ? standings()
      : String(url).includes("schedule/day") ? { code: "0000", data: { calendar: [8, 10] } }
        : payload;
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  assert.deepEqual((await fetchTvingKbo("2026-09-09")).games, []);
  assert.equal(calls.length, 3);
  assert.ok(calls[2].endsWith("schedule/day?date=202609"));
});

test("HTTP errors and non-JSON responses are rejected without including source bodies", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("not public content", { status: 503 }));
  await assert.rejects(fetchTvingKbo("2026-09-09"), /HTTP 503/);
  globalThis.fetch.mock.mockImplementation(async () => new Response("not public content", { headers: { "content-type": "text/html" } }));
  await assert.rejects(fetchTvingKbo("2026-09-09"), /JSON이 아닌/);
});

test("monthly calendar keeps all valid game days and rejects duplicates, impossible dates, and missing data", () => {
  const payload = { code: "0000", data: { calendar: [30, 1, 8, 9] } };
  assert.deepEqual(parseTvingCalendar(payload, "2026-09"), [1, 8, 9, 30]);
  assert.deepEqual(parseTvingCalendar({ code: "0000", data: { calendar: [] } }, "2026-01"), []);
  for (const calendar of [[1, 1], [0, 1], [29], [""], undefined]) {
    assert.throws(() => parseTvingCalendar({ code: "0000", data: { calendar } }, "2026-02"));
  }
  for (const month of ["2026-00", "2026-13", "202609", "2026-9", "../2026-09"]) {
    assert.throws(() => parseTvingCalendar(payload, month));
  }
  assert.throws(() => parseTvingCalendar({ code: "ERROR", data: { calendar: [] } }, "2026-09"));
});

test("calendar and historical-day fetches use only their respective public schedule endpoints", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    const payload = String(url).includes("schedule/day")
      ? { code: "0000", data: { calendar: [1, 2, 8, 9, 30] } }
      : ended();
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
  });
  assert.deepEqual(await fetchTvingCalendar("2026-09"), [1, 2, 8, 9, 30]);
  const games = await fetchTvingScheduleDay("2026-09-08");
  assert.equal(games.length, 5);
  assert.ok(games.every((g) => g.status === "final"));
  assert.deepEqual(calls, [
    "https://gw.tving.com/bff/sports/v2/kbo/schedule/day?date=202609",
    "https://gw.tving.com/bff/sports/v2/kbo/schedule?date=20260908",
  ]);
  await assert.rejects(fetchTvingCalendar("2026-13"));
  await assert.rejects(fetchTvingScheduleDay("2026-02-30"));
  assert.equal(calls.length, 2, "invalid dates must fail before making a network request");
});
