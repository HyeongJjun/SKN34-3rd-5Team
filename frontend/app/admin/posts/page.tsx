"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { useHiddenPostIds, togglePostHidden } from "@/lib/admin-post-visibility";
import { useCommunityReports } from "@/lib/community-reports";
import { getFreeBoardPosts } from "@/lib/free-community-examples";
import { useCommunityContent } from "@/lib/community-store";
import { routeContentToText } from "@/lib/route-content";
import { ensureLocalRouteNumber } from "@/lib/route-number";
import { useRoutes, useRoutesReady } from "@/lib/routes";
import { getTeamBoardHref, getTeamBoardPosts, teamBoards } from "@/lib/team-community";
import styles from "../page.module.css";

type SearchField = "title" | "author" | "title-content";
type Visibility = "all" | "hidden";
type ManagedPost = { id: string; number: string; boardKey: string; board: string; title: string; content: string; author: string; createdAt: string | null; hidden: boolean; href: string };

const boardOptions = [
  { value: "all", label: "전체 게시판" },
  { value: "routes", label: "직관 루트 공유" },
  { value: "free", label: "자유 게시판" },
  { value: "predictions", label: "승부 예측" },
  ...teamBoards.map(team => ({ value: `team-${team.code}`, label: `${team.shortName} 팀 게시판` })),
];
const initialFilters = { number: "", board: "all", field: "title-content" as SearchField, query: "" };

