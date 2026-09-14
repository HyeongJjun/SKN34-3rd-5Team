"use client";

import { useMemo, useSyncExternalStore } from "react";
import { createClientId } from "./client-id";
import { communityPostCategories, type CommunityPostCategory } from "./community-post-category";

export type CommunityBoardSection = "free" | "teams" | "predictions";

export type LocalCommunityPost = {
  id: string;
  clientId: string;
  postNumber: string;
  board: CommunityBoardSection;
  teamCode: string;
  category: CommunityPostCategory;
  title: string;
  content: string;
  authorId: string | null;
  author: string;
  createdAt: string;
  updatedAt: string;
  views: number;
  recommendations: number;
  isSample: false;
};

export type LocalCommunityComment = {
  id: string;
  clientId: string;
  postId: string;
  authorId: string | null;
  author: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type CommunityState = {
  version: 1;
  nextPostNumber: number;
  posts: LocalCommunityPost[];
  comments: LocalCommunityComment[];
};

export type CreateCommunityPostInput = Pick<LocalCommunityPost, "board" | "teamCode" | "category" | "title" | "content" | "authorId" | "author">;
export type CreateCommunityCommentInput = Pick<LocalCommunityComment, "postId" | "authorId" | "author" | "content">;

const STORAGE_KEY = "kbo-community-content-v1";
const CHANGE_EVENT = "kbo-community-content-change";
const FIRST_LOCAL_POST_NUMBER = 700001;
const EMPTY_STATE: CommunityState = { version: 1, nextPostNumber: FIRST_LOCAL_POST_NUMBER, posts: [], comments: [] };
const EMPTY_SNAPSHOT = JSON.stringify(EMPTY_STATE);
const boards = new Set<CommunityBoardSection>(["free", "teams", "predictions"]);
const categories = new Set<string>(communityPostCategories);

const isIsoDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export function parseCommunityState(raw: string | null | undefined): CommunityState {
  if (!raw) return EMPTY_STATE;
  try {
    const value = JSON.parse(raw) as Partial<CommunityState>;
    if (value.version !== 1 || !Array.isArray(value.posts) || !Array.isArray(value.comments)) return EMPTY_STATE;
    const posts = value.posts.flatMap((post): LocalCommunityPost[] => {
      if (!post || typeof post !== "object") return [];
      const item = post as Partial<LocalCommunityPost>;
      const board = item.board;
      const category = item.category;
      const title = cleanText(item.title, 100);
      const content = cleanText(item.content, 10000);
      const author = cleanText(item.author, 20);
      if (!boards.has(board as CommunityBoardSection) || !categories.has(String(category)) || !title || !content || !author || !isIsoDate(item.createdAt)) return [];
      const id = cleanText(item.id, 80);
      const clientId = cleanText(item.clientId, 80);
      const postNumber = cleanText(item.postNumber, 6);
      if (!id || !clientId || !/^\d{6}$/.test(postNumber)) return [];
      return [{
        id,
        clientId,
        postNumber,
        board: board as CommunityBoardSection,
        teamCode: cleanText(item.teamCode, 4).toUpperCase(),
        category: category as CommunityPostCategory,
        title,
        content,
        authorId: typeof item.authorId === "string" && item.authorId ? item.authorId.slice(0, 80) : null,
        author,
        createdAt: item.createdAt,
        updatedAt: isIsoDate(item.updatedAt) ? item.updatedAt : item.createdAt,
        views: Number.isSafeInteger(item.views) && Number(item.views) >= 0 ? Number(item.views) : 0,
        recommendations: Number.isSafeInteger(item.recommendations) && Number(item.recommendations) >= 0 ? Number(item.recommendations) : 0,
        isSample: false,
      }];
    });
    const comments = value.comments.flatMap((comment): LocalCommunityComment[] => {
      if (!comment || typeof comment !== "object") return [];
      const item = comment as Partial<LocalCommunityComment>;
      const id = cleanText(item.id, 80);
      const clientId = cleanText(item.clientId, 80);
      const postId = cleanText(item.postId, 80);
      const author = cleanText(item.author, 20);
      const content = cleanText(item.content, 2000);
      // Comments on fixture posts are valid even though their post IDs are not stored here.
      if (!id || !clientId || !postId || !author || !content || !isIsoDate(item.createdAt)) return [];
      return [{ id, clientId, postId, authorId: typeof item.authorId === "string" && item.authorId ? item.authorId.slice(0, 80) : null, author, content, createdAt: item.createdAt, updatedAt: isIsoDate(item.updatedAt) ? item.updatedAt : item.createdAt }];
    });
    const highestNumber = posts.reduce((highest, post) => Math.max(highest, Number(post.postNumber)), FIRST_LOCAL_POST_NUMBER - 1);
    const requestedNext = Number.isSafeInteger(value.nextPostNumber) ? Number(value.nextPostNumber) : FIRST_LOCAL_POST_NUMBER;
    const nextPostNumber = Math.max(FIRST_LOCAL_POST_NUMBER, highestNumber + 1, requestedNext);
    return { version: 1, nextPostNumber, posts, comments };
  } catch {
    return EMPTY_STATE;
  }
}

function snapshot() {
  try { return localStorage.getItem(STORAGE_KEY) ?? EMPTY_SNAPSHOT; } catch { return EMPTY_SNAPSHOT; }
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(CHANGE_EVENT, callback); window.removeEventListener("storage", callback); };
}

