"use client";

import Link from "next/link";
import { useState } from "react";

// Source: data/preprocessed/stadium_coordinates.csv. Keep names and coordinates in sync.
const stadiums = [
  { code: "JAMSIL", name: "잠실야구장", region: "서울", address: "서울특별시 송파구 올림픽로 25", lng: 127.075940589715, lat: 37.5161987797456, color: "blue" },
  { code: "GOCHEOK", name: "고척스카이돔", region: "서울", address: "서울특별시 구로구 경인로 430", lng: 126.867088741096, lat: 37.4982125677913, color: "violet" },
  { code: "MUNHAK", name: "인천 SSG 랜더스필드", region: "인천·경기", address: "인천광역시 미추홀구 매소홀로 618", lng: 126.690759830613, lat: 37.4350819826381, color: "rose" },
  { code: "SUWON", name: "수원 KT 위즈 파크", region: "인천·경기", address: "경기도 수원시 장안구 경수대로 893", lng: 127.011348102567, lat: 37.2978428909635, color: "blue" },
  { code: "DAEJEON", name: "대전 한화생명 볼파크", region: "대전·광주", address: "대전광역시 중구 대종로 373", lng: 127.428013823451, lat: 36.3173370007388, color: "orange" },
  { code: "DAEGU", name: "대구 삼성 라이온즈 파크", region: "대구·부산·창원", address: "대구광역시 수성구 야구전설로 1", lng: 128.681236372268, lat: 35.8411289243023, color: "blue" },
  { code: "GWANGJU", name: "광주-KIA 챔피언스 필드", region: "대전·광주", address: "전남광주통합특별시 북구 서림로 10", lng: 126.888805470329, lat: 35.1694249627659, color: "rose" },
  { code: "SAJIK", name: "사직야구장", region: "대구·부산·창원", address: "부산광역시 동래구 사직로 45", lng: 129.059900885997, lat: 35.194366802896, color: "orange" },
  { code: "CHANGWON", name: "창원 NC 파크", region: "대구·부산·창원", address: "경상남도 창원시 마산회원구 삼호로 63", lng: 128.579580117268, lat: 35.2219848625101, color: "green" },
];
const regions = ["전체", "서울", "인천·경기", "대전·광주", "대구·부산·창원"];

function StadiumIllustration({ dome }: { dome: boolean }) {
  return <svg viewBox="0 0 360 190" className="info-stadium-illustration" aria-hidden="true">
    <circle cx="283" cy="44" r="24" fill="currentColor" opacity=".1" />
    <path d="M35 157H327" stroke="currentColor" opacity=".13" strokeWidth="2" />
    <path d="M48 88V143M310 88V143" stroke="currentColor" opacity=".4" strokeWidth="4" />
    <rect x="32" y="76" width="33" height="13" rx="3" fill="currentColor" opacity=".4" /><rect x="294" y="76" width="33" height="13" rx="3" fill="currentColor" opacity=".4" />
    {dome ? <path d="M70 116C70 22 290 22 290 116" fill="currentColor" opacity=".16" stroke="currentColor" strokeWidth="3" /> : <path d="M74 98Q180 21 286 98L270 131H91Z" fill="currentColor" opacity=".18" />}
    <ellipse cx="180" cy="120" rx="113" ry="37" fill="white" />
    <ellipse cx="180" cy="118" rx="101" ry="30" fill="currentColor" opacity=".2" />
    <ellipse cx="180" cy="121" rx="76" ry="22" fill="#83bca9" opacity=".65" />
    <path d="M180 139L148 120L180 100L212 120Z" fill="#e5ccb2" stroke="white" strokeWidth="2" /><path d="M180 136L159 122L180 108L201 122Z" fill="#8eba9b" />
    <path d="M67 121V139C67 187 293 187 293 139V121C293 169 67 169 67 121Z" fill="currentColor" opacity=".23" />
    <path d="M67 133C84 175 282 175 293 133" stroke="currentColor" fill="none" opacity=".3" />
    <path d="M101 148V160M128 155V167M156 158V170M185 159V171M214 157V169M243 152V165M271 143V156" stroke="white" opacity=".65" strokeWidth="3" />
    <path d="M180 63V35L199 42L180 49" stroke="currentColor" fill="currentColor" strokeWidth="2" opacity=".6" />
  </svg>;
}

