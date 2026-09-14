import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/route-number.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const require = createRequire(import.meta.url);
function harness() {
  let raw = null;
  let blocked = false;
  let queue = Promise.resolve();
  const locksStorage = new Map();
  const storage = {
    getItem: key => key === "kbo-route-numbers-v1" ? raw : locksStorage.get(key) ?? null,
    setItem: (key, value) => {
      if (blocked) throw new Error("Storage full");
      if (key === "kbo-route-numbers-v1") raw = value;
      else locksStorage.set(key, value);
    },
    removeItem: key => locksStorage.delete(key),
  };
  const locks = { request: (_, callback) => { const next = queue.then(callback); queue = next.catch(() => {}); return next; } };
  const load = (secure = true) => {
    const context = { exports: {}, require, navigator: secure ? { locks } : {}, window: { localStorage: storage, dispatchEvent() {} }, Event, setTimeout, Date, Math };
    vm.runInNewContext(code, context);
    return context.exports.ensureLocalRouteNumber;
  };
  return { load, block: () => { blocked = true; }, replace: value => { raw = value; } };
}

test("route numbers remain stable after reload and distinct from other routes", async () => {
  const h = harness(); const allocate = h.load();
  assert.equal(await allocate("jamsil-day"), "000001");
  assert.equal(await allocate("route-a"), "000007");
  assert.equal(await allocate("route-b"), "000008");
  assert.equal(await h.load()("route-a"), "000007");
  assert.equal(await h.load()("route-c"), "000009");
});
test("concurrent tab allocations use one registry without duplicate numbers", async () => {
  const h = harness(); const first = h.load(); const second = h.load();
  const numbers = await Promise.all([first("a"), second("b"), second("a")]);
  assert.deepEqual(numbers, ["000007", "000008", "000007"]);
});
test("HTTP fallback allocates stable, distinct route numbers without navigator.locks", async () => {
  const h = harness(); const first = h.load(false); const second = h.load(false);
  const numbers = await Promise.all([first("http-a"), second("http-b"), second("http-a")]);
  assert.equal(new Set(numbers).size, 2);
  assert.equal(await h.load(false)("http-a"), numbers[0]);
});
test("storage failure never returns an unpersisted number", async () => {
  const h = harness(); h.block();
  await assert.rejects(h.load()("new-route"), /Storage full/);
});
test("damaged or exhausted registries never reset and reuse numbers", async () => {
  const h = harness();
  h.replace("broken"); await assert.rejects(h.load()("new-route"));
  h.replace(JSON.stringify({ last: 8, entries: { a: "000007", b: "000007" } }));
  await assert.rejects(h.load()("new-route"));
  h.replace(JSON.stringify({ last: 999999, entries: {} }));
  await assert.rejects(h.load()("new-route"), /exhausted/);
});
