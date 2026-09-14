"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthHydrated } from "@/components/auth-hydration";
import { MEMBER_PREVIEW_ENABLED, usePreviewMember } from "@/lib/member-preview";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const hydrated = useAuthHydrated();
  const member = usePreviewMember();
  const router = useRouter();
  const allowed = !MEMBER_PREVIEW_ENABLED || member?.role === "master";

  useEffect(() => {
    if (!hydrated || allowed) return;
    router.replace(member ? "/mypage" : "/login?next=admin");
  }, [allowed, hydrated, member, router]);

  if (!hydrated || !allowed) {
    return <main className="container"><p role="status">관리자 권한을 확인하고 있어요.</p></main>;
  }

  return children;
}