export default function StadiumsPage() {
  const [region, setRegion] = useState("전체");
  const [query, setQuery] = useState("");
  const filtered = stadiums.filter((stadium) => (region === "전체" || stadium.region === region) && `${stadium.name} ${stadium.address}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <main className="info-page">
      <section className="info-hero">
        <div className="container page-intro"><p className="eyebrow">FIND YOUR BALLPARK</p><h1>어느 구장으로 떠나볼까요?</h1><p>처음 가는 구장도, 늘 가던 구장도.<br className="info-mobile-break" /> 나만의 직관 코스를 시작해 보세요.</p></div>
      </section>
      <section className="container info-section" aria-label="구장 찾기">
        <div className="info-filter-bar">
          <div className="info-region-tabs" aria-label="지역별 구장 필터">{regions.map((item) => <button key={item} type="button" className={region === item ? "info-chip is-active" : "info-chip"} aria-pressed={region === item} onClick={() => setRegion(item)}>{item}</button>)}</div>
          <div className="info-search"><svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.8" /></svg><label htmlFor="stadium-search" className="sr-only">구장명 또는 지역 검색</label><input id="stadium-search" placeholder="구장명, 지역으로 검색" value={query} onChange={(event) => setQuery(event.target.value)} type="search" /></div>
        </div>
        <p className="info-count" role="status">총 <strong>{filtered.length}</strong>개의 구장</p>
        <div className="info-stadium-grid">{filtered.map((stadium) => <article key={stadium.code} className="info-stadium-card">
          <div className={`info-stadium-art info-art-${stadium.color}`}><span className="info-region-badge">{stadium.region === "인천·경기" ? stadium.code === "MUNHAK" ? "인천" : "수원" : stadium.region === "대전·광주" ? stadium.code === "DAEJEON" ? "대전" : "광주" : stadium.region === "대구·부산·창원" ? stadium.code === "DAEGU" ? "대구" : stadium.code === "SAJIK" ? "부산" : "창원" : "서울"}</span><StadiumIllustration dome={stadium.code === "GOCHEOK"} /></div>
          <div className="info-stadium-body"><p className="info-stadium-code">{stadium.code} BALLPARK</p><h2>{stadium.name}</h2><p className="info-address">{stadium.address}</p><div className="info-stadium-actions"><Link href={`/routes/new?stadium=${encodeURIComponent(stadium.name)}`} className="info-create-link">이 구장으로 코스 만들기 <span aria-hidden="true">→</span></Link><a href={`https://map.kakao.com/link/map/${encodeURIComponent(stadium.name)},${stadium.lat},${stadium.lng}`} target="_blank" rel="noopener noreferrer" className="info-map-link" aria-label={`${stadium.name} 카카오맵에서 보기 (새 창)`}>지도 ↗</a></div></div>
        </article>)}</div>
        {filtered.length === 0 && <div className="info-empty"><h2>찾으시는 구장이 없어요</h2><p>다른 구장 이름이나 지역으로 검색해 보세요.</p><button className="button button-secondary" type="button" onClick={() => { setQuery(""); setRegion("전체"); }}>전체 구장 보기</button></div>}
        <p className="info-data-note">구장 위치는 프로젝트에 수집된 주소·좌표를 기준으로 표시해요. 방문 전 출입구와 운영 안내는 구단 공식 공지를 확인해 주세요.</p>
      </section>
      <section className="container info-help-banner"><div><p className="eyebrow">FIRST TIME?</p><h2>첫 직관, 무엇부터 준비할까요?</h2><p>야구의 기본부터 구장 방문 체크리스트까지.</p></div><Link href="/guide" className="button button-secondary">직관 가이드 보기 <span aria-hidden="true">→</span></Link></section>
    </main>
  );
}
