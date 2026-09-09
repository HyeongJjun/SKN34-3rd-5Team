"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AuthDialog } from "@/components/auth-dialog";
import { useAuthHydrated } from "@/components/auth-hydration";
import { ResidentNumberInput } from "@/components/resident-number-input";

type FieldName = "username" | "password" | "passwordConfirm" | "name" | "residentFront" | "residentBack" | "email";
type SignupValues = Record<FieldName, string>;
type Agreement = "service" | "privacy" | "marketing";
const fieldOrder: FieldName[] = ["username", "password", "passwordConfirm", "name", "residentFront", "residentBack", "email"];
const fieldIds: Record<FieldName, string> = { username: "signup-id", password: "signup-password", passwordConfirm: "signup-password-confirm", name: "signup-name", residentFront: "signup-resident-front", residentBack: "signup-resident-back", email: "signup-email" };
const policyContent: Record<Agreement, { title: string; description: string }> = {
  service: { title: "서비스 이용약관", description: "정식 서비스의 이용 조건, 회원의 권리와 의무, 게시물 운영 기준이 이곳에 안내될 예정이에요." },
  privacy: { title: "개인정보 수집·이용 안내", description: "수집 항목, 이용 목적, 보유 기간과 동의 거부에 관한 내용을 정식 서비스 시작 전에 안내할 예정이에요." },
  marketing: { title: "마케팅 정보 수신 안내", description: "이벤트와 서비스 소식의 수신 여부를 선택하는 항목이에요. 동의하지 않아도 회원가입할 수 있어요. 구체적인 수신 채널과 철회 방법은 서비스 시작 전에 안내할 예정이에요." },
};

function validate(values: SignupValues): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  if (!/^[A-Za-z0-9]{4,20}$/.test(values.username)) errors.username = "영문과 숫자로 4~20자를 입력해 주세요.";
  if (values.password.length < 8 || !/[0-9]/.test(values.password) || !/[\p{P}\p{S}]/u.test(values.password)) errors.password = "숫자와 특수문자를 포함해 8자 이상 입력해 주세요.";
  if (!values.passwordConfirm) errors.passwordConfirm = "비밀번호를 한 번 더 입력해 주세요.";
  else if (values.passwordConfirm !== values.password) errors.passwordConfirm = "비밀번호가 서로 달라요. 다시 확인해 주세요.";
  if (!values.name.trim()) errors.name = "이름을 입력해 주세요.";
  if (!/^[0-9]{6}$/.test(values.residentFront)) errors.residentFront = "주민번호 앞자리 숫자 6개를 입력해 주세요.";
  if (!/^[0-9]{7}$/.test(values.residentBack)) errors.residentBack = "주민번호 뒷자리 숫자 7개를 입력해 주세요.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = "올바른 이메일 주소를 입력해 주세요.";
  return errors;
}

