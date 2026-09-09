"use client";

import Link from "next/link";
import { useState } from "react";
import { useChat } from "./chat-provider";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/types";
import { Baseball, Icon } from "./icons";
import { GameSchedule } from "./game-schedule";
import { RouteCard } from "./route-card";
import { RouteCardsSkeleton } from "./route-skeleton";
import { useLikedRoutes, useRoutes, useRoutesReady } from "@/lib/routes";

const stadiumLinks = [
  ["잠실", "잠실야구장", "서울 · LG / 두산"],
  ["고척", "고척스카이돔", "서울 · 키움"],
  ["인천", "SSG 랜더스필드", "인천 · SSG"],
  ["수원", "KT 위즈 파크", "수원 · KT"],
  ["대전", "한화생명 볼파크", "대전 · 한화"],
  ["대구", "삼성 라이온즈 파크", "대구 · 삼성"],
  ["광주", "KIA 챔피언스 필드", "광주 · KIA"],
  ["사직", "사직야구장", "부산 · 롯데"],
  ["창원", "NC 파크", "창원 · NC"],
];

const shortcuts = [
  { icon: "sparkles", title: "AI 루트 작성", caption: "내 취향대로, 가볍게", href: "/routes/new" },
  { icon: "route", title: "루트 둘러보기", caption: "다른 팬들의 하루", href: "/routes" },
  { icon: "stadium", title: "구장 정보", caption: "가기 전에 알아두기", href: "/stadiums" },
  { icon: "book", title: "야구 가이드", caption: "첫 직관도 자신 있게", href: "/guide" },
] as const;

export function HomePage() {
  const { openChat } = useChat();
  const [question, setQuestion] = useState("");
  const routes = useRoutes();
  const liked = useLikedRoutes();
  const ready = useRoutesReady();
  const popular = [...routes].sort((a, b) => (b.likes + Number(liked.includes(b.id))) - (a.likes + Number(liked.includes(a.id))) || b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  return (
    <main>
      <section className="home-hero" aria-labelledby="hero-heading">
        <Baseball className="hero-baseball" />
        <div className="container hero-content">
          <div className="hero-eyebrow"><span /> 경기 전부터, 경기 후까지</div>
          <h1 id="hero-heading">직관의 하루를, <span>나답게.</span></h1>
          <p className="hero-description">경기 전 맛집부터 경기 후 산책까지.<br />나만의 직관 루트를 만들고, 야구팬들과 함께 나눠보세요.</p>
          <div className="hero-search-row">
            <form className="hero-search" onSubmit={event => { event.preventDefault(); openChat(question); }}>
              <Icon name="search" size={24} />
              <label className="sr-only" htmlFor="hero-query">직관 도우미에게 질문하기</label>
              <input id="hero-query" name="q" value={question} onChange={event => setQuestion(event.target.value)} maxLength={MAX_MESSAGE_LENGTH} placeholder="어느 구장으로 떠나볼까요?" />
              <button type="submit" aria-label="직관 도우미에게 질문하기"><Icon name="arrow" size={22} /></button>
            </form>
          </div>
          <div className="hero-shortcuts">{shortcuts.map(shortcut => <Link href={shortcut.href} className="shortcut" key={shortcut.title}><span className="shortcut-icon"><Icon name={shortcut.icon} size={30} /></span><strong>{shortcut.title}</strong><small>{shortcut.caption}</small></Link>)}</div>
        </div>
      </section>
      <GameSchedule />
      <section className="container home-popular-section" aria-labelledby="popular-heading">
        <div className="section-heading"><div><span className="eyebrow">FAN FAVORITES</span><h2 id="popular-heading">함께 나누고 싶은 직관 루트</h2><p>경기 전후의 즐거움까지, 마음에 드는 하루를 골라보세요.</p></div><Link className="text-link" href="/routes">더보기 <Icon name="chevron" size={17} /></Link></div>
        <div className="home-popular-meta"><span>인기 루트</span><p>좋아요 순으로 모은 코스예요. 현재는 샘플과 이 기기에 저장한 코스가 표시돼요.</p></div>
        {!ready ? <RouteCardsSkeleton /> : <div className="route-grid home-popular-grid">{popular.map(route => <RouteCard key={route.id} route={route} />)}</div>}
      </section>
      <section className="home-stadium-section" aria-labelledby="stadium-heading"><div className="container">
        <div className="section-heading"><div><span className="eyebrow">CHOOSE YOUR BALLPARK</span><h2 id="stadium-heading">어느 구장으로 떠날까요?</h2><p>전국 9개 구장, 가고 싶은 곳의 코스를 만나보세요.</p></div><Link href="/stadiums" className="text-link">구장 정보 <Icon name="chevron" size={17} /></Link></div>
        <div className="home-stadium-grid">{stadiumLinks.map(([filter, name, caption]) => <Link href={`/routes?stadium=${encodeURIComponent(filter)}`} className="home-stadium-link" key={filter}><span className="home-stadium-icon"><Icon name="stadium" size={27} /></span><span><strong>{name}</strong><small>{caption}</small></span><Icon name="chevron" size={15} /></Link>)}</div>
      </div></section>
    </main>
  );
}