export default function AdminPostsPage() {
  const routes = useRoutes();
  const ready = useRoutesReady();
  const hiddenIds = useHiddenPostIds();
  const reports = useCommunityReports();
  const community = useCommunityContent();
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState(initialFilters);
  const [draft, setDraft] = useState(initialFilters);
  const [visibility, setVisibility] = useState<Visibility>("all");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all(routes.map(async route => [route.id, route.routeNumber ?? await ensureLocalRouteNumber(route.id)] as const))
      .then(entries => { if (active) setNumbers(Object.fromEntries(entries)); })
      .catch(() => { if (active) setNumbers({}); });
    return () => { active = false; };
  }, [routes]);

  const posts = useMemo<ManagedPost[]>(() => {
    const routePosts = routes.map(route => ({
      id: route.id, number: numbers[route.id] ?? route.routeNumber ?? "번호 준비 중", boardKey: "routes", board: "직관 루트 공유",
      title: route.title, content: routeContentToText(route.content, route.contentFormat), author: route.author, createdAt: route.createdAt,
      hidden: hiddenIds.includes(route.id), href: `/routes/${encodeURIComponent(route.id)}`,
    }));
    const freePosts = getFreeBoardPosts().map(post => ({
      id: post.id, number: post.postNumber, boardKey: "free", board: "자유 게시판", title: post.title, content: post.content,
      author: post.author, createdAt: post.createdAt, hidden: hiddenIds.includes(post.id), href: `/community?post=${encodeURIComponent(post.id)}`,
    }));
    const teamPosts = teamBoards.flatMap(team => getTeamBoardPosts(team.code).map(post => ({
      id: post.id, number: post.postNumber, boardKey: `team-${team.code}`, board: `${team.shortName} 팀 게시판`, title: post.title, content: post.content,
      author: post.author, createdAt: post.createdAt, hidden: hiddenIds.includes(post.id), href: getTeamBoardHref(team.code, post.id),
    })));
    const localPosts = community.posts.map(post => {
      const boardKey = post.board === "teams" ? `team-${post.teamCode}` : post.board;
      const board = post.board === "teams" ? `${teamBoards.find(team => team.code === post.teamCode)?.shortName ?? post.teamCode} 팀 게시판` : post.board === "predictions" ? "승부 예측" : "자유 게시판";
      const params = new URLSearchParams({ post: post.id });
      if (post.teamCode) params.set("team", post.teamCode);
      const href = post.board === "free" ? `/community?post=${encodeURIComponent(post.id)}` : post.board === "teams" ? getTeamBoardHref(post.teamCode, post.id) : `/community/predictions?${params.toString()}`;
      return { id: post.id, number: post.postNumber, boardKey, board, title: post.title, content: post.content, author: post.author, createdAt: post.createdAt, hidden: hiddenIds.includes(post.id), href };
    });
    return [...routePosts, ...localPosts, ...freePosts, ...teamPosts].sort((a, b) => Number(b.number) - Number(a.number) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [routes, numbers, hiddenIds, community.posts]);

  const reportedPostCount = new Set(reports.map(report => report.postId)).size;
  const visible = useMemo(() => posts.filter(post => {
    if (visibility === "hidden" && !post.hidden) return false;
    if (filters.number && !post.number.replace(/^0+/, "").includes(filters.number.replace(/^0+/, ""))) return false;
    if (filters.board !== "all" && post.boardKey !== filters.board) return false;
    const query = filters.query.trim().toLocaleLowerCase("ko-KR");
    if (!query) return true;
    const target = filters.field === "author" ? post.author : filters.field === "title" ? post.title : `${post.title} ${post.content}`;
    return target.toLocaleLowerCase("ko-KR").includes(query);
  }), [posts, filters, visibility]);

  function search(event: FormEvent) { event.preventDefault(); setFilters({ ...draft, number: draft.number.replace(/\D/g, "") }); }
  function show(next: Visibility) { setVisibility(next); setFilters(initialFilters); setDraft(initialFilters); setNotice(""); }
  function toggle(post: ManagedPost) {
    try {
      togglePostHidden(post.id);
      setNotice(`${post.number}번 게시글을 ${post.hidden ? "복구" : "숨김"} 처리했어요.`);
    } catch { setNotice("게시글 상태를 저장하지 못했어요."); }
  }

  return <main className={`container ${styles.page}`}>
    <p className="eyebrow">ADMIN</p><h1>게시글 관리</h1>
    <p className={styles.intro}>현재 사이트의 각 게시판에 등록되어 있는 글을 검색하고 공개 상태를 관리하세요.</p>
    <AdminSectionNav active="posts" />
    <div className={styles.summaryGrid}>
      <button type="button" className={styles.summaryCard} aria-pressed={visibility === "all"} onClick={() => show("all")}><span>전체 게시글</span><strong>{posts.length}</strong></button>
      <Link className={styles.summaryCard} href="/admin/reports"><span>신고된 게시글</span><strong>{reportedPostCount}</strong></Link>
      <button type="button" className={styles.summaryCard} aria-pressed={visibility === "hidden"} onClick={() => show("hidden")}><span>숨김 처리</span><strong>{posts.filter(post => post.hidden).length}</strong></button>
    </div>
    {notice && <p role="status" className={styles.feedback}>{notice}</p>}
    <form className={styles.postSearch} onSubmit={search}>
      <label><span>게시글 번호</span><input value={draft.number} onChange={event => setDraft(current => ({ ...current, number: event.target.value.replace(/\D/g, "") }))} inputMode="numeric" aria-label="게시글 번호" placeholder="번호" maxLength={6} /></label>
      <label><span>게시판</span><select value={draft.board} onChange={event => setDraft(current => ({ ...current, board: event.target.value }))}>{boardOptions.map(board => <option value={board.value} key={board.value}>{board.label}</option>)}</select></label>
      <label><span>검색 범위</span><select value={draft.field} onChange={event => setDraft(current => ({ ...current, field: event.target.value as SearchField }))}><option value="title">제목</option><option value="author">작성자</option><option value="title-content">제목+본문</option></select></label>
      <label className={styles.postSearchKeyword}><span>검색어</span><input value={draft.query} onChange={event => setDraft(current => ({ ...current, query: event.target.value }))} aria-label="게시글 검색어" placeholder="검색어를 입력하세요" maxLength={100} /></label>
      <button type="submit">검색</button>
    </form>
    {!ready ? <p role="status">게시판 글을 불러오고 있어요.</p> : <div className={styles.tableScroll}><table><caption className="sr-only">현재 사이트 게시판의 게시글 목록</caption><thead><tr>{["번호", "게시판", "제목", "작성자", "작성일", "상태", "관리"].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{visible.map(post => <tr key={`${post.boardKey}:${post.id}`}><td>{post.number}</td><td>{post.board}</td><td className={styles.titleCell}><Link href={post.href}>{post.title}</Link></td><td>{post.author}</td><td>{post.createdAt ? new Date(post.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "—"}</td><td><span className={`${styles.badge} ${post.hidden ? styles.badgeMuted : styles.badgeActive}`}>{post.hidden ? "숨김" : "공개"}</span></td><td><button type="button" onClick={() => toggle(post)}>{post.hidden ? "복구" : "숨김"}</button></td></tr>)}
      {!visible.length && <tr><td colSpan={7}>검색 조건에 맞는 게시글이 없어요.</td></tr>}</tbody></table></div>}
  </main>;
}
