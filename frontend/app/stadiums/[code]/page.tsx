"use client";

import Image from "next/image";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { StadiumParkingMapDialog } from "@/components/stadium-parking-map-dialog";
import { adaptStadium } from "@/lib/baseball/adapters";
import { BaseballApiError, fetchBaseballStadium, fetchStadiumSection, fetchTicketPolicies } from "@/lib/baseball/client";
import type { BaseballStadium, Facility, FoodStore, Page, SeatMap, SeatView, SeatZone, StadiumContent, TicketPolicy, TicketPrice, Transport } from "@/lib/baseball/types";
import { getStadiumMapUrl, type Stadium } from "@/lib/stadiums";

type SectionName = "seat-zones" | "ticket-prices" | "ticket-policies" | "seat-maps" | "seat-views" | "food-stores" | "transports" | "facilities" | "contents";
type SectionRow = SeatZone | TicketPrice | TicketPolicy | SeatMap | SeatView | FoodStore | Transport | Facility | StadiumContent;
const sections: { path: SectionName; label: string; scoped: boolean }[] = [
  { path: "seat-zones", label: "좌석 구역", scoped: true }, { path: "ticket-prices", label: "티켓 가격", scoped: true },
  { path: "ticket-policies", label: "예매 정책 스냅샷", scoped: true },
  { path: "seat-maps", label: "공식 좌석도", scoped: true }, { path: "seat-views", label: "좌석 시야", scoped: true },
  { path: "food-stores", label: "공식 매점", scoped: false }, { path: "transports", label: "교통·주차", scoped: false },
  { path: "facilities", label: "편의시설", scoped: false }, { path: "contents", label: "부가 콘텐츠", scoped: false },
];
const shown = (value: string | null | undefined, fallback = "미표기") => value?.trim() || fallback;
const shownBoolean = (value: boolean | null, yes: string, no: string) => value == null ? "미표기" : value ? yes : no;
const safeUrl = (value: string) => /^https?:\/\//i.test(value) ? value : null;

function Row({ section, row }: { section: SectionName; row: SectionRow }) {
  if (section === "ticket-prices") {
    const item = row as TicketPrice;
    return <><strong>{shown(item.seat_zone_name)} ({shown(item.seat_zone_code)}) · {Number(item.price_krw).toLocaleString("ko-KR")}원</strong><span>등급 {shown(item.price_tier)} · 원문 요일 코드 {shown(item.day_type)} · 대상 {shown(item.customer_type)}{item.group_size != null ? ` · ${item.group_size}인` : ""}<br />적용 {shown(item.valid_from)} ~ {shown(item.valid_to)} · 조건 {shown(item.discount_condition, "없음")}</span></>;
  }
  if (section === "ticket-policies") {
    const item = row as TicketPolicy;
    return <><strong>{shown(item.policy_type)} · {shown(item.subtype)}</strong><span>오픈 {shown(item.open_at)} · 최대 {item.max_tickets ?? "미표기"}매<br />채널 {shown(item.booking_channel)} · 원문 조건 {shown(item.channel_condition)} · 수집 {item.collected_at.slice(0, 10)}</span></>;
  }
  if (section === "seat-zones") {
    const item = row as SeatZone;
    return <><strong>{shown(item.zone_name_ko)}</strong><span>{shown(item.level)} · {shown(item.side)} · {shown(item.seat_type)}{item.group_size != null ? ` · ${item.group_size}인` : ""} · 휠체어석 {shownBoolean(item.accessible, "있음", "없음")}</span></>;
  }
  if (section === "seat-maps") {
    const item = row as SeatMap, page = safeUrl(item.page_url);
    return <><strong>{shown(item.map_title)}</strong>{page && <a href={page} target="_blank" rel="noopener noreferrer"> 공식 안내 ↗</a>}{item.assets.map(asset => { const url = safeUrl(asset.asset_url); return url && <a key={asset.id} href={url} target="_blank" rel="noopener noreferrer"> {shown(asset.asset_role, "좌석도 이미지")} {asset.asset_no} ↗</a>; })}</>;
  }
  if (section === "seat-views") {
    const item = row as SeatView;
    return <><strong>{shown(item.view_characteristic)}</strong><span>지붕 {shown(item.roof_coverage)} · 근거 범위 {shown(item.evidence_scope)}</span></>;
  }
  if (section === "food-stores") {
    const item = row as FoodStore;
    return <><strong>{shown(item.store_facility)}</strong><span>위치 {item.locations.map(location => `${shown(location.floor)} ${shown(location.zone_location)}`).join(", ") || "미표기"}<br />공식 메뉴 분류 {item.menus.map(menu => menu.menu_category_official).join(", ") || "미표기"} · 등록 위치 {item.location_qty ?? item.locations.length}곳</span></>;
  }
  if (section === "transports") {
    const item = row as Transport;
    return <><strong>{shown(item.title)} · {shown(item.mode)}</strong><span>{shown(item.details)}{item.parking_spaces != null ? ` · 주차 ${item.parking_spaces.toLocaleString("ko-KR")}면` : ""} · 예약 {shownBoolean(item.reservation_required, "필요", "불필요")}</span></>;
  }
  if (section === "facilities") {
    const item = row as Facility;
    return <><strong>{shown(item.facility_type)}</strong><span>{[item.floor, item.side, item.nearby_section, item.gate, item.gender, item.indoor_outdoor, item.location_detail].map(value => shown(value, "")).filter(Boolean).join(" · ") || "위치 미표기"}</span></>;
  }
  const item = row as StadiumContent;
  return <><strong>{shown(item.name)} · {shown(item.content_type)}</strong><span>{[item.floor, item.location, item.official_description, item.operating_condition].map(value => shown(value, "")).filter(Boolean).join(" · ") || "상세 미표기"}</span></>;
}

