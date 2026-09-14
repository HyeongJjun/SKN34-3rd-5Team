import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/course-api.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });

function harness() {
  const storage = new Map();
  let blocked = false;
  const window = { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new Error("quota"); storage.set(key, value); },
    removeItem: key => storage.delete(key),
  } };
  const testModule = { exports: {} };
  new Function("module", "exports", "window", outputText)(testModule, testModule.exports, window);
  return { ...testModule.exports, storage, block: () => { blocked = true; } };
}

const apiCourse = changes => ({
  id: "123e4567-e89b-12d3-a456-426614174000", title: "잠실 직관 코스", stadium: "잠실야구장",
  content: "", duration: "반나절", tags: [], author: "익명", createdAt: "2026-09-12T12:00:00Z",
  updatedAt: "2026-09-12T12:00:00Z", stops: [{ position: 0, name: "카페", category: "카페", lat: 37.51, lng: 127.07 }],
  ...changes,
});
const route = changes => ({
  id: "", title: "잠실 직관 코스", stadium: "잠실야구장", description: "카페", content: "", tags: [], duration: "반나절",
  cover: "/images/stadium-night.jpg", author: "익명", likes: 0, isSample: false, owned: true,
  createdAt: "2026-09-12T12:00:00Z", start: { lat: 37.5, lng: 127.1 },
  stops: [{ name: "카페", category: "카페", placeId: "p1", lat: 37.51, lng: 127.07 }], ...changes,
});

test("create sends ordered stops and stores only the returned edit token", async () => {
  const api = harness();
  const saved = await api.persistCourse(route(), async (url, init) => {
    assert.equal(url, "/course-api");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), {
      title: "잠실 직관 코스", stadium: "잠실야구장", content: "", contentFormat: "", duration: "반나절", tags: [],
      startLat: 37.5, startLng: 127.1, stops: [{ name: "카페", category: "카페", placeId: "p1", lat: 37.51, lng: 127.07, position: 0 }],
    });
    return Response.json(apiCourse({ editToken: "edit-secret" }), { status: 201 });
  });
  assert.equal(saved.id, apiCourse({}).id);
  assert.equal(saved.owned, true);
  assert.deepEqual([...api.storage], [[`kbo-course-edit-token:${saved.id}`, "edit-secret"]]);
});

test("list ownership, update, and delete all use the per-course token", async () => {
  const api = harness();
  const id = apiCourse({}).id;
  api.storage.set(`kbo-course-edit-token:${id}`, "edit-secret");
  const listed = await api.fetchCourses(async () => Response.json([apiCourse({})]));
  assert.equal(listed[0].owned, true);
  await api.persistCourse(route({ id }), async (url, init) => {
    assert.equal(url, `/course-api/${id}`);
    assert.equal(init.method, "PATCH");
    assert.equal(init.headers["X-Course-Edit-Token"], "edit-secret");
    return Response.json(apiCourse({}));
  });
  await api.removeCourse(id, async (url, init) => {
    assert.equal(url, `/course-api/${id}`);
    assert.equal(init.headers["X-Course-Edit-Token"], "edit-secret");
    return new Response(null, { status: 204 });
  });
  assert.equal(api.storage.size, 0);
});

test("a missing edit token fails closed", async () => {
  const api = harness();
  await assert.rejects(api.persistCourse(route({ id: apiCourse({}).id }), async () => { throw new Error("must not fetch"); }), /편집 토큰/);
});

test("token storage failure keeps session edit access and never retries POST", async () => {
  const api = harness();
  api.block();
  const created = await api.persistCourse(route(), async (_url, init) => {
    assert.equal(init.method, "POST");
    return Response.json(apiCourse({ editToken: "edit-secret" }), { status: 201 });
  });
  assert.match(created.saveWarning, /새로고침하면 읽기 전용/);
  assert.equal(api.storage.size, 0);
  await api.persistCourse({ ...created, title: "변경" }, async (url, init) => {
    assert.equal(url, `/course-api/${created.id}`);
    assert.equal(init.method, "PATCH");
    assert.equal(init.headers["X-Course-Edit-Token"], "edit-secret");
    return Response.json(apiCourse({ title: "변경" }));
  });
});

test("clearing an existing start sends explicit null coordinates", async () => {
  const api = harness();
  const id = apiCourse({}).id;
  api.storage.set(`kbo-course-edit-token:${id}`, "edit-secret");
  await api.persistCourse(route({ id, start: undefined }), async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.startLat, null);
    assert.equal(body.startLng, null);
    return Response.json(apiCourse({}));
  });
});
