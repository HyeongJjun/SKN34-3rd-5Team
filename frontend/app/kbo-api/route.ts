import { getKboSnapshot } from "@/lib/kbo/collector";
import type { KboApiResponse } from "@/lib/kbo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getKboSnapshot();
    const body: KboApiResponse = { data, error: data ? null : "오늘 경기 정보를 아직 가져오지 못했어요. 잠시 후 다시 확인해 주세요." };
    return Response.json(body, { status: data ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    const body: KboApiResponse = { data: null, error: "경기 정보를 불러오지 못했어요. 잠시 후 다시 확인해 주세요." };
    return Response.json(body, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
