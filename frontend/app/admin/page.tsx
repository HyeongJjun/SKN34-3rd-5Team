"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMemberUser, listAdminMembers, updateAdminRole, type AdminMember, type MemberUser } from "@/lib/api/auth";
import type { Page } from "@/lib/api/types";
import { memberRoleLabel } from "@/lib/member-policy";
import styles from "./page.module.css";

type Result = { user: MemberUser; members: Page<AdminMember> };

export default function AdminPage() {
  const [data, setData] = useState<Result | null>(null);
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
      try {
        const params = new URLSearchParams({ q: query, page: String(page) });
        const [user, members] = await Promise.all([getMemberUser(controller.signal), listAdminMembers(params, controller.signal)]);
        if (!user || !members) throw new Error("회원 목록 응답을 확인하지 못했어요.");
        setData({ user, members });
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "연결에 실패했어요."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [query, page, reload]);
  async function changeRole(member: AdminMember) {
    if (busy) return;
    const action = member.is_staff ? "회수" : "부여";
    if (!window.confirm(`${member.username} 회원의 운영 관리자 권한을 ${action}하시겠어요?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await updateAdminRole(member.id, { is_staff: !member.is_staff });
      setNotice(`${member.username} 회원의 운영 관리자 권한을 ${action}했어요.`);
      setReload(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "권한 변경에 실패했어요."); setData(null); }
    finally { setBusy(false); }
  }
  return <main className={`container ${styles.page}`}>
    <p className="eyebrow">ADMIN</p><h1>회원 관리</h1>
    <p className={styles.intro}>회원 정보를 확인하고 운영 관리자 권한을 관리하세요. <Link href="/admin/baseball">야구 데이터 관리 →</Link></p>
    {loading && <p role="status">관리자 권한을 확인하고 있어요.</p>}
    {error && <div className={styles.feedback} role="alert"><p>{error}</p><Link href="/login?next=admin">관리자 계정으로 로그인</Link><button type="button" onClick={() => setReload(value => value + 1)}>다시 확인</button></div>}
    {notice && <p role="status" className={styles.feedback}>{notice}</p>}
    {data && <>
      <div className={styles.identity}><strong>{data.user.username}</strong><span>{memberRoleLabel(data.user)}</span><span>전체 회원 {data.members.count}명</span></div>
      <form className={styles.search} onSubmit={event => { event.preventDefault(); setQuery(String(new FormData(event.currentTarget).get("q") ?? "").trim()); setPage(1); }}>
        <input name="q" aria-label="회원 검색" placeholder="회원 번호 또는 아이디" maxLength={150} defaultValue={query} /><button disabled={busy} type="submit">검색</button>
      </form>
      <div className={styles.tableScroll}><table><caption className="sr-only">회원 목록과 관리자 권한</caption><thead><tr>{["회원 번호", "아이디", "권한", "상태", "가입일", "권한 관리"].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{data.members.results.map(member => <tr key={member.id}><td>{member.id}</td><td>{member.username}</td><td>{memberRoleLabel(member)}</td><td>{member.is_active ? "활성" : "비활성"}</td><td>{member.date_joined.slice(0, 10)}</td><td>{data.user.is_superuser && member.id !== data.user.id && !member.is_superuser && member.is_active ? <button type="button" disabled={busy} onClick={() => void changeRole(member)}>{member.is_staff ? "관리자 권한 회수" : "관리자 권한 부여"}</button> : "—"}</td></tr>)}
        {!data.members.results.length && <tr><td colSpan={6}>검색 결과가 없어요.</td></tr>}</tbody></table></div>
      <nav className={styles.pages} aria-label="회원 목록 페이지"><button disabled={page === 1 || busy} onClick={() => setPage(value => value - 1)}>이전</button><span>{page} / {Math.max(1, Math.ceil(data.members.count / 20))}</span><button disabled={page * 20 >= data.members.count || busy} onClick={() => setPage(value => value + 1)}>다음</button></nav>
      <p className={styles.intro}>운영 관리자는 회원을 조회할 수 있으며, 권한 부여·회수는 마스터 관리자만 할 수 있어요.</p>
    </>}
  </main>;
}
