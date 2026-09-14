import { verifyPreviewPassword } from "@/lib/preview-credentials";
import { checkSameOrigin, teamRequest } from "@/lib/team-backend";
import { ChatError, isRecord } from "@/lib/chat/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkSameOrigin(request);
    const raw = await request.text();
    if (raw.length > 4096) throw new ChatError("입력한 정보가 너무 길어요.", 413);
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new ChatError("로그인 정보를 확인해 주세요."); }
    if (!isRecord(data) || typeof data.username !== "string" || !data.username.trim() || typeof data.password !== "string" || !data.password) {
      throw new ChatError("아이디와 비밀번호를 입력해 주세요.");
    }

    const username = data.username.trim();
    const previewUsername = process.env.MEMBER_PREVIEW_USERNAME;
    const testAccountNumber = /^test([1-5])$/.exec(username)?.[1];
    const previewRole = username === previewUsername ? "master" : testAccountNumber ? "member" : null;
    if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_MEMBER_PREVIEW === "true" && previewUsername && previewRole) {
      if (!await verifyPreviewPassword(data.password)) throw new ChatError("아이디 또는 비밀번호를 확인해 주세요.", 401);
      return Response.json({
        mode: "preview",
        role: previewRole,
        account: {
          id: previewRole === "master" ? 1 : Number(testAccountNumber) + 1,
          username,
          nickname: previewRole === "master" ? "관리자" : `테스트팬${testAccountNumber}`,
        },
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const tokens = await teamRequest("auth/signin", { username, password: data.password }, false, request.signal);
    if (!isRecord(tokens) || typeof tokens.access !== "string" || typeof tokens.refresh !== "string") {
      throw new ChatError("로그인 응답을 확인하지 못했어요.", 502);
    }
    return Response.json(tokens, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { detail: error instanceof ChatError ? error.message : "로그인에 실패했어요." },
      { status: error instanceof ChatError ? error.status : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
