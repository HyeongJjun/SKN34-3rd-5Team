import { forwardCourseRequest } from "@/lib/course-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const path = async ({ params }: Context) => `courses/${encodeURIComponent((await params).id)}/`;

export const GET = async (request: Request, context: Context) => forwardCourseRequest(request, await path(context));
export const PATCH = async (request: Request, context: Context) => forwardCourseRequest(request, await path(context));
export const DELETE = async (request: Request, context: Context) => forwardCourseRequest(request, await path(context));
