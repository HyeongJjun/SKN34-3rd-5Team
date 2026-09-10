import { getKboDetailsStatus } from "@/lib/kbo/details-collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ data: await getKboDetailsStatus(), error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ data: null, error: "상세 정보 수집 상태를 확인하지 못했어요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

