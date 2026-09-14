import Link from "next/link";
import styles from "@/app/admin/page.module.css";

const sections = [
  { id: "members", label: "회원 관리", href: "/admin" },
  { id: "posts", label: "게시글 관리", href: "/admin/posts" },
  { id: "reports", label: "신고 목록 관리", href: "/admin/reports" },
] as const;

export function AdminSectionNav({ active }: { active: (typeof sections)[number]["id"] }) {
  return <nav className={styles.sectionNav} aria-label="관리자 메뉴">
    {sections.map(section => <Link key={section.id} href={section.href} aria-current={active === section.id ? "page" : undefined}>{section.label}</Link>)}
  </nav>;
}
