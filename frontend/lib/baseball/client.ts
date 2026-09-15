import type { BaseballStadium, Page, TicketPolicy } from "./types";

export class BaseballApiError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

async function baseballRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/baseball/${path}`, { cache: "no-store", signal }); }
  catch { throw new BaseballApiError("야구 정보 서버에 연결하지 못했어요."); }
  if (!response.ok) throw new BaseballApiError(response.status === 404 ? "구장 정보를 찾을 수 없어요." : "야구 정보를 불러오지 못했어요.", response.status);
  return response.json() as Promise<T>;
}

export async function fetchBaseballStadiums(signal?: AbortSignal) {
  let pageNumber = 1;
  let page = await baseballRequest<Page<BaseballStadium>>(`stadiums/?page=${pageNumber}&page_size=100`, signal);
  const results = [...page.results];
  while (results.length < page.count && page.results.length) {
    page = await baseballRequest<Page<BaseballStadium>>(`stadiums/?page=${++pageNumber}&page_size=100`, signal);
    results.push(...page.results);
  }
  if (results.length < page.count) throw new BaseballApiError("구장 목록을 끝까지 불러오지 못했어요.");
  return { ...page, count: results.length, next: null, previous: null, results };
}
export const fetchBaseballStadium = (code: string, signal?: AbortSignal) => baseballRequest<BaseballStadium>(`stadiums/${encodeURIComponent(code)}/`, signal);
export const fetchStadiumSection = <T>(code: string, section: string, page = 1, homeContext?: number, signal?: AbortSignal) => baseballRequest<Page<T>>(`stadiums/${encodeURIComponent(code)}/${section}/?${new URLSearchParams({ page: String(page), page_size: "30", ...(homeContext ? { home_context: String(homeContext) } : {}) })}`, signal);
export const fetchTicketPolicies = (team: number, page = 1, signal?: AbortSignal) => baseballRequest<Page<TicketPolicy>>(`ticket-policies/?${new URLSearchParams({ team: String(team), page: String(page), page_size: "30" })}`, signal);
