"use client";

import { useRef, useState } from "react";
import { createCommunityReport } from "@/lib/community-reports";
import styles from "./community-board.module.css";

const labels: Record<string, string> = { spam: "광고·도배", abuse: "욕설·비방", inappropriate: "부적절한 내용", privacy: "개인정보 노출", other: "기타" };

export function PostReportButton({ postId, postNumber, board, title, reporter }: { postId: string; postNumber: string; board: string; title: string; reporter: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  return <div className={styles.reportActions}>
    <button type="button" className={styles.reportButton} onClick={() => dialog.current?.showModal()}><span aria-hidden="true">🚨</span> 신고</button>
    <dialog ref={dialog} className={styles.reportDialog} aria-label="게시글 신고">
      <form onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const category = labels[String(data.get("category"))] ?? labels.other;
        try {
          createCommunityReport({ postId, postNumber, board, title, reporter, category, details: reason.trim() });
          setReason(""); setMessage("신고를 접수했어요."); dialog.current?.close();
        } catch { setMessage("신고를 저장하지 못했어요. 다시 시도해 주세요."); }
      }}>
        <h2>게시글 신고</h2>
        <p>게시글 번호 {postNumber}</p>
        <label>신고 사유<select name="category" defaultValue="spam"><option value="spam">광고·도배</option><option value="abuse">욕설·비방</option><option value="inappropriate">부적절한 내용</option><option value="privacy">개인정보 노출</option><option value="other">기타</option></select></label>
        <label className={styles.reportReason}>상세 사유<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={50} rows={3} placeholder="신고 사유를 50자 이내로 입력해 주세요." aria-describedby="report-reason-count" /></label>
        <span id="report-reason-count" className={styles.reportReasonCount}>{reason.length}/50자</span>
        <button type="submit">신고 접수</button><button type="button" onClick={() => dialog.current?.close()}>취소</button>
      </form>
    </dialog>
    {message && <p role="status">{message}</p>}
  </div>;
}
