import { forwardCourseRequest } from "@/lib/course-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => forwardCourseRequest(request, "courses/");
export const POST = (request: Request) => forwardCourseRequest(request, "courses/");
