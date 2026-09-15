import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const frontend = new URL("../", import.meta.url);
const bottom = readFileSync(new URL("components/community-post-bottom.tsx", frontend), "utf8");
const vote = readFileSync(new URL("components/community-post-vote.tsx", frontend), "utf8");
const editor = readFileSync(new URL("components/community-post-editor.tsx", frontend), "utf8");

test("bottom write action delegates to the real editor and has no placeholder fallback", () => {
  assert.match(bottom, /onWrite\?: \(\) => void/);
  assert.match(bottom, /\{onWrite && <button[^>]+onClick=\{onWrite\}>글쓰기<\/button>\}/);
  assert.doesNotMatch(bottom, /게시글 작성은 서버 연결 후 이용할 수 있어요|글쓰기 안내|showModal/);
});

test("editor idempotency keys retain a native insecure-origin fallback", () => {
  assert.match(editor, /typeof crypto\.randomUUID === "function"/);
  assert.match(editor, /crypto\.getRandomValues\(new Uint8Array\(16\)\)/);
  assert.doesNotMatch(editor, /Math\.random/);
});

test("authenticated vote waits for server state and always releases the matching request", () => {
  assert.match(vote, /useState\(Boolean\(actorId\)\)/);
  assert.match(vote, /disabled=\{pending\}/);
  assert.match(vote, /\.finally\(\(\) => \{ if \(requestRef\.current === requestId\) setPending\(false\); \}\)/);
  assert.match(vote, /key=\{`\$\{post\.id\}:\$\{actorId \?\? "anonymous"\}:\$\{post\.recommendations\}:\$\{downvotes\}`\}/);
});

test("server vote control sends up, down, and cancel as final desired states", () => {
  const source = readFileSync(new URL("lib/community-votes.ts", frontend), "utf8");
  assert.doesNotMatch(source, /useCommunityVotes|localStorage/);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const testModule = { exports: {} };
  new Function("module", "exports", outputText)(testModule, testModule.exports);
  const next = testModule.exports.nextCommunityVote;
  assert.equal(next(null, "up"), "up");
  assert.equal(next("up", "up"), null);
  assert.equal(next("up", "down"), "down");
});
