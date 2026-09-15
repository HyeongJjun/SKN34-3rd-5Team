"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { communityPostCategories, type CommunityPostCategory } from "@/lib/community-post-category";
import { createCommunityPost, updateCommunityPost, type CommunityPostInput } from "@/lib/community-api";
import { useMemberAuth } from "@/lib/member-auth";
import { getTeamBoard, teamBoards, type TeamCommunityPost } from "@/lib/team-community";
import styles from "./community-board.module.css";

type Props = {
  board: "free" | "teams";
  teamCode?: string;
  post?: TeamCommunityPost;
  onClose: () => void;
  onSaved: (post: TeamCommunityPost) => void;
};
type Draft = { teamCode: string; category: CommunityPostCategory; title: string; content: string };

function submissionKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function CommunityPostEditor({ board, teamCode = "", post, onClose, onSaved }: Props) {
  const { status, user } = useMemberAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(false);
  const idempotency = useRef({ signature: "", key: "" });
  const defaultTeam = getTeamBoard(post?.teamCode ?? teamCode)?.code ?? getTeamBoard(user?.team_code ?? "")?.code ?? teamBoards[0].code;
  const [draft, setDraft] = useState<Draft>({
    teamCode: defaultTeam,
    category: (post?.category ?? communityPostCategories[0]) as CommunityPostCategory,
    title: post?.title ?? "",
    content: post?.content ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || status !== "authenticated") return;
    const input: CommunityPostInput = { board, teamCode: board === "free" ? "" : draft.teamCode, category: draft.category, title: draft.title.trim(), content: draft.content.trim() };
    const signature = JSON.stringify(input);
    if (idempotency.current.signature !== signature) idempotency.current = { signature, key: submissionKey() };
    request.current = true; setSaving(true); setError("");
    try {
      const saved = post ? await updateCommunityPost(post.id, input) : await createCommunityPost(input, idempotency.current.key);
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "게시글을 저장하지 못했어요.");
    } finally {
      request.current = false; setSaving(false);
    }
  }

  return <dialog ref={dialog} className={`${styles.reportDialog} ${styles.editorDialog}`} aria-labelledby="community-editor-title" onClose={onClose} onCancel={event => { if (saving) event.preventDefault(); }}>
    <form onSubmit={submit}>
      <h2 id="community-editor-title">{post ? "게시글 수정" : "게시글 작성"}</h2>
      {board === "teams" && <label>팀<select value={draft.teamCode} onChange={event => setDraft(value => ({ ...value, teamCode: event.target.value }))} disabled={saving}>{teamBoards.map(team => <option key={team.code} value={team.code}>{team.name}</option>)}</select></label>}
      <label>분류<select value={draft.category} onChange={event => setDraft(value => ({ ...value, category: event.target.value as CommunityPostCategory }))} disabled={saving}>{communityPostCategories.map(category => <option key={category}>{category}</option>)}</select></label>
      <label>제목<input value={draft.title} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} maxLength={200} required disabled={saving} /></label>
      <label>내용<textarea value={draft.content} onChange={event => setDraft(value => ({ ...value, content: event.target.value }))} maxLength={20000} rows={12} required disabled={saving} /></label>
      {status !== "authenticated" && <p role="status">게시글 작성은 <Link href="/login">로그인</Link> 후 이용할 수 있어요.</p>}
      {error && <p role="alert">{error}</p>}
      <div className={styles.editorActions}><button type="button" onClick={() => dialog.current?.close()} disabled={saving}>취소</button><button type="submit" disabled={saving || status !== "authenticated"}>{saving ? "저장 중…" : "저장"}</button></div>
    </form>
  </dialog>;
}
