import { checkSameOrigin, teamRequest } from "@/lib/team-backend";
import { adminResourceNames } from "@/lib/baseball/admin-resources";
import { ChatError, isRecord } from "@/lib/chat/validation";

export const runtime = "nodejs";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const failure = (error: unknown) => json({ error: error instanceof ChatError ? error.message : "야구 관리 서버에 연결하지 못했어요.", fields: error instanceof ChatError ? error.fields : undefined }, error instanceof ChatError ? error.status : 502);
function resource(value: unknown) { if (typeof value !== "string" || !adminResourceNames.has(value)) throw new ChatError("관리 자원을 확인해 주세요.", 400); return value; }

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const name = resource(query.get("resource"));
    const id = query.get("id");
    const path = id ? `baseball/manage/${name}/${encodeURIComponent(id)}/` : `baseball/manage/${name}/?${new URLSearchParams({ page: query.get("page") || "1", page_size: query.get("page_size") || "30", q: (query.get("q") || "").slice(0, 150) })}`;
    return json(await teamRequest(path, undefined, true, request.signal, "GET"));
  } catch (error) { return failure(error); }
}

async function mutate(request: Request, method: "POST" | "PATCH" | "DELETE") {
  try {
    checkSameOrigin(request);
    const text = await request.text();
    if (text.length > 100_000) throw new ChatError("요청이 너무 길어요.", 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new ChatError("요청 형식을 확인해 주세요.", 400); }
    if (!isRecord(body)) throw new ChatError("요청 형식을 확인해 주세요.", 400);
    const name = resource(body.resource);
    const id = body.id;
    const payload = isRecord(body.values) ? body.values : {};
    if (method !== "POST" && (!Number.isSafeInteger(id) || Number(id) < 1)) throw new ChatError("레코드 ID를 확인해 주세요.", 400);
    const path = method === "POST" ? `baseball/manage/${name}/` : `baseball/manage/${name}/${id}/`;
    const result = await teamRequest(path, payload, true, request.signal, method);
    return method === "DELETE" ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }) : json(result, method === "POST" ? 201 : 200);
  } catch (error) { return failure(error); }
}
export const POST = (request: Request) => mutate(request, "POST");
export const PATCH = (request: Request) => mutate(request, "PATCH");
export const DELETE = (request: Request) => mutate(request, "DELETE");
