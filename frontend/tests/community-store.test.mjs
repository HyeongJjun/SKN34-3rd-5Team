import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const frontend = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "kbo-community-test-"));
const modules = ["client-id", "community-post-category", "community-store"];
for (const name of modules) {
  const source = readFileSync(join(frontend, "lib", `${name}.ts`), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const runnable = name === "community-store" ? outputText.replace('require("react")', '({ useMemo() { throw new Error("hook not used in storage tests") }, useSyncExternalStore() { throw new Error("hook not used in storage tests") } })') : outputText;
  writeFileSync(join(scratch, `${name}.js`), runnable);
}
after(() => {
  delete globalThis.localStorage;
  delete globalThis.window;
  for (const name of modules) unlinkSync(join(scratch, `${name}.js`));
  rmdirSync(scratch);
});
const requireModule = createRequire(join(scratch, "entry.cjs"));
const api = requireModule("./community-store.js");
let values;
let blocked;

beforeEach(() => {
  values = new Map();
  blocked = false;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new Error("quota"); values.set(key, value); },
  };
  globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
});

const postInput = { board: "teams", teamCode: "LG", category: "직관후기", title: "오늘 직관 후기", content: "끝내기 승리를 보고 왔어요.", authorId: "preview-member-2", author: "테스트팬" };

test("posts and comments persist with backend-migration fields and HTTP-compatible client IDs", () => {
  const post = api.createCommunityPost(postInput);
  const comment = api.createCommunityComment({ postId: post.id, authorId: "preview-member-3", author: "댓글팬", content: "후기 잘 봤어요!" });
  const exported = api.exportCommunityContent();
  assert.match(post.clientId, /^[0-9a-f-]{36}$/);
  assert.match(comment.clientId, /^[0-9a-f-]{36}$/);
  assert.equal(post.postNumber, "700001");
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.posts[0].authorId, "preview-member-2");
  assert.equal(exported.comments[0].postId, post.id);
  assert.equal(api.commentsForPost(exported.comments, post.id).length, 1);
});

test("new posts receive stable increasing numbers and are separated by board", () => {
  const first = api.createCommunityPost(postInput);
  const second = api.createCommunityPost({ ...postInput, board: "free", teamCode: "", title: "자유 게시판 글" });
  const state = api.parseCommunityState(values.values().next().value);
  assert.equal(first.postNumber, "700001");
  assert.equal(second.postNumber, "700002");
  assert.equal(api.localPostsForBoard(state.posts, "teams").length, 1);
  assert.equal(api.localPostsForBoard(state.posts, "free").length, 1);
});

test("deleting a browser post removes its comments without touching other posts", () => {
  const deleted = api.createCommunityPost(postInput);
  const kept = api.createCommunityPost({ ...postInput, title: "남겨 둘 글" });
  api.createCommunityComment({ postId: deleted.id, authorId: null, author: "팬", content: "함께 지울 댓글" });
  api.deleteCommunityPost(deleted.id);
  const exported = api.exportCommunityContent();
  assert.deepEqual(exported.posts.map(post => post.id), [kept.id]);
  assert.equal(exported.comments.length, 0);
});

test("invalid content and browser storage failures are surfaced", () => {
  assert.throws(() => api.createCommunityPost({ ...postInput, title: "한" }), /두 글자/);
  assert.throws(() => api.createCommunityComment({ postId: "fixture-1", authorId: null, author: "팬", content: "  " }), /내용/);
  blocked = true;
  assert.throws(() => api.createCommunityPost(postInput), /저장 공간/);
});
