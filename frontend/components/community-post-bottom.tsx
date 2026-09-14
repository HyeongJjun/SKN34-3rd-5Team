"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CommunityPostEditor } from "./community-post-editor";
import { commentsForPost, createCommunityComment, deleteCommunityPost, useCommunityContent, type CommunityBoardSection } from "@/lib/community-store";
import { usePreviewMember } from "@/lib/member-preview";
import { getTeamBoard, getTeamBoardHref, type TeamCommunityPost } from "@/lib/team-community";
import styles from "./community-board.module.css";

export function CommunityPostBottom({ post, posts, teamCode, section }: { post: TeamCommunityPost; posts: TeamCommunityPost[]; teamCode?: string; section: CommunityBoardSection }) {
  const postHref = (item: TeamCommunityPost) => {
    if (section === "free") return `/community?post=${encodeURIComponent(item.id)}`;
    if (section === "teams") return getTeamBoardHref(item.teamCode, item.id);
    const params = new URLSearchParams({ post: item.id });
    if (item.teamCode) params.set("team", item.teamCode);
    return `/community/predictions?${params.toString()}`;
  };
  const router = useRouter();
  const member = usePreviewMember();
  const community = useCommunityContent();
  const writer = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [order, setOrder] = useState("oldest");
  const [deleteReady, setDeleteReady] = useState(false);
  const index = posts.findIndex(item => item.id === post.id);
  const next = index >= 0 ? posts[index + 1] : undefined;
  const previous = index > 0 ? posts[index - 1] : undefined;
  const comments = commentsForPost(community.comments, post.id).sort((a, b) => order === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  const listHref = section === "free" ? "/community" : section === "teams" ? getTeamBoardHref(teamCode) : `/community/predictions${teamCode ? `?team=${encodeURIComponent(teamCode)}` : ""}`;
  return <>
    <section className={styles.authorProfile} aria-label="작성자 프로필">
      <Image src="/images/default-avatar.svg" width="56" height="56" alt="작성자 기본 프로필" />
      <div><strong>{post.author}</strong><p>{section !== "free" && post.teamCode && <>{getTeamBoard(post.teamCode)?.shortName} · </>}작성자</p></div>
    </section>
    <section className={styles.comments} aria-label="댓글">
      <header><h3>댓글 <b>{comments.length}</b></h3><div><button type="button" aria-pressed={order === "oldest"} onClick={() => setOrder("oldest")}>등록순</button><button type="button" aria-pressed={order === "newest"} onClick={() => setOrder("newest")}>최신순</button><button type="button" onClick={() => setMessage("저장된 댓글을 확인했어요.")}>↻ 새로고침</button></div></header>
      {comments.length ? <ul className={styles.commentList}>{comments.map(comment => <li key={comment.id}><Image src="/images/default-avatar.svg" width="36" height="36" alt="" /><div><p><strong>{comment.author}</strong><time dateTime={comment.createdAt}>{new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(comment.createdAt))}</time></p><div>{comment.content}</div></div></li>)}</ul> : <p className={styles.commentsEmpty}>아직 등록된 댓글이 없어요.</p>}
      <form className={styles.commentForm} onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        try {
          createCommunityComment({ postId: post.id, authorId: member?.id ?? null, author: member?.nickname ?? String(data.get("author") ?? ""), content: String(data.get("content") ?? "") });
          form.reset();
          setMessage("댓글을 등록했어요.");
        } catch (caught) { setMessage(caught instanceof Error ? caught.message : "댓글을 저장하지 못했어요."); }
      }}>
        {!member && <input name="author" aria-label="댓글 작성자" placeholder="작성자" maxLength={20} required />}
        <textarea name="content" aria-label="댓글 내용" placeholder="댓글을 입력해 주세요." maxLength={2000} required />
        <button type="submit">등록</button>
      </form>
      {message && <p role="status" className={styles.bottomNote}>{message}</p>}
    </section>
    <nav className={styles.articleNavigation} aria-label="게시글 이동">
      <div><Link href={listHref}>목록</Link>{next ? <Link href={postHref(next)}>다음글</Link> : <button disabled>다음글</button>}{previous ? <Link href={postHref(previous)}>이전글</Link> : <button disabled>이전글</button>}</div>
      <div>{!post.isSample && <button type="button" onClick={() => {
        if (!deleteReady) { setDeleteReady(true); setMessage("한 번 더 누르면 이 브라우저에서 글과 댓글이 삭제됩니다."); return; }
        try { deleteCommunityPost(post.id); router.replace(listHref); }
        catch (caught) { setMessage(caught instanceof Error ? caught.message : "임시 글을 삭제하지 못했어요."); }
      }}>{deleteReady ? "삭제 확인" : "임시 글 삭제"}</button>}<button type="button" className={styles.writeButton} onClick={() => writer.current?.showModal()}>글쓰기</button><button type="button" onClick={() => router.back()}>이전페이지</button><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>맨위로 ↑</button></div>
    </nav>
    <CommunityPostEditor ref={writer} section={section} teamCode={teamCode} />
  </>;
}
