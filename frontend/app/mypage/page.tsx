"use client";
import Link from "next/link";
import { MemberPosts } from "@/components/member-posts";
import Image from "next/image";
import { MemberAccountSettings, PasswordChangeButton } from "@/components/member-account-settings";
import { ProfilePhotoEditor } from "@/components/profile-photo-editor";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { saveMemberSettings } from "@/lib/member-settings";
import { usePreviewMember, updatePreviewProfile } from "@/lib/member-preview";
import { useRoutes, useLikedRoutes, useRoutesReady } from "@/lib/routes";
import { teamBoards } from "@/lib/team-community";
import { MEMBER_LEVELS, nextNicknameChangeAt } from "@/lib/member-policy";
import { RouteCard } from "@/components/route-card";
import styles from "./page.module.css";

function MyPageContent() {
  const member = usePreviewMember();
  const ready = useRoutesReady();
  const routes = useRoutes();
  const likes = useLikedRoutes();
  const router = useRouter();
  const search = useSearchParams();
  const selectedTab = search.get("tab");
  const tab = selectedTab === "likes" || selectedTab === "profile" || selectedTab === "posts" ? selectedTab : "courses";
  const setTab = (value: string) => router.push(`/mypage?tab=${value}`, { scroll: false });
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const own = routes.filter(route => !route.isSample);
  const liked = routes.filter(route => likes.includes(route.id));
  if (!ready) return <main className={`container ${styles.page}`}><p role="status">회원 화면을 불러오고 있어요.</p></main>;
  if (!member) return <main className={`container ${styles.page}`}><h1>마이페이지</h1><p className={styles.note}>일반 회원 미리보기 로그인 후 이용할 수 있어요.</p><Link className="button button-primary" href="/login">로그인</Link></main>;
  const nextChange = nextNicknameChangeAt(member.nicknameChangedAt);
  const nicknameLocked = Boolean(nextChange && now < Date.parse(nextChange));
  const level = MEMBER_LEVELS[member.level];
  const team = teamBoards.find(item => item.code === member.teamCode);
  const visible = tab === "likes" ? liked : own;
  return <main className={`container ${styles.page}`}>
    <p className="eyebrow">MY PAGE</p><h1>마이페이지</h1>
    <section className={styles.profile} aria-label="내 프로필"><div className={styles.avatarWrap}><div className={styles.avatar} aria-hidden="true">{member.avatar ? <Image src={member.avatar} alt="" width={60} height={60} unoptimized /> : <Image src="/images/default-avatar.svg" alt="" width={60} height={60} />}</div>{team && <span className={styles.teamBadge} title={team.name}><Image src={`/images/teams/${team.code.toLowerCase()}.svg`} alt={`응원팀 ${team.name}`} width={22} height={22} /></span>}</div><div><h2 className={styles.memberName}>{member.nickname}님<span className={styles.memberRank}><Image className={styles.levelBadge} src={level.image} alt={`회원 등급 ${level.label}`} title={`회원 등급 ${level.label}`} width={30} height={30} /><span className={styles.memberPoints}>{member.points}pt</span></span></h2><p>일반 회원 · {team?.name ?? "응원팀 미설정"}</p></div><Link href="/routes/new" className="button button-primary">코스 만들기</Link></section>
    <p className={styles.note}>일반 회원 미리보기 · 프로필과 코스는 이 브라우저에만 저장돼요.</p>
    <nav className={styles.tabs} aria-label="마이페이지 메뉴">
      <button type="button" aria-pressed={tab === "courses"} onClick={() => setTab("courses")}>내 코스 <b>{own.length}</b></button>
      <button type="button" aria-pressed={tab === "likes"} onClick={() => setTab("likes")}>찜한 코스 <b>{liked.length}</b></button>
      <button type="button" aria-pressed={tab === "posts"} onClick={() => setTab("posts")}>내가 쓴 글</button>
      <button type="button" aria-pressed={tab === "profile"} onClick={() => setTab("profile")}>회원 정보</button>
    </nav>
    {tab === "posts" ? <MemberPosts /> : tab === "profile" ? <section className={styles.settings}><h2>회원정보 수정</h2><ProfilePhotoEditor avatar={member.avatar} /><form key={`${member.nickname}:${member.teamCode}`} onSubmit={event => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      try { updatePreviewProfile(String(values.get("nickname") ?? ""), String(values.get("teamCode") ?? "")); saveMemberSettings({ email: String(values.get("email") ?? "").trim(), notifications: { comments: values.has("notify-comments"), courses: values.has("notify-courses"), announcements: values.has("notify-announcements") }, visibility: { courses: values.has("public-courses"), posts: values.has("public-posts"), likes: values.has("public-likes") } }); setMessage("변경사항을 이 브라우저에 저장했어요."); }
      catch (cause) { setMessage(cause instanceof Error ? cause.message : "저장하지 못했어요."); }
    }}><label>닉네임<input className={styles.nicknameInput} name="nickname" defaultValue={member.nickname} maxLength={12} pattern="[A-Za-z가-힣]{1,12}" title="한글·영문만 1~12자" required readOnly={nicknameLocked} aria-describedby="nickname-rule" /></label><p id="nickname-rule" className={styles.nicknameRule}>{nicknameLocked && nextChange ? `다음 변경 가능: ${new Date(nextChange).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : "한글·영문만 최대 12자. 변경 후 6개월 동안 다시 바꿀 수 없어요."}</p><PasswordChangeButton /><MemberAccountSettings /><label>응원팀<select name="teamCode" defaultValue={member.teamCode}><option value="">선택 안 함</option>{teamBoards.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><button className="button button-primary" type="submit">변경사항 저장</button>{message && <p role="status">{message}</p>}</form></section> : <section aria-label={tab === "likes" ? "찜한 코스" : "내 코스"}>
      {visible.length ? <div className={styles.grid}>{visible.map(route => <div key={route.id}><RouteCard route={route} />{tab === "courses" && <div className={styles.actions}><Link href={`/routes/new?edit=${encodeURIComponent(route.id)}`}>수정하기</Link><Link href={`/routes/${encodeURIComponent(route.id)}`}>상세 보기</Link></div>}</div>)}</div> : <div className={styles.empty}><h2>{tab === "likes" ? "아직 찜한 코스가 없어요" : "아직 저장한 코스가 없어요"}</h2><p>{tab === "likes" ? "마음에 드는 코스에 좋아요를 눌러보세요." : "지도에서 장소를 골라 첫 코스를 만들어보세요."}</p><Link className="button button-primary" href={tab === "likes" ? "/routes" : "/routes/new"}>{tab === "likes" ? "코스 둘러보기" : "코스 만들기"}</Link></div>}
    </section>}
  </main>;
}

export default function MyPage() { return <Suspense fallback={<main className="container"><p>회원 화면을 불러오고 있어요.</p></main>}><MyPageContent /></Suspense>; }