function StadiumSection({ code, section, label, context, team, scoped }: { code: string; section: SectionName; label: string; context?: number; team?: number; scoped: boolean }) {
  const [page, setPage] = useState<Page<SectionRow> | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || page || (scoped && !(section === "ticket-policies" ? team : context))) return;
    const controller = new AbortController();
    const request = section === "ticket-policies" ? fetchTicketPolicies(team!, 1, controller.signal) : fetchStadiumSection<SectionRow>(code, section, 1, context, controller.signal);
    request.then(setPage).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "불러오지 못했어요."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, attempt, code, context, page, scoped, section, team]);
  async function more() {
    if (!page) return;
    setLoading(true); setError("");
    try {
      const nextPage = pageNumber + 1;
      const next = section === "ticket-policies" ? await fetchTicketPolicies(team!, nextPage) : await fetchStadiumSection<SectionRow>(code, section, nextPage, context);
      setPage({ ...next, results: [...page.results, ...next.results] }); setPageNumber(nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "더 불러오지 못했어요."); }
    finally { setLoading(false); }
  }
  return <details onToggle={event => { const open = event.currentTarget.open; setActive(open); if (open && !page && !(scoped && !context)) setLoading(true); }}><summary>{label} ({page?.count ?? "열어서 조회"})</summary>
    {active && scoped && !(section === "ticket-policies" ? team : context) && <p>먼저 시즌·홈팀을 선택해 주세요.</p>}
    {active && loading && !page && <p role="status">{label}을 불러오고 있어요.</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => { setPage(null); setError(""); setLoading(true); setAttempt(value => value + 1); }}>다시 시도</button></p>}
    {page && (page.results.length ? <ul>{page.results.map(row => <li key={row.id}><Row section={section} row={row} /></li>)}</ul> : <p>선택한 시즌·홈팀에 적재된 정보가 없어요.</p>)}
    {page && page.results.length < page.count && <button type="button" disabled={loading} onClick={() => void more()}>{loading ? "불러오는 중" : `더 보기 (${page.results.length}/${page.count})`}</button>}
  </details>;
}

