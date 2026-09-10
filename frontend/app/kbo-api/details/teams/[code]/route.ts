import { getKboTeamDetail } from "@/lib/kbo/details-collector";
import { isKboTeamCode } from "@/lib/kbo/tving-details";
import type { KboDetailApiResponse, KboTeamDetail } from "@/lib/kbo/details-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const value = (await params).code.toUpperCase();
  if (!isKboTeamCode(value)) {
    const body: KboDetailApiResponse<KboTeamDetail> = { data: null, error: "존재하지 않는 KBO 구단이에요." };
    return Response.json(body, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const data = await getKboTeamDetail(value);
    const body: KboDetailApiResponse<KboTeamDetail> = { data, error: data ? null : "구단 상세 정보를 아직 가져오지 못했어요." };
    return Response.json(body, { status: data ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    const body: KboDetailApiResponse<KboTeamDetail> = { data: null, error: "구단 상세 정보를 불러오지 못했어요." };
    return Response.json(body, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

