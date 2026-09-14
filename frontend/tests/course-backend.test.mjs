import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const frontend = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "kbo-course-backend-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
for (const dependency of ["server-only", "next/headers"]) {
  const directory = join(scratch, "node_modules", dependency);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "index.js"), dependency === "next/headers" ? "exports.cookies = async () => ({ get() {} });\n" : "module.exports = {};\n");
}
mkdirSync(join(scratch, "chat"));
for (const [source, target] of [
  ["lib/chat/types.ts", "chat/types.js"],
  ["lib/chat/validation.ts", "chat/validation.js"],
  ["lib/team-backend.ts", "team-backend.js"],
  ["lib/course-backend.ts", "course-backend.js"],
]) {
  const output = ts.transpileModule(readFileSync(join(frontend, source), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  writeFileSync(join(scratch, target), output);
}
const requireTestModule = createRequire(join(scratch, "entry.cjs"));
const { forwardCourseRequest } = requireTestModule("./course-backend.js");
const originalFetch = globalThis.fetch;
const originalCourseBackendUrl = process.env.COURSE_BACKEND_URL;
const originalChatBackendUrl = process.env.CHAT_BACKEND_URL;
beforeEach(() => { process.env.COURSE_BACKEND_URL = "https://backend.example/base/"; delete process.env.CHAT_BACKEND_URL; });
after(() => {
  globalThis.fetch = originalFetch;
  if (originalCourseBackendUrl === undefined) delete process.env.COURSE_BACKEND_URL;
  else process.env.COURSE_BACKEND_URL = originalCourseBackendUrl;
  if (originalChatBackendUrl === undefined) delete process.env.CHAT_BACKEND_URL;
  else process.env.CHAT_BACKEND_URL = originalChatBackendUrl;
});

test("course proxy forwards JSON and the edit token to the validated backend URL", async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url.href, "https://backend.example/base/courses/course-id/");
    assert.equal(init.method, "PATCH");
    assert.equal(init.headers["X-Course-Edit-Token"], "edit-secret");
    assert.equal(init.headers["X-Forwarded-For"], "203.0.113.7");
    assert.equal(init.body, '{"title":"변경"}');
    return Response.json({ id: "course-id" });
  };
  const request = new Request("https://app.example/course-api/course-id", {
    method: "PATCH",
    headers: { origin: "https://app.example", "content-type": "application/json", "x-course-edit-token": "edit-secret", "x-forwarded-for": "203.0.113.7" },
    body: '{"title":"변경"}',
  });
  const response = await forwardCourseRequest(request, "courses/course-id/");
  assert.equal(response.status, 200);
});

test("course proxy preserves a bodyless backend DELETE response", async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 });
  const request = new Request("https://app.example/course-api/course-id", {
    method: "DELETE",
    headers: { origin: "https://app.example", "x-course-edit-token": "edit-secret" },
  });
  const response = await forwardCourseRequest(request, "courses/course-id/");
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});

test("course proxy rejects declared oversized bodies before reading or fetching", async () => {
  globalThis.fetch = async () => assert.fail("oversized requests must not reach the backend");
  const request = new Request("https://app.example/course-api", {
    method: "POST",
    headers: { origin: "https://app.example", "content-type": "application/json", "content-length": "64001" },
    body: "{}",
  });
  assert.equal((await forwardCourseRequest(request, "courses/")).status, 413);
  assert.equal(request.bodyUsed, false);
});

test("course proxy streams non-bodyless backend responses", async () => {
  let upstream;
  globalThis.fetch = async () => upstream = Response.json([{ id: "course-id" }]);
  const response = await forwardCourseRequest(new Request("https://app.example/course-api"), "courses/");
  assert.equal(upstream.bodyUsed, false);
  assert.deepEqual(await response.json(), [{ id: "course-id" }]);
});

test("course proxy rejects cross-site writes before fetching", async () => {
  globalThis.fetch = async () => assert.fail("cross-site requests must not reach the backend");
  const request = new Request("https://app.example/course-api", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  const response = await forwardCourseRequest(request, "courses/");
  assert.equal(response.status, 403);
});

test("course proxy reuses backend URL validation", async () => {
  process.env.COURSE_BACKEND_URL = "https://user:password@backend.example/";
  globalThis.fetch = async () => assert.fail("unsafe backend URLs must not be fetched");
  const response = await forwardCourseRequest(new Request("https://app.example/course-api"), "courses/");
  assert.equal(response.status, 503);
});

test("course proxy never falls back to the chat backend URL", async () => {
  delete process.env.COURSE_BACKEND_URL;
  process.env.CHAT_BACKEND_URL = "https://chat.example/";
  globalThis.fetch = async () => assert.fail("the chat backend must not receive course data");
  const response = await forwardCourseRequest(new Request("https://app.example/course-api"), "courses/");
  assert.equal(response.status, 503);
});

test("course proxy drops spoofable multi-value forwarded addresses", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers["X-Forwarded-For"], undefined);
    return Response.json([]);
  };
  const request = new Request("https://app.example/course-api", { headers: { "x-forwarded-for": "198.51.100.9, 203.0.113.7" } });
  assert.equal((await forwardCourseRequest(request, "courses/")).status, 200);
});

test("course proxy times out a hanging backend with a sanitized response", async () => {
  const timeout = AbortSignal.timeout;
  const keepAlive = setTimeout(() => {}, 100);
  AbortSignal.timeout = () => timeout(1);
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    const abort = () => reject(init.signal.reason);
    if (init.signal.aborted) abort();
    else init.signal.addEventListener("abort", abort, { once: true });
  });
  try {
    const response = await forwardCourseRequest(new Request("https://app.example/course-api"), "courses/");
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "코스 서버에 연결하지 못했어요." });
  } finally { clearTimeout(keepAlive); AbortSignal.timeout = timeout; }
});

test("course Route Handlers forward every method to the stripped Django paths", async () => {
  const calls = [];
  const loadRoute = relative => {
    const exports = {};
    const source = ts.transpileModule(readFileSync(join(frontend, relative), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function("exports", "require", source)(exports, id => {
      assert.equal(id, "@/lib/course-backend");
      return { forwardCourseRequest: async (request, path) => { calls.push([request.method, path]); return new Response(null, { status: 204 }); } };
    });
    return exports;
  };
  const collection = loadRoute("app/course-api/route.ts");
  const detail = loadRoute("app/course-api/[id]/route.ts");
  await collection.GET(new Request("https://app.example/course-api"));
  await collection.POST(new Request("https://app.example/course-api", { method: "POST" }));
  const context = { params: Promise.resolve({ id: "id/with space" }) };
  await detail.GET(new Request("https://app.example/course-api/id"), context);
  await detail.PATCH(new Request("https://app.example/course-api/id", { method: "PATCH" }), context);
  await detail.DELETE(new Request("https://app.example/course-api/id", { method: "DELETE" }), context);
  assert.deepEqual(calls, [
    ["GET", "courses/"],
    ["POST", "courses/"],
    ["GET", "courses/id%2Fwith%20space/"],
    ["PATCH", "courses/id%2Fwith%20space/"],
    ["DELETE", "courses/id%2Fwith%20space/"],
  ]);
});
