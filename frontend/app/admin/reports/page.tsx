"use client";

import { useMemo, useState } from "react";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { updateCommunityReportStatus, useCommunityReports, type ReportStatus } from "@/lib/community-reports";
import styles from "../page.module.css";

export default function AdminReportsPage() {
  const reports = useCommunityReports();
  const [filter, setFilter] = useState<"전체" | ReportStatus>("전체");
  const [notice, setNotice] = useState("");
  const visible = useMemo(() => reports.filter(report => filter === "전체" || report.status === filter), [reports, filter]);
  function decide(id: number, status: Exclude<ReportStatus, "대기">) {
    try {
      updateCommunityReportStatus(id, status);
      setNotice(`${id}번 신고를 ${status === "기각" ? "기각" : "처리 완료"} 상태로 변경했어요.`);
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "신고 상태를 변경하지 못했어요."); }
  }
  return <main className={`container ${styles.page}`}>
    <p className="eyebrow">ADMIN</p><h1>신고 목록 관리</h1>
    <p className={styles.intro}>실제로 접수된 게시글 신고를 확인하고 처리 상태를 관리하세요.</p>
    <AdminSectionNav active="reports" />
    <div className={styles.summaryGrid}>
      <button type="button" className={styles.summaryCard} aria-pressed={filter === "대기"} onClick={() => setFilter("대기")}><span>처리 대기</span><strong>{reports.filter(report => report.status === "대기").length}</strong></button>
      <button type="button" className={styles.summaryCard} aria-pressed={filter === "처리 완료"} onClick={() => setFilter("처리 완료")}><span>처리 완료</span><strong>{reports.filter(report => report.status === "처리 완료").length}</strong></button>
      <button type="button" className={styles.summaryCard} aria-pressed={filter === "기각"} onClick={() => setFilter("기각")}><span>기각</span><strong>{reports.filter(report => report.status === "기각").length}</strong></button>
    </div>
    {notice && <p role="status" className={styles.feedback}>{notice}</p>}
    <div className={styles.filterBar} role="group" aria-label="신고 처리 상태 필터">{(["전체", "대기", "처리 완료", "기각"] as const).map(item => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <div className={styles.tableScroll}><table><caption className="sr-only">실제로 접수된 신고 목록</caption><thead><tr>{["신고 번호", "게시판", "게시글 번호", "신고 대상", "신고자", "사유", "접수일", "상태", "처리"].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{visible.map(report => <tr key={report.id}><td>{report.id}</td><td>{report.board}</td><td>{report.postNumber}</td><td className={styles.titleCell}>{report.title}</td><td>{report.reporter}</td><td>{report.details || report.category}</td><td>{new Date(report.reportedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td><td><span className={`${styles.badge} ${report.status === "대기" ? styles.badgeWaiting : report.status === "처리 완료" ? styles.badgeActive : styles.badgeMuted}`}>{report.status}</span></td><td>{report.status === "대기" ? <div className={styles.rowActions}><button type="button" onClick={() => decide(report.id, "처리 완료")}>처리</button><button type="button" onClick={() => decide(report.id, "기각")}>기각</button></div> : "—"}</td></tr>)}
      {!visible.length && <tr><td colSpan={9}>{reports.length ? "해당 상태의 신고가 없어요." : "현재 접수된 신고가 없어요."}</td></tr>}</tbody></table></div>
  </main>;
}
