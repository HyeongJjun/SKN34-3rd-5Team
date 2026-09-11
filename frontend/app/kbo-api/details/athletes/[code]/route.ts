import { getKboAthleteDetail } from "@/lib/kbo/details-collector";
import { isKboAthleteCode } from "@/lib/kbo/tving-details";
import type { KboAthleteDetail, KboDetailApiResponse } from "@/lib/kbo/details-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const value = (await params).code;
  if (!isKboAthleteCode(value)) {
    const body: KboDetailApiResponse<KboAthleteDetail> = { data: null, error: "선수 코드가 올바르지 않아요." };
    return Response.json(body, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const data = await getKboAthleteDetail(value);
    const body: KboDetailApiResponse<KboAthleteDetail> = { data, error: data ? null : "선수 상세 정보를 아직 가져오지 못했어요." };
    return Response.json(body, { status: data ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    const body: KboDetailApiResponse<KboAthleteDetail> = { data: null, error: "선수 상세 정보를 불러오지 못했어요." };
    return Response.json(body, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

