import { getKboScheduleMonth, isArchiveMonth } from "@/lib/kbo/archive";
import { koreaDate } from "@/lib/kbo/policy";
import type { KboScheduleResponse } from "@/lib/kbo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const today = koreaDate();
  const month = new URL(request.url).searchParams.get("month") ?? (today.startsWith("2026-") ? today.slice(0, 7) : "2026-12");
  if (!isArchiveMonth(month)) return Response.json({ data: null, error: "2026년 1월부터 12월까지 조회할 수 있어요." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const body: KboScheduleResponse = { data: await getKboScheduleMonth(month), error: null };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ data: null, error: "경기 일정을 불러오지 못했어요. 잠시 후 다시 확인해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
