"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { AuthDialog } from "@/components/auth-dialog";
import { useAuthHydrated } from "@/components/auth-hydration";

type LoginErrors = { username?: string; password?: string };

export default function LoginPage() {
  const hydrated = useAuthHydrated();
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [visible, setVisible] = useState(false);
  const [help, setHelp] = useState<"id" | "password" | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const nextErrors: LoginErrors = {};
    if (!String(fields.get("username") ?? "").trim()) nextErrors.username = "아이디를 입력해 주세요.";
    if (!String(fields.get("password") ?? "")) nextErrors.password = "비밀번호를 입력해 주세요.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage("");
      form.querySelector<HTMLInputElement>(nextErrors.username ? "#login-id" : "#login-password")?.focus();
      return;
    }
    setMessage("아직 로그인 서비스를 연결하지 않았어요. 입력한 정보는 전송하거나 저장하지 않았어요.");
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration" aria-hidden="true"><span /><span /><span /></div>
      <section className="auth-panel" aria-labelledby="login-title">
        <Link href="/" className="auth-wordmark" aria-label="KBO ROUTE 홈으로">KBO<span>ROUTE</span></Link>
        <p className="eyebrow">WELCOME BACK</p>
        <h1 id="login-title">로그인</h1>
        <p className="auth-description">나만의 직관 코스, 이어서 만들어 볼까요?</p>
        {message && <p ref={feedbackRef} tabIndex={-1} className="auth-feedback auth-feedback-top" role="alert">{message}</p>}
        <button className="auth-kakao" type="button" onClick={() => setMessage("카카오 로그인 연결을 준비하고 있어요. 연결 후 카카오 계정으로 시작할 수 있어요.")}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 3C6.48 3 2 6.4 2 10.6c0 2.7 1.84 5.07 4.62 6.42L5.44 21l4.62-2.91c.63.08 1.28.12 1.94.12 5.52 0 10-3.4 10-7.61S17.52 3 12 3Z" /></svg>
          카카오로 시작하기
        </button>
        <div className="auth-divider"><span>또는 아이디로 로그인</span></div>
        <form onSubmit={submit} method="post" className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="login-id">아이디</label>
            <input id="login-id" name="username" autoComplete="username" placeholder="아이디를 입력해 주세요" required disabled={!hydrated} maxLength={40} aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? "login-id-error" : undefined} onChange={() => { setErrors((current) => ({ ...current, username: undefined })); setMessage(""); }} />
            {errors.username && <p className="auth-error" id="login-id-error">{errors.username}</p>}
          </div>
          <div className="auth-field">
            <label htmlFor="login-password">비밀번호</label>
            <div className="auth-password">
              <input id="login-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" placeholder="비밀번호를 입력해 주세요" required disabled={!hydrated} maxLength={128} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "login-password-error" : undefined} onChange={() => { setErrors((current) => ({ ...current, password: undefined })); setMessage(""); }} />
              <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"} aria-pressed={visible}>{visible ? "숨기기" : "보기"}</button>
            </div>
            {errors.password && <p className="auth-error" id="login-password-error">{errors.password}</p>}
          </div>
          <button className="button button-primary auth-submit" type="submit" disabled={!hydrated}>로그인</button>
        </form>
        <nav className="auth-help-links" aria-label="계정 도움말">
          <button type="button" onClick={() => setHelp("id")}>아이디 찾기</button>
          <button type="button" onClick={() => setHelp("password")}>비밀번호 찾기</button>
          <Link href="/signup">회원가입</Link>
        </nav>
        <p className="auth-service-note auth-bottom-note">회원 서비스 연결 전 미리보기 화면이에요.</p>
        <Link href="/routes" className="auth-browse">먼저 직관 코스 둘러보기 <span aria-hidden="true">↗</span></Link>
      </section>
      <AuthDialog open={help !== null} title={help === "password" ? "비밀번호 찾기" : "아이디 찾기"} onClose={() => setHelp(null)}>
        <p>계정 찾기 서비스를 준비하고 있어요.</p>
        <p>회원 서비스가 연결되면 가입할 때 등록한 이메일로 본인 확인을 진행할 수 있어요. 현재는 인증 메일을 발송하지 않아요.</p>
      </AuthDialog>
    </main>
  );
}
