"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import Editor from "@/components/editor";
import { RouteMap } from "@/components/route-map";
import { plainTextToHtml, routeContentToText, type RouteContentFormat } from "@/lib/route-content";
import { useChat } from "@/components/chat-provider";
import { areValidCoordinates, saveRoute, useRoutes, type RouteStop, type TripRoute } from "@/lib/routes";

// Coordinates come from data/preprocessed/stadium_coordinates.csv and external_places.csv.
const stadiums = [
  { code: "JAMSIL", name: "잠실야구장", lat: 37.51619878, lng: 127.07594059 },
  { code: "GOCHEOK", name: "고척스카이돔", lat: 37.49821257, lng: 126.86708874 },
  { code: "MUNHAK", name: "인천 SSG 랜더스필드", lat: 37.43508198, lng: 126.69075983 },
  { code: "SUWON", name: "수원 KT 위즈 파크", lat: 37.29784289, lng: 127.01134810 },
  { code: "DAEJEON", name: "대전 한화생명 볼파크", lat: 36.317337, lng: 127.42801382 },
  { code: "DAEGU", name: "대구 삼성 라이온즈 파크", lat: 35.84112892, lng: 128.68123637 },
  { code: "GWANGJU", name: "광주-KIA 챔피언스 필드", lat: 35.16942496, lng: 126.88880547 },
  { code: "SAJIK", name: "사직야구장", lat: 35.19436680, lng: 129.05990089 },
  { code: "CHANGWON", name: "창원 NC 파크", lat: 35.22198486, lng: 128.57958012 },
];

const cafes: Record<string, RouteStop> = {
  JAMSIL: { name: "사과나무카페", lat: 37.51215197, lng: 127.07529596, category: "카페" },
  GOCHEOK: { name: "디저트39 구로헤리움점", lat: 37.49956269, lng: 126.86459523, category: "카페" },
  MUNHAK: { name: "카페준메라", lat: 37.43504336, lng: 126.68977572, category: "카페" },
  SUWON: { name: "카페 퐁낭", lat: 37.29637908, lng: 127.01211639, category: "카페" },
  DAEJEON: { name: "샵커피집", lat: 36.31781300, lng: 127.42693170, category: "카페" },
  DAEGU: { name: "올제토커피", lat: 35.83853737, lng: 128.68268301, category: "카페" },
  GWANGJU: { name: "냥쿤하우스", lat: 35.17211721, lng: 126.88976869, category: "카페" },
  SAJIK: { name: "스타벅스 사직구장점", lat: 35.19616140, lng: 129.06159821, category: "카페" },
  CHANGWON: { name: "벨라케이크", lat: 35.21971225, lng: 128.57820260, category: "카페" },
};

const themes = ["첫 직관", "친구와 함께", "여유로운 하루"];
const tagOptions = ["첫 직관", "맛집", "카페", "친구와", "데이트", "가족과"];
const subscribeToHydration = () => () => {};

function WriterIcon({ kind }: { kind: "spark" | "pin" | "arrow" | "save" }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "spark" && <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z" /><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z" /></>}
      {kind === "pin" && <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>}
      {kind === "arrow" && <><path d="M5 12h14M13 6l6 6-6 6" /></>}
      {kind === "save" && <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z" /><path d="M7 3v6h10V3M7 21v-8h10v8" /></>}
    </svg>
  );
}

type WriterTab = "write" | "map" | "ai";
type Confirmation = { title: string; description: string; label: string; action: () => void };
const writerTabs: { id: WriterTab; label: string }[] = [{ id: "write", label: "작성" }, { id: "map", label: "지도" }, { id: "ai", label: "AI 도우미" }];
type WriterDraft = {
  stadiumCode: string;
  title: string;
  content: string;
  contentFormat: RouteContentFormat;
  duration: string;
  tags: string[];
  stops: RouteStop[];
  theme: string;
  tab: WriterTab;
  adding: boolean;
  customName: string;
  customLat: string;
  customLng: string;
  dirty: boolean;
};

