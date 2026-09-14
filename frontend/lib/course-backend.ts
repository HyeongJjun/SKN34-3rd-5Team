import "server-only";
import { isIP } from "node:net";
import { checkSameOrigin, teamBackendUrl } from "./team-backend";
import { ChatError } from "./chat/validation";

const writes = new Set(["POST", "PATCH", "DELETE"]);

export async function forwardCourseRequest(request: Request, path: string) {
  try {
    if (writes.has(request.method)) checkSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length"));
    if (contentLength > 64000) throw new ChatError("코스 내용이 너무 길어요.", 413);
    const body = request.method === "GET" || request.method === "DELETE" ? undefined : await request.text();
    if (body && body.length > 64000) throw new ChatError("코스 내용이 너무 길어요.", 413);
    if (body && !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ChatError("JSON 형식으로 코스를 보내 주세요.", 415);
    const forwardedFor = request.headers.get("x-forwarded-for")?.trim() ?? "";
    const clientAddress = !forwardedFor.includes(",") && isIP(forwardedFor) ? forwardedFor : "";
    const response = await fetch(teamBackendUrl(path, process.env.COURSE_BACKEND_URL ?? ""), {
      method: request.method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(request.headers.get("x-course-edit-token") ? { "X-Course-Edit-Token": request.headers.get("x-course-edit-token")! } : {}),
        ...(clientAddress ? { "X-Forwarded-For": clientAddress } : {}),
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(40000)]),
    });
    return new Response([204, 205, 304].includes(response.status) ? null : response.body, { status: response.status, headers: { "Content-Type": response.headers.get("content-type") || "application/json", "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof ChatError;
    return Response.json({ error: known ? error.message : "코스 서버에 연결하지 못했어요." }, { status: known ? error.status : 502, headers: { "Cache-Control": "no-store" } });
  }
}
