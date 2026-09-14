"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createMemberRequestGate, isCurrentMember, loadLatestMember, type MemberUser } from "./member-auth-request";
import { MEMBER_PREVIEW_ENABLED, usePreviewMember } from "./member-preview";
export type { MemberUser } from "./member-auth-request";
type AuthState = { status: "loading" | "anonymous" | "authenticated" | "unavailable"; user: MemberUser | null; reload: () => Promise<void>; setUser: (user: MemberUser | null, expectedUserId?: number) => boolean };
const MemberAuthContext = createContext<AuthState | null>(null);

export function MemberAuthProvider({ children }: { children: React.ReactNode }) {
  const preview = usePreviewMember();
  const [state, setState] = useState<Omit<AuthState, "reload" | "setUser">>({ status: "loading", user: null });
  const currentUser = useRef<MemberUser | null>(null);
  const gate = useMemo(() => createMemberRequestGate(), []);
  const reload = useCallback(async () => {
    const next = await loadLatestMember(gate);
    if (next) { currentUser.current = next.user; setState(next); }
  }, [gate]);
  useEffect(() => {
    if (MEMBER_PREVIEW_ENABLED) {
      return () => gate.invalidate();
    }
    void Promise.resolve().then(reload);
    return () => gate.invalidate();
  }, [gate, reload]);
  const setUser = useCallback((user: MemberUser | null, expectedUserId?: number) => {
    if (user && expectedUserId !== undefined && !isCurrentMember(currentUser.current, expectedUserId)) return false;
    gate.invalidate(); currentUser.current = user; setState({ status: user ? "authenticated" : "anonymous", user }); return true;
  }, [gate]);
  const previewUser = useMemo<MemberUser | null>(() => preview ? {
    id: Number(preview.id.replace("preview-member-", "")) || 1,
    username: preview.username,
    email: "",
    first_name: "",
    birth_date: null,
    gender: null,
    is_staff: preview.role === "master",
    is_superuser: preview.role === "master",
    is_active: true,
    nickname: preview.nickname,
    team_code: preview.teamCode,
    avatar: preview.avatar,
    nickname_changed_at: preview.nicknameChangedAt,
    notifications: { comments: true, courses: true, announcements: true },
    visibility: { courses: true, posts: true, likes: false },
  } : null, [preview]);
  const exposed = MEMBER_PREVIEW_ENABLED
    ? { status: previewUser ? "authenticated" as const : "anonymous" as const, user: previewUser }
    : state;
  return <MemberAuthContext value={{ ...exposed, reload, setUser }}>{children}</MemberAuthContext>;
}

export function useMemberAuth() {
  const value = useContext(MemberAuthContext);
  if (!value) throw new Error("MemberAuthProvider가 필요합니다.");
  return value;
}
