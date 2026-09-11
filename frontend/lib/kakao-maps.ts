"use client";

export type MapCoordinate = { getLat(): number; getLng(): number };
type Bounds = { extend(point: MapCoordinate): void };
export type KakaoMap = {
  getCenter(): MapCoordinate;
  setCenter(point: MapCoordinate): void;
  setBounds(bounds: Bounds, top?: number, right?: number, bottom?: number, left?: number): void;
  relayout(): void;
};
export type KakaoPlace = { id: string; place_name: string; road_address_name: string; address_name: string; category_group_name: string; x: string; y: string };
export type KakaoOverlay = { setMap(map: KakaoMap | null): void };
export type MapClickEvent = { latLng: MapCoordinate };
export type KakaoMaps = {
  load(callback: () => void): void;
  Map: new (element: HTMLElement, options: { center: MapCoordinate; level: number; draggable?: boolean; scrollwheel?: boolean; disableDoubleClickZoom?: boolean }) => KakaoMap;
  LatLng: new (lat: number, lng: number) => MapCoordinate;
  LatLngBounds: new () => Bounds;
  CustomOverlay: new (options: { map: KakaoMap; position: MapCoordinate; content: HTMLElement; yAnchor?: number; zIndex?: number }) => KakaoOverlay;
  Polyline: new (options: { map: KakaoMap; path: MapCoordinate[]; strokeWeight: number; strokeColor: string; strokeOpacity: number; strokeStyle: string; endArrow?: boolean }) => KakaoOverlay;
  event: { addListener(target: KakaoMap, event: string, callback: (event: MapClickEvent) => void): void; removeListener(target: KakaoMap, event: string, callback: (event: MapClickEvent) => void): void };
  services: { Places: new () => { keywordSearch(query: string, callback: (places: KakaoPlace[], status: string) => void, options: { location: MapCoordinate; size: number }): void }; Status: { OK: string; ZERO_RESULT: string } };
};

declare global { interface Window { kakao?: { maps: KakaoMaps } } }
let loading: Promise<KakaoMaps> | undefined;

export function loadKakaoMaps(): Promise<KakaoMaps> {
  if (window.kakao?.maps?.services && window.kakao.maps.Map) return Promise.resolve(window.kakao.maps);
  if (loading) return loading;
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim();
  if (!key) return Promise.reject(new Error("지도 연결을 준비하고 있어요. 장소 목록과 외부 지도는 계속 이용할 수 있어요."));
  loading = new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.remove();
      loading = undefined;
      reject(new Error("지도를 불러오지 못했어요. 잠시 후 다시 시도하거나 카카오맵에서 확인해 주세요."));
    };
    const timeout = setTimeout(fail, 12000);
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`;
    script.onerror = fail;
    script.onload = () => {
      if (!window.kakao?.maps?.load) { fail(); return; }
      window.kakao.maps.load(() => {
        if (settled) return;
        if (!window.kakao?.maps?.services) { fail(); return; }
        settled = true;
        clearTimeout(timeout);
        resolve(window.kakao.maps);
      });
    };
    document.head.appendChild(script);
  });
  return loading;
}
