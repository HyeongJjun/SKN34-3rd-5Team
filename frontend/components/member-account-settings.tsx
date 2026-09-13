"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addMemberNotice, saveMemberSettings, useMemberSettings } from "@/lib/member-settings";
import styles from "@/app/mypage/page.module.css";

export function MemberAccountSettings() {
  const settings = useMemberSettings();
  return <div className={styles.accountSettings}>
      <EmailChangeButton email={settings.email} />
      <input type="hidden" name="email" value={settings.email} />
      <fieldset><legend>내 활동 공개 범위</legend>
        <label><input type="checkbox" name="public-courses" defaultChecked={settings.visibility.courses} />내 코스 공개</label>
        <label><input type="checkbox" name="public-posts" defaultChecked={settings.visibility.posts} />내 글·댓글 활동 목록 공개</label>
        <label><input type="checkbox" name="public-likes" defaultChecked={settings.visibility.likes} />좋아요, 추천 목록 공개</label>
      </fieldset>
      <fieldset><legend>알림 설정</legend>
        <label><input type="checkbox" name="notify-comments" defaultChecked={settings.notifications.comments} />내 글의 댓글·답글</label>
        <label><input type="checkbox" name="notify-courses" defaultChecked={settings.notifications.courses} />내 코스의 반응</label>
        <label><input type="checkbox" name="notify-announcements" defaultChecked={settings.notifications.announcements} />공지·회원 소식</label>
      </fieldset>

  </div>;
}

export function PasswordChangeButton() {
  const [open, setOpen] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);
  return <>
    <div className={styles.passwordRow}><span>비밀번호</span><button type="button" className="button button-secondary" onClick={() => { setPasswordMessage(""); setOpen(true); }}>변경</button></div>
    {open && createPortal(<dialog ref={dialog} className={`auth-dialog ${styles.passwordDialog}`} onCancel={event => { if (busy) event.preventDefault(); else setOpen(false); }} onClose={() => { if (!busy) setOpen(false); }} aria-labelledby="password-dialog-title">
      <div className="auth-dialog-heading"><h2 id="password-dialog-title">비밀번호 변경</h2><button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label="비밀번호 변경 닫기">×</button></div>
    <form onSubmit={async event => {
      event.preventDefault(); event.stopPropagation(); if (busy) return;
      const form = event.currentTarget, values = new FormData(form);
      const currentPassword = String(values.get("currentPassword") ?? ""), newPassword = String(values.get("newPassword") ?? "");
      if (newPassword !== values.get("confirmPassword")) { setPasswordMessage("새 비밀번호 확인이 일치하지 않아요."); return; }
      setBusy(true); setPasswordMessage("");
      try {
        const response = await fetch("/member-preview-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "비밀번호를 변경하지 못했어요.");
        form.reset(); setPasswordMessage("비밀번호를 변경했어요. 다음 로그인부터 새 비밀번호를 사용해 주세요.");
        try { addMemberNotice("announcements", "개발용 계정의 비밀번호가 변경되었어요."); } catch { /* Password change already succeeded; notification storage is independent. */ }
      } catch (error) { setPasswordMessage(error instanceof Error ? error.message : "비밀번호를 변경하지 못했어요."); }
      finally { setBusy(false); }
    }}>
      <label>현재 비밀번호<input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required disabled={busy} /></label>
      <label>새 비밀번호<input name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} /></label>
      <label>새 비밀번호 확인<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} /></label>
      <p className={styles.settingNote}>영문·숫자·특수문자를 포함한 8~128자, 공백 제외. 현재 개발용 계정에 적용돼요.</p>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "변경 중…" : "변경 완료"}</button>{passwordMessage && <p role="status">{passwordMessage}</p>}
    </form>
    </dialog>, document.body)}
  </>;
}

function EmailChangeButton({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const settings = useMemberSettings();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); }, [open]);
  async function submit(action: "send" | "verify") {
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim())) { setMessage("새 이메일 주소를 확인해 주세요."); return; }
    if (action === "verify" && (!requestId || !/^\d{6}$/.test(code))) { setMessage("메일로 받은 6자리 인증 코드를 입력해 주세요."); return; }
    setBusy(true); setMessage("");
    if (action === "send") { setRequestId(null); setCode(""); }
    try {
      const response = await fetch("/member-email-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, email: address.trim(), ...(action === "verify" ? { requestId, code } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "이메일 인증을 진행하지 못했어요.");
      if (action === "send") {
        if (typeof result.requestId !== "string" || !result.requestId) throw new Error("인증 요청을 확인하지 못했어요.");
        setRequestId(result.requestId); setMessage("새 이메일로 인증 코드를 보냈어요. 받은 코드를 입력해 주세요.");
      } else {
        if (result.verified !== true || result.email !== address.trim()) throw new Error("이메일 인증 결과를 확인하지 못했어요.");
        saveMemberSettings({ ...settings, email: result.email });
        setOpen(false);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "이메일 인증을 진행하지 못했어요."); }
    finally { setBusy(false); }
  }
  return <>
    <div className={styles.passwordRow}><span>이메일{email && <small className={styles.emailValue}>{email}</small>}</span><button type="button" className="button button-secondary" onClick={() => { setMessage(""); setAddress(""); setCode(""); setRequestId(null); setOpen(true); }}>변경</button></div>
    {open && createPortal(<dialog ref={dialog} className={`auth-dialog ${styles.passwordDialog}`} onCancel={event => { if (busy) event.preventDefault(); else setOpen(false); }} onClose={() => { if (!busy) setOpen(false); }} aria-labelledby="email-dialog-title">
      <div className="auth-dialog-heading"><h2 id="email-dialog-title">이메일 변경</h2><button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label="이메일 변경 닫기">×</button></div>
      <form onSubmit={event => { event.preventDefault(); event.stopPropagation(); void submit(requestId ? "verify" : "send"); }}>
        <label>새 이메일 주소<input name="newEmail" type="email" required maxLength={254} autoComplete="email" placeholder="이메일 주소를 입력해 주세요" value={address} disabled={busy} onChange={event => { setAddress(event.target.value); setRequestId(null); setCode(""); setMessage(""); }} /></label>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void submit("send")}>{requestId ? "인증 코드 다시 받기" : "인증 코드 받기"}</button>
        <label>인증 코드<input name="verificationCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="메일로 받은 6자리 코드" value={code} disabled={busy || !requestId} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, ""))} /></label>
        <p className={styles.settingNote}>변경할 이메일로 받은 코드를 확인해야 이메일이 변경돼요.</p>
        <button type="submit" className="button button-primary" disabled={busy || !requestId || code.length !== 6}>{busy ? "처리 중…" : "인증하고 이메일 변경"}</button>
        {message && <p role="status">{message}</p>}
      </form>
    </dialog>, document.body)}
  </>;
}
