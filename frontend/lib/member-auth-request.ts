export type MemberUser = {
  id: number; username: string; email: string; first_name: string; birth_date: string | null; gender: "M" | "F" | null;
  is_staff: boolean; is_superuser: boolean; is_active: boolean; nickname: string; team_code: string; avatar: string;
  nickname_changed_at: string | null;
  notifications: { comments: boolean; courses: boolean; announcements: boolean };
  visibility: { courses: boolean; posts: boolean; likes: boolean };
};
export type MemberSnapshot = { status: "anonymous" | "authenticated" | "unavailable"; user: MemberUser | null };
export const normalizeMemberEmail = (email: string) => email.trim().toLowerCase();
export const isCurrentMember = (user: Pick<MemberUser, "id"> | null, expectedId: number) => user?.id === expectedId;

export function createMemberRequestGate(timeoutMs = 10000) {
  let generation = 0;
  let active: AbortController | null = null;
  return {
    start() {
      active?.abort();
      const controller = new AbortController(), current = ++generation;
      let timedOut = false;
      active = controller;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      return { signal: controller.signal, current: () => current === generation, timedOut: () => timedOut, done: () => clearTimeout(timer) };
    },
    invalidate() { generation += 1; active?.abort(); active = null; },
  };
}

export async function loadLatestMember(gate: ReturnType<typeof createMemberRequestGate>, fetcher: (signal: AbortSignal) => Promise<Response> = signal => fetch("/team-auth/user", { cache: "no-store", signal })) {
  const request = gate.start();
  try {
    const response = await fetcher(request.signal);
    if (!request.current()) return null;
    if (request.timedOut() || !response.ok) return { status: response.status === 401 ? "anonymous" : "unavailable", user: null } satisfies MemberSnapshot;
    const user = await response.json();
    return request.current() && !request.timedOut() ? { status: "authenticated", user } satisfies MemberSnapshot : null;
  } catch {
    return request.current() ? { status: "unavailable", user: null } satisfies MemberSnapshot : null;
  } finally { request.done(); }
}