// Client navigation can unmount the writer while the user asks the chatbot for help.
// Keep unfinished work in memory only; saving or explicitly discarding removes it.
const writerDrafts = new Map<string, WriterDraft>();

export default function RouteWriter({ editId, initialStadium }: { editId?: string; initialStadium?: string }) {
  const routes = useRoutes();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const existing = editId ? routes.find((route) => route.id === editId) : undefined;
  if (editId && !hydrated) return <main className="container writer-empty"><p role="status"><span className="writer-spinner" aria-hidden="true" />저장된 루트를 불러오고 있어요.</p></main>;
  if (editId && !existing) return <main className="container writer-empty"><span className="eyebrow">MY ROUTE</span><h1>저장된 루트를 찾을 수 없어요</h1><p>이 기기에 저장된 루트인지 확인하거나 새로운 루트를 만들어보세요.</p><Link href="/routes" className="button button-secondary">루트 목록으로</Link></main>;
  return <WriterForm key={existing?.id ?? initialStadium ?? "new"} existing={existing} initialStadium={initialStadium} />;
}

function WriterForm({ existing, initialStadium }: { existing?: TripRoute; initialStadium?: string }) {
  const router = useRouter();
  const { openChat } = useChat();
  const requested = (existing?.stadium ?? initialStadium ?? "").replace(/\s/g, "").toUpperCase();
  const initial = stadiums.find((stadium) => stadium.code === requested || (requested && stadium.name.replace(/\s/g, "").toUpperCase().includes(requested))) ?? stadiums[0];
  const draftKey = existing ? `edit:${existing.id}` : `new:${initial.code}`;
  const [restoredDraft] = useState(() => writerDrafts.get(draftKey));
  const [stadiumCode, setStadiumCode] = useState(restoredDraft?.stadiumCode ?? initial.code);
  const [title, setTitle] = useState(restoredDraft?.title ?? existing?.title ?? "");
  const [content, setContent] = useState(restoredDraft?.content ?? existing?.content ?? "");
  const [contentFormat, setContentFormat] = useState<RouteContentFormat>(restoredDraft ? restoredDraft.contentFormat : existing?.contentFormat);
  const [duration, setDuration] = useState(restoredDraft?.duration ?? existing?.duration ?? "반나절");
  const [tags, setTags] = useState<string[]>(restoredDraft?.tags ?? existing?.tags ?? ["첫 직관"]);
  const [stops, setStops] = useState<RouteStop[]>(restoredDraft?.stops ?? existing?.stops ?? [{ name: initial.name, lat: initial.lat, lng: initial.lng, category: "야구장" }]);
  const [theme, setTheme] = useState(restoredDraft?.theme ?? themes[0]);
  const [tab, setTab] = useState<WriterTab>(restoredDraft?.tab ?? "write");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(restoredDraft?.adding ?? false);
  const [customName, setCustomName] = useState(restoredDraft?.customName ?? "");
  const [customLat, setCustomLat] = useState(restoredDraft?.customLat ?? "");
  const [customLng, setCustomLng] = useState(restoredDraft?.customLng ?? "");
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const dirty = useRef(restoredDraft?.dirty ?? false);
  const savingRef = useRef(false);
  const dragIndex = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const current = stadiums.find((stadium) => stadium.code === stadiumCode)!;
  const cafe = cafes[stadiumCode];
  const plainContent = routeContentToText(content, contentFormat);
  const canSave = Boolean(title.trim() && plainContent.trim() && plainContent.length <= 12000 && stops.length);
  const sampleText = `${current.name}에서 보내는 ${theme === "첫 직관" ? "첫 직관의 하루" : theme === "친구와 함께" ? "친구와의 야구 나들이" : "여유로운 하루"}\n\n1. 경기 전 · ${cafe.name}\n${theme === "첫 직관" ? "커피 한 잔과 함께 티켓, 입장 게이트와 준비물을 확인해요." : theme === "친구와 함께" ? "친구와 만나 오늘 응원할 팀 이야기를 나눠요." : "조금 일찍 만나 여유롭게 하루를 시작해요."}\n\n2. 경기 관람 · ${current.name}\n입장 시간을 확인하고 여유 있게 구장에 도착해요. 함께 응원하며 오늘의 순간을 남겨보세요.\n\n방문 메모\n경기 일정, 카페 영업시간과 구장 이용 규정은 방문 전에 확인해 주세요.`;

  useEffect(() => {
    writerDrafts.set(draftKey, {
      stadiumCode, title, content, contentFormat, duration, tags, stops,
      theme, tab, adding, customName, customLat, customLng, dirty: dirty.current,
    });
  }, [draftKey, stadiumCode, title, content, contentFormat, duration, tags, stops, theme, tab, adding, customName, customLat, customLng]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    const protectLink = (event: MouseEvent) => {
      if (!dirty.current || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const next = new URL(anchor.href, window.location.href);
      if (next.origin === window.location.origin && next.pathname === window.location.pathname && next.search === window.location.search) return;
      if (next.origin === window.location.origin && next.pathname === "/chat") return;
      event.preventDefault(); event.stopPropagation();
      setConfirmation({ title: "작성 중인 루트가 있어요", description: "아직 저장하지 않은 내용이 있어요. 페이지를 나가면 작성한 내용이 사라져요.", label: "저장하지 않고 나가기", action: () => { writerDrafts.delete(draftKey); dirty.current = false; if (next.origin === window.location.origin) router.push(`${next.pathname}${next.search}${next.hash}`); else window.location.assign(next.href); } });
    };
    window.addEventListener("beforeunload", protect);
    document.addEventListener("click", protectLink, true);
    return () => { window.removeEventListener("beforeunload", protect); document.removeEventListener("click", protectLink, true); };
  }, [router, draftKey]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!confirmation || !dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); opener?.focus(); };
  }, [confirmation]);

  function markDirty() { dirty.current = true; setError(""); setMessage(""); }
  function changeStadium(code: string) {
    const next = stadiums.find((stadium) => stadium.code === code)!;
    const apply = () => { setStadiumCode(code); setStops([{ name: next.name, lat: next.lat, lng: next.lng, category: "야구장" }]); markDirty(); };
    if (stops.length > 1 || (stops.length === 1 && stops[0].name !== current.name)) {
      setConfirmation({ title: "방문할 구장을 바꿀까요?", description: "추가한 방문 장소가 새 구장 한 곳으로 바뀌어요. 루트 제목과 본문은 유지돼요.", label: "구장 변경", action: apply });
    } else apply();
  }
  function reorderStop(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= stops.length || to >= stops.length) return;
    const next = [...stops]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    setStops(next); markDirty(); setMessage(`${moved.name}을 ${to + 1}번째로 옮겼어요.`);
  }
  function addStop(stop: RouteStop) {
    if (!stop.name.trim() || !areValidCoordinates(stop.lat, stop.lng)) { setError("장소 이름과 좌표를 다시 확인해 주세요."); return; }
    if (stops.length >= 12) { setError("방문 장소는 최대 12곳까지 추가할 수 있어요."); return; }
    if (stops.some((item) => item.name === stop.name && item.lat === stop.lat && item.lng === stop.lng)) { setMessage("이미 방문 장소에 추가한 곳이에요."); return; }
    setStops([...stops, stop]); setAdding(false); markDirty(); setMessage(`${stop.name}을 방문 장소에 추가했어요.`);
  }
  function addCustomStop() {
    const lat = Number(customLat), lng = Number(customLng);
    if (!customName.trim() || !customLat.trim() || !customLng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) { setError("장소 이름과 올바른 위도(-90~90), 경도(-180~180)를 입력해 주세요."); return; }
    addStop({ name: customName.trim(), lat, lng, category: "내 장소" });
    setCustomName(""); setCustomLat(""); setCustomLng("");
  }
  function applyExample(replace: boolean, confirmed = false) {
    if (replace && !confirmed && (plainContent.trim() || stops.length > 1)) { setConfirmation({ title: "코스 예시로 바꿀까요?", description: "작성 중인 본문과 방문 장소를 선택한 예시로 바꿔요. 루트 제목은 유지돼요.", label: "예시 적용", action: () => applyExample(true, true) }); return; }
    if (!replace && plainContent.length + sampleText.length + 2 > 12000) { setError("본문은 12,000자까지 작성할 수 있어요. 내용을 줄인 후 다시 추가해 주세요."); return; }
    if (contentFormat === "html") setContent(replace || !plainContent.trim() ? plainTextToHtml(sampleText) : `${content}${plainTextToHtml(sampleText)}`);
    else setContent(replace || !plainContent.trim() ? sampleText : `${content}\n\n${sampleText}`);
    if (replace) { setStops([cafe, { name: current.name, lat: current.lat, lng: current.lng, category: "야구장" }]); if (!title.trim()) setTitle(`${current.name}, ${theme}`); }
    markDirty(); setTab("write"); setMessage(replace ? "코스 예시를 적용했어요. 나만의 이야기로 수정해 보세요." : "본문 끝에 코스 예시를 추가했어요.");
  }
  function changeTab(next: WriterTab) { setTab(next); }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % writerTabs.length;
    else if (event.key === "ArrowLeft") next = (index + writerTabs.length - 1) % writerTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = writerTabs.length - 1;
    else return;
    event.preventDefault(); setTab(writerTabs[next].id); document.getElementById(`writer-tab-${writerTabs[next].id}`)?.focus();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    setError("");
    if (!canSave) { setError("제목과 본문, 방문 장소를 확인해 주세요. 본문은 12,000자까지 작성할 수 있어요."); setTab("write"); return; }
    savingRef.current = true; setSaving(true);
    const id = existing && !existing.isSample ? existing.id : `local-${crypto.randomUUID()}`;
    const route: TripRoute = {
      id, title: title.trim(), stadium: current.name, description: plainContent.replace(/\s+/g, " ").trim().slice(0, 100),
      content: content.trim(), ...(contentFormat ? { contentFormat } : {}), tags, duration, cover: existing?.cover ?? "/images/stadium-night.jpg", stops,
      author: "나의 코스", likes: existing && !existing.isSample ? existing.likes : 0, views: existing && !existing.isSample ? existing.views : 0,
      isSample: false, createdAt: existing && !existing.isSample ? existing.createdAt : new Date().toISOString(),
    };
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      saveRoute(route); writerDrafts.delete(draftKey); dirty.current = false; router.push(`/routes/${encodeURIComponent(id)}`);
    } catch { savingRef.current = false; setSaving(false); setError("저장하지 못했어요. 브라우저 저장 공간이나 개인정보 보호 설정을 확인해 주세요. 작성 내용은 이 화면에 남아 있어요."); }
  }

  return (
    <main className="writer-page">
      <div className="container">
        <div className="writer-page-heading">
          <div><span className="eyebrow">MAKE YOUR GAME DAY</span><h1>{existing && !existing.isSample ? "나의 루트 수정하기" : "나만의 직관 루트 만들기"}</h1><p>장소를 고르고 이야기를 더하면, 나만의 직관 하루가 완성돼요.</p></div>
          <Link href="/routes" className="writer-back">← 루트 둘러보기</Link>
        </div>
        <div className="writer-mobile-tabs" role="tablist" aria-label="루트 작성 도구">{writerTabs.map((item, index) => <button type="button" role="tab" key={item.id} id={`writer-tab-${item.id}`} aria-controls={`writer-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => changeTab(item.id)} onKeyDown={(event) => tabKey(event, index)}>{item.label}{item.id === "map" && <span>{stops.length}</span>}</button>)}</div>
        <form ref={formRef} onSubmit={submit} className="writer-form" aria-busy={saving}>
          <fieldset disabled={saving} className="writer-layout" data-active-tab={tab}>
            <legend className="sr-only">직관 루트 작성</legend>
            <div className="writer-writing writer-panel" id="writer-panel-write" role="tabpanel" aria-labelledby="writer-tab-write" tabIndex={0}>
              <section className="writer-card">
                <div className="writer-section-title"><span>01</span><h2>어떤 하루를 떠나볼까요?</h2></div>
                <div className="writer-field"><label htmlFor="route-title">루트 제목 <em>*</em></label><input id="route-title" value={title} onChange={(event) => { setTitle(event.target.value); markDirty(); }} maxLength={80} placeholder="예: 친구와 함께, 잠실에서 보내는 하루" required /><span className="writer-field-hint">함께 가는 사람에게 소개하듯 제목을 지어보세요. <b>{title.length}/80</b></span></div>
                <div className="writer-field-grid"><div className="writer-field"><label htmlFor="route-stadium">방문할 구장</label><select id="route-stadium" value={stadiumCode} onChange={(event) => changeStadium(event.target.value)}>{stadiums.map((stadium) => <option key={stadium.code} value={stadium.code}>{stadium.name}</option>)}</select></div><div className="writer-field"><label htmlFor="route-duration">계획한 일정</label><select id="route-duration" value={duration} onChange={(event) => { setDuration(event.target.value); markDirty(); }}><option>반나절</option><option>하루</option><option>1박 2일</option>{existing?.duration && !["반나절", "하루", "1박 2일"].includes(existing.duration) && <option>{existing.duration}</option>}</select></div></div>
                <fieldset className="writer-tag-field"><legend>이번 직관의 테마</legend><div className="writer-tags">{tagOptions.map((tag) => <button className={tags.includes(tag) ? "writer-tag is-selected" : "writer-tag"} type="button" aria-pressed={tags.includes(tag)} key={tag} onClick={() => { setTags(tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]); markDirty(); }}>{tags.includes(tag) ? "✓ " : "+ "}{tag}</button>)}</div></fieldset>
              </section>
              <section className="writer-card">
                <div className="writer-section-title"><span>02</span><h2><label htmlFor="route-content">나만의 이야기를 담아보세요</label></h2></div>
                <Editor id="route-content" value={content} format={contentFormat} disabled={saving} onChange={(value, format) => { setContent(value); setContentFormat(format); markDirty(); }} />
                <p className="writer-field-hint writer-content-tip">방문 순서, 이동 계획, 준비물을 적으면 함께 가는 사람에게 더 도움이 돼요.</p>
              </section>
            </div>

            <section className="writer-map-panel writer-panel writer-card" id="writer-panel-map" role="tabpanel" aria-labelledby="writer-tab-map" tabIndex={0}>
              <div className="writer-section-title"><span>03</span><h2>장소를 이어 나의 루트로</h2><small>{stops.length}/12곳</small></div>
              <RouteMap key={stadiumCode} stops={stops} onAddStop={addStop} searchable />
              <div className="writer-stop-heading"><h3>오늘의 방문 순서</h3><p>장소를 끌거나 화살표로 순서를 바꿔보세요.</p></div>
              <ol className="writer-stops" aria-label="방문 장소 순서">{stops.map((stop, index) => <li key={`${stop.name}-${stop.lat}-${stop.lng}-${stop.category}-${stops.slice(0, index).filter((item) => item.name === stop.name && item.lat === stop.lat && item.lng === stop.lng && item.category === stop.category).length}`} className={dragOver === index ? "is-drag-over" : ""} onDragOver={(event) => { if (dragIndex.current !== null) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOver(index); } }} onDrop={(event) => { event.preventDefault(); if (dragIndex.current !== null) reorderStop(dragIndex.current, index); dragIndex.current = null; setDragOver(null); }}>
                <button className="writer-drag-handle" type="button" draggable aria-label={`${stop.name} 순서 변경 안내`} title="마우스로 끌어서 옮기거나 오른쪽 화살표를 사용하세요" onClick={() => setMessage("장소를 끌거나 오른쪽 위·아래 화살표를 눌러 순서를 바꿀 수 있어요.")} onDragStart={(event) => { dragIndex.current = index; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }} onDragEnd={() => { dragIndex.current = null; setDragOver(null); }}>⠿</button>
                <span className="writer-stop-number">{index + 1}</span><div className="writer-stop-info"><strong>{stop.name}</strong><span>{stop.category} <b>·</b> <a href={`https://map.kakao.com/link/map/${encodeURIComponent(stop.name)},${stop.lat},${stop.lng}`} target="_blank" rel="noopener noreferrer">지도 ↗</a></span></div><div className="writer-stop-actions"><button type="button" aria-label={`${stop.name} 위로 이동`} disabled={index === 0} onClick={() => reorderStop(index, index - 1)}>↑</button><button type="button" aria-label={`${stop.name} 아래로 이동`} disabled={index === stops.length - 1} onClick={() => reorderStop(index, index + 1)}>↓</button><button type="button" aria-label={`${stop.name} 삭제`} onClick={() => { setStops(stops.filter((_, target) => target !== index)); markDirty(); setMessage(`${stop.name}을 방문 장소에서 삭제했어요.`); }}>×</button></div>
              </li>)}</ol>
              {!stops.length && <div className="writer-no-stops"><WriterIcon kind="pin" /><strong>아직 방문 장소가 없어요</strong><p>지도에서 장소를 검색하거나 아래에서 첫 장소를 추가해 주세요.</p></div>}
              <button type="button" className="writer-add-place" aria-expanded={adding} aria-controls="writer-place-picker" onClick={() => setAdding(!adding)}>{adding ? "− 장소 추가 닫기" : "+ 추천 장소 또는 직접 추가"}</button>
              {adding && <div className="writer-place-picker" id="writer-place-picker"><p>선택한 구장과 주변 장소</p><div className="writer-place-options"><button type="button" onClick={() => addStop({ name: current.name, lat: current.lat, lng: current.lng, category: "야구장" })}><WriterIcon kind="pin" /><span>{current.name}<small>야구장</small></span><b>+</b></button><button type="button" onClick={() => addStop(cafe)}><WriterIcon kind="pin" /><span>{cafe.name}<small>수집된 주변 카페 · 방문 전 운영 확인</small></span><b>+</b></button></div><details className="writer-custom-place"><summary>다른 장소 직접 입력하기</summary><p>지도에서 확인한 장소 이름과 좌표를 입력해 주세요.</p><div className="writer-field"><label htmlFor="stop-name">장소 이름</label><input id="stop-name" value={customName} onChange={(event) => setCustomName(event.target.value)} maxLength={70} placeholder="방문할 장소 이름" /></div><div className="writer-field-grid"><div className="writer-field"><label htmlFor="stop-lat">위도</label><input id="stop-lat" type="number" step="any" min="-90" max="90" value={customLat} onChange={(event) => setCustomLat(event.target.value)} placeholder="예: 37.5162" /></div><div className="writer-field"><label htmlFor="stop-lng">경도</label><input id="stop-lng" type="number" step="any" min="-180" max="180" value={customLng} onChange={(event) => setCustomLng(event.target.value)} placeholder="예: 127.0759" /></div></div><button type="button" className="button button-secondary" onClick={addCustomStop}>이 장소 추가</button></details></div>}
            </section>

            <aside className="writer-assistant writer-panel" id="writer-panel-ai" role="tabpanel" aria-labelledby="writer-tab-ai" tabIndex={0}>
              <div className="writer-assistant-heading"><span className="writer-assistant-icon"><WriterIcon kind="spark" /></span><div><h2>AI 루트 도우미</h2><p>막막한 시작에 작은 아이디어를 더해요</p></div></div>
              <div className="writer-assistant-body"><span className="writer-assistant-eyebrow">LET’S PLAN YOUR DAY</span><h3>좋아하는 야구에,<br />좋아하는 순간을 더해요.</h3><p className="writer-assistant-description">선택한 구장과 테마로 챗봇에게 물어보세요.<br />아래의 코스 예시를 바탕으로 직접 시작해도 좋아요.</p><button type="button" className="button button-primary writer-apply" onClick={() => openChat(`${current.name}에서 ${duration} 동안 ${tags.length ? tags.join(", ") : "야구 관람"} 테마로 직관하려고 해요. 경기 전후 시간을 어떻게 계획하면 좋을까요?`, { stadium: current.name, intent: "route" })}>AI에게 질문하기<WriterIcon kind="spark" /></button>
                <div className="writer-example-divider"><span>준비된 코스 예시로 시작하기</span></div>
                <div className="writer-theme-options" aria-label="코스 예시 테마">{themes.map((item) => <button type="button" key={item} aria-pressed={theme === item} className={theme === item ? "is-selected" : ""} onClick={() => setTheme(item)}>{item}</button>)}</div>
                <div className="writer-example-card"><span className="writer-example-label"><WriterIcon kind="spark" /> {current.name} 코스 예시</span><h4>{theme === "첫 직관" ? "처음이라 더 설레는 하루" : theme === "친구와 함께" ? "함께라서 더 즐거운 직관" : "서두르지 않아도 좋은 하루"}</h4><div className="writer-example-step"><span>01</span><div><strong>{cafe.name}</strong><p>커피 한 잔으로 시작하기</p></div></div><div className="writer-example-step"><span>02</span><div><strong>{current.name}</strong><p>오늘의 주인공, 야구 즐기기</p></div></div><p className="writer-example-note">준비된 예시예요. 방문 전 영업 여부와 입장 조건을 확인해 주세요.</p></div>
                <button type="button" className="button button-secondary writer-apply" onClick={() => applyExample(true)}>이 코스로 시작하기 <WriterIcon kind="arrow" /></button><button type="button" className="writer-append" onClick={() => applyExample(false)}>본문에 설명만 덧붙이기</button>
              </div>
            </aside>
          </fieldset>
          <div className="writer-save-area">
            {error && <div role="alert" className="writer-error">{error}</div>}
            {message && <div role="status" className="writer-success">{message}</div>}
            <div className="writer-save-row"><p><strong>{canSave ? "나의 직관 루트가 준비됐어요." : "제목과 이야기, 방문 장소를 채워주세요."}</strong><span>이 브라우저에 저장돼요. 다른 사용자에게 공개되지 않아요.</span></p><button className="button button-primary" type="submit" disabled={!canSave || saving}>{saving ? <><span className="writer-spinner" aria-hidden="true" />저장하고 있어요</> : <><WriterIcon kind="save" />이 기기에 저장</>}</button></div>
          </div>
        </form>
        <dialog ref={dialogRef} className="writer-confirm-dialog" aria-labelledby="writer-confirm-title" aria-describedby="writer-confirm-description" onCancel={(event) => { event.preventDefault(); setConfirmation(null); }}>
          {confirmation && <><span className="writer-confirm-icon"><WriterIcon kind="save" /></span><h2 id="writer-confirm-title">{confirmation.title}</h2><p id="writer-confirm-description">{confirmation.description}</p><div className="writer-confirm-actions"><button type="button" className="button button-secondary" autoFocus onClick={() => setConfirmation(null)}>계속 작성하기</button><button type="button" className="button button-primary" onClick={() => { const action = confirmation.action; setConfirmation(null); action(); }}>{confirmation.label}</button></div></>}
        </dialog>
      </div>
    </main>
  );
}
