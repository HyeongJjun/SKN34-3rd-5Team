"use client";

import { forwardRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { communityPostCategories, type CommunityPostCategory } from "@/lib/community-post-category";
import { createCommunityPost, type CommunityBoardSection, type LocalCommunityPost } from "@/lib/community-store";
import { usePreviewMember } from "@/lib/member-preview";
import { getTeamBoardHref, teamBoards } from "@/lib/team-community";
import styles from "./community-board.module.css";

function postHref(post: LocalCommunityPost) {
  if (post.board === "free") return `/community?post=${encodeURIComponent(post.id)}`;
  if (post.board === "teams") return getTeamBoardHref(post.teamCode, post.id);
  const params = new URLSearchParams({ post: post.id });
  if (post.teamCode) params.set("team", post.teamCode);
  return `/community/predictions?${params.toString()}`;
}

export const CommunityPostEditor = forwardRef<HTMLDialogElement, { section: CommunityBoardSection; teamCode?: string }>(function CommunityPostEditor({ section, teamCode = "" }, ref) {
  const router = useRouter();
  const member = usePreviewMember();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    try {
      const post = createCommunityPost({
        board: section,
        teamCode: String(data.get("teamCode") ?? ""),
        category: String(data.get("category") ?? "잡담") as CommunityPostCategory,
        title: String(data.get("title") ?? ""),
        content: String(data.get("content") ?? ""),
        authorId: member?.id ?? null,
        author: member?.nickname ?? String(data.get("author") ?? ""),
      });
      setError("");
      form.reset();
      form.closest("dialog")?.close();
      router.push(postHref(post));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "게시글을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  const defaultCategory = section === "predictions" ? "경기토론" : "잡담";
  return <dialog ref={ref} className={`${styles.reportDialog} ${styles.writeDialog}`} aria-label="게시글 작성">
    <form onSubmit={submit}>
      <div className={styles.writeDialogHeading}><h2>글쓰기</h2><button type="button" aria-label="글쓰기 닫기" onClick={event => event.currentTarget.closest("dialog")?.close()}>×</button></div>
      {!member && <label>작성자<input name="author" maxLength={20} placeholder="작성자 이름" required /></label>}
      {section !== "free" && <label>팀<select name="teamCode" defaultValue={teamCode} required={section === "teams"}>
        {section === "predictions" && <option value="">전체 팀</option>}
        {section === "teams" && !teamCode && <option value="">팀 선택</option>}
        {teamBoards.map(team => <option value={team.code} key={team.code}>{team.name}</option>)}
      </select></label>}
      <label>말머리<select name="category" defaultValue={defaultCategory}>{communityPostCategories.map(category => <option value={category} key={category}>{category}</option>)}</select></label>
      <label>제목<input name="title" minLength={2} maxLength={100} placeholder="제목을 입력해 주세요." required /></label>
      <label>본문<textarea name="content" maxLength={10000} placeholder="야구 이야기를 나눠보세요." required /></label>
      {error && <p role="alert" className={styles.writeError}>{error}</p>}
      <p className={styles.localSaveNote}>현재 이 브라우저에 임시 저장되며, 새로고침해도 유지됩니다.</p>
      <div className={styles.writeDialogActions}><button type="button" onClick={event => event.currentTarget.closest("dialog")?.close()}>취소</button><button type="submit" disabled={saving}>{saving ? "저장 중" : "등록"}</button></div>
    </form>
  </dialog>;
});
