import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const frontend = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "kbo-directions-route-test-"));
mkdirSync(join(scratch, "lib")); mkdirSync(join(scratch, "app", "directions-api"), { recursive: true });
for (const name of ["course-directions", "course-directions-server", "stadiums", "nearby-places", "tour-places", "tour-api", "tour-api-server"]) {
  writeFileSync(join(scratch, "lib", `${name}.js`), ts.transpileModule(readFileSync(join(frontend, "lib", `${name}.ts`), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
}
const routeSource = readFileSync(join(frontend, "app", "directions-api", "route.ts"), "utf8").replaceAll('"@/lib/', '"../../lib/');
writeFileSync(join(scratch, "app", "directions-api", "route.js"), ts.transpileModule(routeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText);
after(() => rmSync(scratch, { recursive: true }));
const requireModule = createRequire(join(scratch, "entry.cjs"));
const { POST } = requireModule("./app/directions-api/route.js");
const originalFetch = globalThis.fetch;
const originalKey = process.env.KAKAO_REST_API_KEY;
const originalTourKey = process.env.TOUR_API_KEY;
after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.KAKAO_REST_API_KEY; else process.env.KAKAO_REST_API_KEY = originalKey;
  if (originalTourKey === undefined) delete process.env.TOUR_API_KEY; else process.env.TOUR_API_KEY = originalTourKey;
});

const request = (body, init = {}) => new Request("http://example.test/directions-api", { method: "POST", headers: { "Content-Type": "application/json", ...init.headers }, body: typeof body === "string" ? body : JSON.stringify(body), signal: init.signal });
const walk = { status: "OK", route: { properties: { totalDistance: 100, totalTime: 60 }, legs: [{ steps: [{ path: { points: [[127.1, 37.5], [127.2, 37.6]] }, properties: { guidance: "이동" } }] }] } };

test("directions and tourism stay on the Next route while places bypass it", () => {
  const nearby = readFileSync(join(frontend, "components", "nearby-route-planner.tsx"), "utf8");
  const routeMap = readFileSync(join(frontend, "components", "route-map.tsx"), "utf8");
  const travel = readFileSync(join(frontend, "components", "course-travel.tsx"), "utf8");
  assert.match(nearby, /action: "tourism"/); assert.doesNotMatch(nearby, /fetch\([^\n]*\/tour-api/);
  assert.match(routeMap, /searchKakaoPlaces/); assert.doesNotMatch(routeMap, /\.keywordSearch\(|\.categorySearch\(/);
  assert.match(travel, /action: "directions"/);
  assert.doesNotMatch(routeSource, /kakao-places-server|action === "places"/);
});

test("rejects the removed places relay, unknown actions, non-JSON and oversized bodies", async () => {
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; return Response.json(walk); };
  assert.equal((await POST(request({ action: "places", method: "category" }))).status, 400);
  assert.equal((await POST(request({ action: "proxy", url: "https://evil.test" }))).status, 400);
  assert.equal((await POST(new Request("http://example.test/directions-api", { method: "POST", body: "{}" }))).status, 415);
  assert.equal((await POST(request("{", {}))).status, 400);
  assert.equal((await POST(request("{}", { headers: { "content-length": "12001" } }))).status, 413);
  assert.equal(fetches, 0);
});

test("rejects explicitly supplied non-string actions before upstream dispatch", async () => {
  process.env.KAKAO_REST_API_KEY = "test-key";
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; return Response.json(walk); };
  const points = [{ lat: 37.5, lng: 127.1 }, { lat: 37.6, lng: 127.2 }];
  for (const action of [null, { toString: null }, [], ["places"], 1, true, false]) {
    assert.equal((await POST(request({ action, mode: "walk", points }))).status, 400);
  }
  for (const action of [undefined, "directions"]) {
    for (const mode of [null, { toString: null }, [], ["walk"], 1, true, false]) {
      assert.equal((await POST(request({ ...(action === undefined ? {} : { action }), mode, points }))).status, 400);
    }
  }
  assert.equal(fetches, 0);
});

test("preserves legacy directions, supports explicit directions and missing optional tourism key", async () => {
  delete process.env.TOUR_API_KEY;
  globalThis.fetch = async () => Response.json(walk);
  const points = [{ lat: 37.5, lng: 127.1 }, { lat: 37.6, lng: 127.2 }];
  delete process.env.KAKAO_REST_API_KEY;
  assert.equal((await POST(request({ mode: "walk", points }))).status, 503);
  process.env.KAKAO_REST_API_KEY = "test-key";
  for (const body of [{ mode: "walk", points }, { action: "directions", mode: "walk", points }]) {
    const response = await POST(request(body));
    assert.equal(response.status, 200); assert.equal((await response.json()).legs[0].status, "ok");
  }
  const tourism = await POST(request({ action: "tourism", stadium: "JAMSIL", lat: 37.5161987797456, lng: 127.075940589715 }));
  assert.equal(tourism.status, 200); assert.deepEqual(await tourism.json(), { status: "unconfigured", places: [], truncated: false });
});