export default function StadiumPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [source, setSource] = useState<BaseballStadium | null>(null);
  const [stadium, setStadium] = useState<Stadium | null>(null);
  const [context, setContext] = useState<number>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchBaseballStadium(code, controller.signal).then(item => {
      const adapted = adaptStadium(item);
      if (!adapted) throw new BaseballApiError("구장 좌표가 올바르지 않아 지도와 코스를 표시할 수 없어요.");
      const contexts = [...item.home_teams].sort((a, b) => b.season - a.season || a.name.localeCompare(b.name, "ko"));
      setSource({ ...item, home_teams: contexts }); setStadium(adapted); setContext(contexts.at(0)?.id);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof BaseballApiError ? cause.message : "구장 정보를 불러오지 못했어요."); });
    return () => controller.abort();
  }, [attempt, code]);
  if (error) return <main className="container writer-empty" role="alert"><h1>구장 정보를 표시할 수 없어요</h1><p>{error}</p><button type="button" onClick={() => { setError(""); setSource(null); setStadium(null); setAttempt(value => value + 1); }}>다시 시도</button> <Link href="/stadiums">전체 구장 보기</Link></main>;
  if (!stadium || !source) return <main className="container writer-empty"><p role="status">DB에서 구장 상세 정보를 불러오고 있어요.</p></main>;
  const selectedTeam = source.home_teams.find(item => item.id === context)?.team_id;

  return <main className="info-page stadium-detail-page">
    <section className="info-hero"><div className="container page-intro stadium-detail-intro"><Link className="stadium-detail-back" href="/stadiums">← 전체 구장 보기</Link><p className="eyebrow">YOUR NEXT BALLPARK</p><h1>{stadium.name}</h1><p>{stadium.teams.length ? `${stadium.teams.join(" · ")}의 홈구장` : "홈팀 정보 미적재"} · 수집 {source.collected_at.slice(0, 10)}</p></div></section>
    <section className="container stadium-detail-content" aria-labelledby="stadium-info-heading">
      <a className={`stadium-detail-art stadium-seat-art stadium-seat-art-${stadium.code.toLowerCase()}`} href={stadium.seatingMap.src} target="_blank" rel="noopener noreferrer" aria-label={`${stadium.name} 전체 좌석 안내도 원본 크게 보기 (새 창)`}><Image className={`stadium-detail-seat-map stadium-detail-seat-map-${stadium.code.toLowerCase()}`} src={stadium.seatingMap.src} alt={`${stadium.name} 전체 좌석 안내도`} fill sizes="(max-width: 760px) 100vw, 46vw" priority /><span className="stadium-detail-art-label">{stadium.code} SEATING MAP</span><span className="stadium-seat-zoom">원본 크게 보기 ↗</span></a>
      <div className="stadium-detail-info"><p className="eyebrow">BALLPARK INFORMATION</p><h2 id="stadium-info-heading">구장 정보</h2><dl className="stadium-detail-facts"><div><dt>홈팀</dt><dd>{stadium.teams.join(" · ") || "미적재"}</dd></div><div><dt>주소</dt><dd>{stadium.address}</dd></div><div><dt>운영</dt><dd>{source.game_operator || source.facility_manager || "미적재"}</dd></div><div><dt>연락처</dt><dd>{source.phone_general || source.phone_ticket || "미적재"}</dd></div><div><dt>주차</dt><dd><StadiumParkingMapDialog stadiumCode={stadium.code} className="stadium-detail-parking-trigger" /></dd></div><div><dt>좌석도</dt><dd>{stadium.seatingMap.sourceUrl ? <a className="stadium-official-seat-link" href={stadium.seatingMap.sourceUrl} target="_blank" rel="noopener noreferrer">구단 공식 안내에서 확인 ↗</a> : "공식 링크 미적재"}</dd></div><div><dt>구장 사진</dt><dd><a href={stadium.cardImage.creditUrl} target="_blank" rel="noopener noreferrer">{stadium.cardImage.credit} ↗</a></dd></div></dl><div className="stadium-detail-actions"><Link href={`/routes/new?stadium=${encodeURIComponent(stadium.name)}`} className="button button-primary">이 구장으로 코스 만들기 <Icon name="arrow" size={17} /></Link><a href={getStadiumMapUrl(stadium)} target="_blank" rel="noopener noreferrer" className="button button-secondary"><Icon name="pin" size={17} /> 카카오맵에서 보기 ↗</a></div></div>
    </section>
    <section className="container info-section" aria-label="구장 상세 수집 정보"><h2>수집된 구장 안내</h2><p className="info-data-note">각 항목은 저장소 수집 자료의 DB 적재 상태이며 실시간 정보가 아닙니다.</p>{source.home_teams.length > 0 ? <label>시즌·홈팀 <select value={context} onChange={event => setContext(Number(event.target.value))}>{source.home_teams.map(item => <option key={item.id} value={item.id}>{item.season} · {item.name}</option>)}</select></label> : <p role="status">시즌·홈팀 관계가 없어 좌석·가격·시야 정보는 조회할 수 없어요.</p>}{sections.map(item => <StadiumSection key={`${item.path}:${context}`} code={code} section={item.path} label={item.label} context={context} team={selectedTeam} scoped={item.scoped} />)}</section>
  </main>;
}
