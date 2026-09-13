import "server-only";
import { cookies } from "next/headers";
import { ChatError } from "./chat/validation";

export function teamBackendUrl(path: string) {
  const base = process.env.CHAT_BACKEND_URL?.trim();
  if (!base) throw new ChatError("팀 백엔드 주소가 설정되지 않았어요.", 503);
  const url = new URL(base.endsWith("/") ? base : `${base}/`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new ChatError("팀 백엔드 주소 설정을 확인해 주세요.", 503);
  return new URL(path, url);
}

export function checkSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new ChatError("같은 사이트에서 요청해 주세요.", 403);
}

export async function saveTokens(access: string, refresh?: string) {
  const jar = await cookies();
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  jar.set("kbo_access", access, { ...options, maxAge: 300 });
  if (refresh) jar.set("kbo_refresh", refresh, { ...options, maxAge: 86400 });
}

async function backendFetch(path: string, init: RequestInit) {
  try {
    return await fetch(teamBackendUrl(path), { ...init, cache: "no-store", redirect: "error", signal: init.signal ?? AbortSignal.timeout(40000) });
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new ChatError("팀 백엔드에 연결하지 못했어요. 서버 실행 상태와 주소를 확인해 주세요.", 502);
  }
}

export async function teamRequest(path: string, body: unknown, authenticated = true, signal?: AbortSignal, method: "GET" | "POST" | "PATCH" = "POST"): Promise<unknown> {
  const jar = await cookies();
  let access = jar.get("kbo_access")?.value;
  async function refreshAccess() {
    const refresh = jar.get("kbo_refresh")?.value;
    if (!refresh) throw new ChatError("팀 계정으로 로그인한 뒤 이용해 주세요.", 401);
    const response = await backendFetch("auth/token/refresh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh }), signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || typeof data?.access !== "string") {
      if (response.status >= 500) throw new ChatError("로그인 확인 서버가 응답하지 않아요.", 502);
      jar.delete("kbo_access"); jar.delete("kbo_refresh");
      throw new ChatError("로그인이 만료됐어요. 다시 로그인해 주세요.", 401);
    }
    access = data.access;
    await saveTokens(data.access, typeof data.refresh === "string" ? data.refresh : undefined);
  }
  if (authenticated && !access) await refreshAccess();
  const invoke = () => backendFetch(path, { method, headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${access}` } : {}) }, body: method === "GET" ? undefined : JSON.stringify(body), signal });
  let response = await invoke();
  if (authenticated && response.status === 401) { await refreshAccess(); response = await invoke(); }
  if (!response.ok) {
    if (response.status === 401) throw new ChatError("아이디와 비밀번호를 확인하거나 다시 로그인해 주세요.", 401);
    if (response.status === 403) throw new ChatError("이 기능을 이용할 권한이 없어요.", 403);
    if (response.status === 404) throw new ChatError("채팅방을 찾지 못했어요. 새 대화를 시작해 주세요.", 404);
    if (response.status === 429) throw new ChatError("요청이 많아요. 잠시 후 다시 시도해 주세요.", 429);
    throw new ChatError("팀 백엔드에서 요청을 처리하지 못했어요.", 502);
  }
  return response.json();
}
