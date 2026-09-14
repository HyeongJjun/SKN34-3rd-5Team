import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "kbo-auth-bridge-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
for (const name of ["server-only", "next"]) mkdirSync(join(scratch, "node_modules", name), { recursive: true });
writeFileSync(join(scratch, "node_modules/server-only/index.js"), "module.exports = {};\n");
writeFileSync(join(scratch, "node_modules/next/headers.js"), `
const values = new Map();
exports.values = values;
exports.cookies = async () => ({
  get: name => values.has(name) ? { value: values.get(name) } : undefined,
  has: name => values.has(name),
  set: (name, value) => values.set(name, value),
  delete: name => values.delete(name),
});
`);
mkdirSync(join(scratch, "chat"));
for (const name of ["team-backend", "member-auth-request", "chat/validation", "chat/types"]) {
  const source = readFileSync(join(root, "lib", `${name}.ts`), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  writeFileSync(join(scratch, `${name}.js`), outputText);
}
const require = createRequire(join(scratch, "test.cjs"));
const cookieValues = require("next/headers").values;
const { clearTokens, saveTokens, teamRequest } = require("./team-backend.js");
const { createMemberRequestGate, isCurrentMember, loadLatestMember, normalizeMemberEmail } = require("./member-auth-request.js");
beforeEach(() => { cookieValues.clear(); process.env.CHAT_BACKEND_URL = "http://backend.test/"; });

test("empty 201 and 204 backend successes are valid", async () => {
  global.fetch = async () => new Response(null, { status: 201 });
  assert.equal(await teamRequest("auth/signup/", {}, false), null);
  global.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await teamRequest("auth/logout", {}, false), null);
});

test("DRF field errors retain status and safe fields", async () => {
  global.fetch = async () => Response.json({ username: ["이미 사용 중입니다."] }, { status: 400 });
  await assert.rejects(teamRequest("auth/signup/", {}, false), error => error.status === 400 && error.fields.username[0] === "이미 사용 중입니다.");
});

test("logout marker blocks a late refreshed access cookie until a real login", async () => {
  await clearTokens();
  cookieValues.set("kbo_access", "late-access");
  let called = false;
  global.fetch = async () => { called = true; return Response.json({}); };
  await assert.rejects(teamRequest("auth/user", undefined, true, undefined, "GET"), error => error.status === 401);
  assert.equal(called, false);
  await saveTokens("new-access", "new-refresh", true);
  assert.equal(cookieValues.has("kbo_logged_out"), false);
});

test("an in-flight refresh finishing after logout preserves the logout marker", async () => {
  cookieValues.set("kbo_refresh", "refresh-token");
  let finishRefresh;
  const refreshResponse = new Promise(resolve => { finishRefresh = resolve; });
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return refreshResponse;
    return Response.json({ id: 1 });
  };
  const pending = teamRequest("auth/user", undefined, true, undefined, "GET");
  await new Promise(resolve => setTimeout(resolve));
  await clearTokens();
  finishRefresh(Response.json({ access: "late-access", refresh: "late-refresh" }));
  await pending;
  assert.equal(cookieValues.has("kbo_logged_out"), true);
});

test("a delayed identity response cannot overwrite an explicit anonymous state", async () => {
  const gate = createMemberRequestGate();
  let finish;
  const response = new Promise(resolve => { finish = resolve; });
  let state = { status: "loading", user: null };
  const pending = loadLatestMember(gate, () => response).then(next => { if (next) state = next; });
  gate.invalidate();
  state = { status: "anonymous", user: null };
  finish(Response.json({ id: 1, username: "late-user" }));
  await pending;
  assert.deepEqual(state, { status: "anonymous", user: null });
});

test("identity timeout becomes server unavailable", async () => {
  const gate = createMemberRequestGate(5);
  const result = await loadLatestMember(gate, signal => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("timed out", "AbortError")))));
  assert.deepEqual(result, { status: "unavailable", user: null });
});

test("a delayed profile write cannot recreate a logged-out member", async () => {
  let current = { id: 1, username: "member" };
  let finish;
  const response = new Promise(resolve => { finish = resolve; });
  const pending = response.then(user => { if (isCurrentMember(current, 1)) current = user; });
  current = null;
  finish({ id: 1, username: "late-member" });
  await pending;
  assert.equal(current, null);
});

test("email comparison normalizes uppercase input", () => {
  assert.equal(normalizeMemberEmail("  USER@Example.COM  "), "user@example.com");
});