export default function SignupPage() {
  const hydrated = useAuthHydrated();
  const [values, setValues] = useState<SignupValues>({ username: "", password: "", passwordConfirm: "", name: "", residentFront: "", residentBack: "", email: "" });
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const [agreements, setAgreements] = useState({ service: false, privacy: false, marketing: false });
  const [policy, setPolicy] = useState<Agreement | null>(null);
  const allAgreementRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const errors = validate(values);
  const residentError = (touched.residentFront && errors.residentFront) || (touched.residentBack && errors.residentBack);
  const requiredAgreed = agreements.service && agreements.privacy;
  const allAgreed = requiredAgreed && agreements.marketing;
  const someAgreed = Object.values(agreements).some(Boolean);

  useEffect(() => {
    if (allAgreementRef.current) allAgreementRef.current.indeterminate = someAgreed && !allAgreed;
  }, [someAgreed, allAgreed]);

  function fieldProps(field: FieldName) {
    return {
      id: fieldIds[field],
      name: field,
      value: values[field],
      required: true,
      disabled: !hydrated,
      "aria-invalid": Boolean(touched[field] && errors[field]),
      "aria-describedby": `${fieldIds[field]}-hint`,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => { setValues((current) => ({ ...current, [field]: event.target.value })); setMessage(""); },
      onBlur: () => setTouched((current) => ({ ...current, [field]: true })),
    };
  }

  function hint(field: FieldName, text: string) {
    const error = touched[field] && errors[field];
    return <p id={`${fieldIds[field]}-hint`} className={error ? "auth-error" : "auth-field-hint"} aria-live="polite">{error || text}</p>;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ username: true, password: true, passwordConfirm: true, name: true, residentFront: true, residentBack: true, email: true });
    const firstInvalid = fieldOrder.find((field) => errors[field]);
    if (firstInvalid) {
      setMessage("");
      event.currentTarget.querySelector<HTMLInputElement>(`#${fieldIds[firstInvalid]}`)?.focus();
      return;
    }
    if (!requiredAgreed) return;
    setMessage("아직 회원가입 서비스를 연결하지 않았어요. 계정은 생성되지 않았으며, 입력 정보와 동의 내용도 전송하거나 저장하지 않았어요.");
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  return (
    <main className="auth-page auth-signup-page">
      <div className="auth-decoration" aria-hidden="true"><span /><span /><span /></div>
      <section className="auth-panel auth-signup-panel" aria-labelledby="signup-title">
        <p className="eyebrow">YOUR FIRST PITCH</p>
        <h1 id="signup-title">회원가입</h1>
        <p className="auth-description">좋아하는 야구에, 나만의 하루를 더해 보세요.</p>
        {message && <p ref={feedbackRef} tabIndex={-1} className="auth-feedback auth-feedback-top" role="alert">{message}</p>}
        <form onSubmit={submit} method="post" className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="signup-id">아이디 <span>필수</span></label>
            <input {...fieldProps("username")} autoComplete="username" placeholder="영문, 숫자 4~20자" minLength={4} maxLength={20} />
            {hint("username", "영문과 숫자를 사용할 수 있어요. 중복 여부는 가입 서비스 연결 후 확인해요.")}
          </div>
          <div className="auth-field">
            <label htmlFor="signup-password">비밀번호 <span>필수</span></label>
            <div className="auth-password">
              <input {...fieldProps("password")} type={visible ? "text" : "password"} autoComplete="new-password" placeholder="8자 이상 · 숫자·특수문자 포함" minLength={8} maxLength={128} />
              <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"} aria-pressed={visible}>{visible ? "숨기기" : "보기"}</button>
            </div>
            {hint("password", "숫자와 특수문자를 포함한 8~128자로 입력해 주세요.")}
          </div>
          <div className="auth-field">
            <label htmlFor="signup-password-confirm">비밀번호 확인 <span>필수</span></label>
            <input {...fieldProps("passwordConfirm")} type={visible ? "text" : "password"} autoComplete="new-password" placeholder="비밀번호를 한 번 더 입력해 주세요" maxLength={128} />
            {hint("passwordConfirm", "위에서 입력한 비밀번호를 한 번 더 입력해 주세요.")}
          </div>
          <div className="auth-field">
            <label htmlFor="signup-name">이름 <span>필수</span></label>
            <input {...fieldProps("name")} autoComplete="name" placeholder="이름" maxLength={40} />
            {hint("name", "사용할 이름을 입력해 주세요.")}
          </div>
          <div className="auth-field">
            <label htmlFor="signup-resident-front">주민등록번호 <span>필수</span></label>
            <ResidentNumberInput front={values.residentFront} back={values.residentBack} disabled={!hydrated} invalid={Boolean(residentError)} describedBy="signup-resident-hint" onChange={(residentFront, residentBack) => { setValues(current => ({ ...current, residentFront, residentBack })); setMessage(""); }} onBlur={() => setTouched(current => ({ ...current, residentFront: true, residentBack: true }))} />
            <p id="signup-resident-hint" className={residentError ? "auth-error" : "auth-field-hint"} aria-live="polite">{residentError || "뒷자리는 첫 숫자만 표시돼요."}</p>
          </div>
          <div className="auth-field">
            <label htmlFor="signup-email">이메일 <span>필수</span></label>
            <input {...fieldProps("email")} type="email" autoComplete="email" placeholder="hello@example.com" maxLength={254} />
            {hint("email", "계정 안내를 받을 이메일을 입력해 주세요.")}
          </div>
          <fieldset className="auth-agreements">
            <legend className="sr-only">정책 동의</legend>
            <label className="auth-check auth-check-all"><input ref={allAgreementRef} type="checkbox" checked={allAgreed} disabled={!hydrated} onChange={(event) => setAgreements({ service: event.target.checked, privacy: event.target.checked, marketing: event.target.checked })} /><span>전체 동의 <small>선택 항목 포함</small></span></label>
            {(["service", "privacy", "marketing"] as const).map((agreement) => (
              <div className="auth-agreement-item" key={agreement}>
                <label className="auth-check">
                  <input type="checkbox" required={agreement !== "marketing"} checked={agreements[agreement]} disabled={!hydrated} onChange={(event) => { setAgreements((current) => ({ ...current, [agreement]: event.target.checked })); setMessage(""); }} />
                  <span><b>{agreement === "marketing" ? "[선택]" : "[필수]"}</b> {agreement === "service" ? "서비스 이용약관 동의" : agreement === "privacy" ? "개인정보 수집·이용 동의" : "마케팅 정보 수신 동의"}</span>
                </label>
                <button type="button" className="auth-policy-link" onClick={() => setPolicy(agreement)} aria-label={`${policyContent[agreement].title} 보기`}>보기</button>
              </div>
            ))}
          </fieldset>
          <p className="auth-service-note">약관은 화면 확인용 초안이며, 현재 동의 내용은 기록하지 않아요.</p>
          <button className="button button-primary auth-submit" type="submit" disabled={!hydrated || !requiredAgreed} aria-describedby="signup-submit-hint">회원가입</button>
          <p id="signup-submit-hint" className="auth-submit-hint">{requiredAgreed ? "선택 항목에 동의하지 않아도 가입할 수 있어요." : "필수 약관 두 가지에 동의하면 가입 버튼이 활성화돼요."}</p>
        </form>
        <p className="auth-switch">이미 계정이 있으신가요? <Link href="/login">로그인</Link></p>
      </section>
      <AuthDialog open={policy !== null} title={policy ? policyContent[policy].title : "정책 안내"} onClose={() => setPolicy(null)}>
        <span className="auth-draft-label">화면 확인용 초안</span>
        <p>{policy && policyContent[policy].description}</p>
        <p>정식 약관은 서비스 시작 전에 제공돼요. 이 화면에서는 개인정보를 수집하거나 동의 내용을 저장하지 않아요.</p>
      </AuthDialog>
    </main>
  );
}
