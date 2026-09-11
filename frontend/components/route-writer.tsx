"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ChatPopup } from "@/components/chat-popup";
import Editor from "@/components/editor";
import { RouteMap } from "@/components/route-map";
import { routeContentToText, type RouteContentFormat } from "@/lib/route-content";
import { useChat } from "@/components/chat-provider";
import { saveRoute, useRoutes, type RouteStop, type TripRoute } from "@/lib/routes";

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

type WriterTab = "write" | "chat";
type Confirmation = { title: string; description: string; label: string; action: () => void };
const writerTabs: { id: WriterTab; label: string }[] = [{ id: "write", label: "루트 작성" }, { id: "chat", label: "챗봇" }];
type WriterDraft = {
  stadiumCode: string;
  title: string;
  content: string;
  contentFormat: RouteContentFormat;
  duration: string;
  tags: string[];
  stops: RouteStop[];
  tab: WriterTab;
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
  const { onContextChange } = useChat();
  const requested = (existing?.stadium ?? initialStadium ?? "").replace(/\s/g, "").toUpperCase();
  const initial = stadiums.find((stadium) => stadium.code === requested || (requested && stadium.name.replace(/\s/g, "").toUpperCase().includes(requested))) ?? stadiums[0];
  const draftKey = existing ? `edit:${existing.id}` : `new:${initial.code}`;
  const [restoredDraft] = useState(() => writerDrafts.get(draftKey));
  const [stadiumCode] = useState(restoredDraft?.stadiumCode ?? initial.code);
  const [title, setTitle] = useState(restoredDraft?.title ?? existing?.title ?? "");
  const [content, setContent] = useState(restoredDraft?.content ?? existing?.content ?? "");
  const [contentFormat, setContentFormat] = useState<RouteContentFormat>(restoredDraft ? restoredDraft.contentFormat : existing?.contentFormat);
  const [duration] = useState(restoredDraft?.duration ?? existing?.duration ?? "반나절");
  const [tags] = useState<string[]>(restoredDraft?.tags ?? existing?.tags ?? ["첫 직관"]);
  const [stops] = useState<RouteStop[]>(restoredDraft?.stops ?? existing?.stops ?? [{ name: initial.name, lat: initial.lat, lng: initial.lng, category: "야구장" }]);
  const [tab, setTab] = useState<WriterTab>(restoredDraft?.tab ?? "write");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const dirty = useRef(restoredDraft?.dirty ?? false);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const current = stadiums.find((stadium) => stadium.code === stadiumCode)!;
  const plainContent = routeContentToText(content, contentFormat);
  const canSave = Boolean(title.trim() && plainContent.trim() && plainContent.length <= 12000 && stops.length);
  useEffect(() => {
    writerDrafts.set(draftKey, {
      stadiumCode, title, content, contentFormat, duration, tags, stops,
      tab, dirty: dirty.current,
    });
  }, [draftKey, stadiumCode, title, content, contentFormat, duration, tags, stops, tab]);

  useEffect(() => {
    onContextChange({ stadium: current.name, intent: "route" });
  }, [current.name, onContextChange]);

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

  function markDirty() { dirty.current = true; setError(""); }
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
          <div><span className="eyebrow">MAKE YOUR GAME DAY</span><h1>{existing && !existing.isSample ? "나의 루트 수정하기" : "나만의 직관 루트 만들기"}</h1></div>
          <Link href="/routes" className="writer-back">← 루트 둘러보기</Link>
        </div>
        <div className="writer-mobile-tabs" role="tablist" aria-label="루트 작성 도구">{writerTabs.map((item, index) => <button type="button" role="tab" key={item.id} id={`writer-tab-${item.id}`} aria-controls={`writer-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => changeTab(item.id)} onKeyDown={(event) => tabKey(event, index)}>{item.label}</button>)}</div>
        <form ref={formRef} onSubmit={submit} className="writer-form" aria-busy={saving}>
          <fieldset disabled={saving} className="writer-layout" data-active-tab={tab}>
            <legend className="sr-only">직관 루트 작성</legend>
            <div className="writer-writing writer-panel" id="writer-panel-write" role="tabpanel" aria-labelledby="writer-tab-write" tabIndex={0}>
              <section className="writer-card">
                <div className="writer-section-title"><span>01</span><h2>어떤 하루를 떠나볼까요?</h2></div>
                <div className="writer-map-only" id="writer-route-map">
                  <RouteMap key={stadiumCode} stops={stops} />
                </div>
              </section>
              <section className="writer-card">
                <div className="writer-section-title"><span>02</span><h2><label htmlFor="route-content">나만의 이야기를 담아보세요</label></h2></div>
                <div className="writer-field"><label htmlFor="route-title">루트 제목 <em>*</em></label><input id="route-title" value={title} onChange={(event) => { setTitle(event.target.value); markDirty(); }} maxLength={80} placeholder="예: 친구와 함께, 잠실에서 보내는 하루" required /><span className="writer-field-hint">함께 가는 사람에게 소개하듯 제목을 지어보세요. <b>{title.length}/80</b></span></div>
                <Editor id="route-content" value={content} format={contentFormat} disabled={saving} onChange={(value, format) => { setContent(value); setContentFormat(format); markDirty(); }} />
                <p className="writer-field-hint writer-content-tip">방문 순서, 이동 계획, 준비물을 적으면 함께 가는 사람에게 더 도움이 돼요.</p>
              </section>
            </div>

            <aside className="writer-chat-panel writer-panel" id="writer-panel-chat" role="tabpanel" aria-labelledby="writer-tab-chat" tabIndex={0}>
              <ChatPopup embedded title="장소를 이어 나의 루트로" />
            </aside>
          </fieldset>
          <div className="writer-save-area">
            {error && <div role="alert" className="writer-error">{error}</div>}
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
