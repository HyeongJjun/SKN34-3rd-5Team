"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePreviewMember } from "@/lib/member-preview";
import { AdminSectionNav } from "@/components/admin-section-nav";
import styles from "./page.module.css";

type Member = { id: number; username: string; is_active: boolean; is_staff: boolean; is_superuser: boolean; date_joined: string };
type Result = { user: Member; members: { count: number; results: Member[] } };
const role = (user: Member) => user.is_superuser ? "마스터 관리자" : user.is_staff ? "운영 관리자" : "일반 회원";
const previewUser: Member = { id: 1, username: "master1", is_active: true, is_staff: true, is_superuser: true, date_joined: "2026-09-14T00:00:00Z" };
const previewMembers: Member[] = [
  previewUser,
  ...Array.from({ length: 5 }, (_, index) => ({
    id: index + 2,
    username: `test${index + 1}`,
    is_active: true,
    is_staff: false,
    is_superuser: false,
    date_joined: "2026-09-14T00:00:00Z",
  })),
];

export default function AdminPage() {
  const previewMember = usePreviewMember();
  const preview = previewMember?.mode === "preview";
  const [data, setData] = useState<Result | null>(null);
  const [localMembers, setLocalMembers] = useState(previewMembers);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(""); setData(null);
      if (preview) {
        const normalized = query.toLowerCase();
        const filtered = localMembers.filter(member => !normalized || String(member.id).includes(normalized) || member.username.toLowerCase().includes(normalized));
        const start = (page - 1) * 20;
        setData({ user: previewUser, members: { count: filtered.length, results: filtered.slice(start, start + 20) } });
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`/admin-api?${new URLSearchParams({ q: query, page: String(page) })}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "회원 목록을 불러오지 못했어요.");
        if (!Array.isArray(body.members?.results)) throw new Error("회원 목록 응답을 확인하지 못했어요.");
        setData({ ...body, members: { ...body.members, results: [...body.members.results].sort((a: Member, b: Member) => a.id - b.id) } });
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "연결에 실패했어요."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [query, page, reload, preview, localMembers]);
  async function changeRole(member: Member) {
    if (busy) return;
    const action = member.is_staff ? "회수" : "부여";
    if (!window.confirm(`${member.username} 회원의 운영 관리자 권한을 ${action}하시겠어요?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (preview) {
        setLocalMembers(current => current.map(item => item.id === member.id ? { ...item, is_staff: !item.is_staff } : item));
        setNotice(`${member.username} 회원의 운영 관리자 권한을 ${action}했어요. 미리보기 화면에만 반영됐어요.`);
        return;
      }
      const response = await fetch("/admin-api", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: member.id, is_staff: !member.is_staff }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "권한을 변경하지 못했어요.");
      setNotice(`${member.username} 회원의 운영 관리자 권한을 ${action}했어요.`);
      setReload(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "권한 변경에 실패했어요."); setData(null); }
    finally { setBusy(false); }
  }
  return <main className={`container ${styles.page}`}>
    <p className="eyebrow">ADMIN</p><h1>회원 관리</h1>
    <p className={styles.intro}>회원 정보를 확인하고 운영 관리자 권한을 관리하세요.</p>
    <AdminSectionNav active="members" />
    {loading && <p role="status">관리자 권한을 확인하고 있어요.</p>}
    {error && <div className={styles.feedback} role="alert"><p>{error}</p><Link href="/login?next=admin">관리자 계정으로 로그인</Link><button type="button" onClick={() => setReload(value => value + 1)}>다시 확인</button></div>}
    {notice && <p role="status" className={styles.feedback}>{notice}</p>}
    {data && <>
      <div className={styles.identity}><strong>{data.user.username}</strong><span>{role(data.user)}</span><span>전체 회원 {data.members.count}명</span>{preview && <span>화면 미리보기</span>}</div>
      <form className={styles.search} onSubmit={event => { event.preventDefault(); setQuery(String(new FormData(event.currentTarget).get("q") ?? "").trim()); setPage(1); }}>
        <input name="q" aria-label="회원 검색" placeholder="회원 번호 또는 아이디" maxLength={150} defaultValue={query} /><button disabled={busy} type="submit">검색</button>
      </form>
      <div className={styles.tableScroll}><table><caption className="sr-only">회원 목록과 관리자 권한</caption><thead><tr>{["회원 번호", "아이디", "권한", "상태", "가입일", "권한 관리"].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{data.members.results.map(member => <tr key={member.id}><td>{member.id}</td><td>{member.username}</td><td>{role(member)}</td><td>{member.is_active ? "활성" : "비활성"}</td><td>{member.date_joined.slice(0, 10)}</td><td>{data.user.is_superuser && member.id !== data.user.id && !member.is_superuser && member.is_active ? <button type="button" disabled={busy} onClick={() => void changeRole(member)}>{member.is_staff ? "관리자 권한 회수" : "관리자 권한 부여"}</button> : "—"}</td></tr>)}
        {!data.members.results.length && <tr><td colSpan={6}>검색 결과가 없어요.</td></tr>}</tbody></table></div>
      <nav className={styles.pages} aria-label="회원 목록 페이지"><button disabled={page === 1 || busy} onClick={() => setPage(value => value - 1)}>이전</button><span>{page} / {Math.max(1, Math.ceil(data.members.count / 20))}</span><button disabled={page * 20 >= data.members.count || busy} onClick={() => setPage(value => value + 1)}>다음</button></nav>
      <p className={styles.intro}>운영 관리자는 회원을 조회할 수 있으며, 권한 부여·회수는 마스터 관리자만 할 수 있어요.</p>
    </>}
  </main>;
}