function persist(state: CommunityState) {
  if (typeof window === "undefined") throw new Error("브라우저에서만 저장할 수 있어요.");
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { throw new Error("브라우저 저장 공간에 글을 저장하지 못했어요."); }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useCommunityContent() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => EMPTY_SNAPSHOT);
  return useMemo(() => parseCommunityState(raw), [raw]);
}

export function createCommunityPost(input: CreateCommunityPostInput): LocalCommunityPost {
  const state = parseCommunityState(snapshot());
  if (state.nextPostNumber > 999999) throw new Error("임시 게시글 번호를 더 발급할 수 없어요.");
  const title = cleanText(input.title, 100);
  const content = cleanText(input.content, 10000);
  const author = cleanText(input.author, 20);
  if (!boards.has(input.board)) throw new Error("게시판을 다시 선택해 주세요.");
  if (!categories.has(input.category)) throw new Error("말머리를 다시 선택해 주세요.");
  if (input.board === "teams" && !input.teamCode) throw new Error("팀 게시판을 선택해 주세요.");
  if (title.length < 2) throw new Error("제목은 두 글자 이상 입력해 주세요.");
  if (!content) throw new Error("본문을 입력해 주세요.");
  if (!author) throw new Error("작성자 이름을 입력해 주세요.");
  const now = new Date().toISOString();
  const clientId = createClientId();
  const post: LocalCommunityPost = {
    id: `local-post-${clientId}`,
    clientId,
    postNumber: String(state.nextPostNumber).padStart(6, "0"),
    board: input.board,
    teamCode: cleanText(input.teamCode, 4).toUpperCase(),
    category: input.category,
    title,
    content,
    authorId: input.authorId || null,
    author,
    createdAt: now,
    updatedAt: now,
    views: 0,
    recommendations: 0,
    isSample: false,
  };
  persist({ ...state, nextPostNumber: state.nextPostNumber + 1, posts: [post, ...state.posts] });
  return post;
}

export function createCommunityComment(input: CreateCommunityCommentInput): LocalCommunityComment {
  const state = parseCommunityState(snapshot());
  const postId = cleanText(input.postId, 80);
  const author = cleanText(input.author, 20);
  const content = cleanText(input.content, 2000);
  if (!postId) throw new Error("댓글을 달 게시글을 찾지 못했어요.");
  if (!author) throw new Error("작성자 이름을 입력해 주세요.");
  if (!content) throw new Error("댓글 내용을 입력해 주세요.");
  const now = new Date().toISOString();
  const clientId = createClientId();
  const comment: LocalCommunityComment = { id: `local-comment-${clientId}`, clientId, postId, authorId: input.authorId || null, author, content, createdAt: now, updatedAt: now };
  persist({ ...state, comments: [...state.comments, comment] });
  return comment;
}

export function deleteCommunityPost(postId: string) {
  const state = parseCommunityState(snapshot());
  const nextPosts = state.posts.filter(post => post.id !== postId);
  if (nextPosts.length === state.posts.length) throw new Error("삭제할 임시 글을 찾지 못했어요.");
  persist({ ...state, posts: nextPosts, comments: state.comments.filter(comment => comment.postId !== postId) });
}

export function commentsForPost(comments: LocalCommunityComment[], postId: string) {
  return comments.filter(comment => comment.postId === postId);
}

export function localPostsForBoard(posts: LocalCommunityPost[], board: CommunityBoardSection) {
  return posts.filter(post => post.board === board);
}

export function exportCommunityContent() {
  const state = parseCommunityState(snapshot());
  return { schemaVersion: state.version, exportedAt: new Date().toISOString(), posts: state.posts, comments: state.comments };
}
