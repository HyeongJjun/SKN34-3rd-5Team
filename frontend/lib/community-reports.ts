"use client";

import { useMemo, useSyncExternalStore } from "react";

export type ReportStatus = "대기" | "처리 완료" | "기각";
export type CommunityReport = {
  id: number;
  postId: string;
  postNumber: string;
  board: string;
  title: string;
  reporter: string;
  category: string;
  details: string;
  reportedAt: string;
  status: ReportStatus;
};

const KEY = "kbo-community-reports-v1";
const EVENT = "kbo-community-reports-change";
const EMPTY = "[]";

function read() {
  if (typeof window === "undefined") return EMPTY;
  try { return localStorage.getItem(KEY) ?? EMPTY; } catch { return EMPTY; }
}

function parse(raw: string): CommunityReport[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CommunityReport => Boolean(item && typeof item === "object"
      && Number.isSafeInteger((item as CommunityReport).id) && (item as CommunityReport).id > 0
      && ["postId", "postNumber", "board", "title", "reporter", "category", "details", "reportedAt"].every(key => typeof (item as unknown as Record<string, unknown>)[key] === "string")
      && ["대기", "처리 완료", "기각"].includes((item as CommunityReport).status)));
  } catch { return []; }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback); window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(EVENT, callback); };
}

function persist(reports: CommunityReport[]) {
  localStorage.setItem(KEY, JSON.stringify(reports));
  window.dispatchEvent(new Event(EVENT));
}

export function useCommunityReports() {
  const raw = useSyncExternalStore(subscribe, read, () => EMPTY);
  return useMemo(() => parse(raw).sort((a, b) => b.id - a.id), [raw]);
}

export function createCommunityReport(input: Omit<CommunityReport, "id" | "reportedAt" | "status">) {
  const reports = parse(read());
  const nextId = reports.reduce((highest, report) => Math.max(highest, report.id), 0) + 1;
  const report: CommunityReport = { ...input, id: nextId, reportedAt: new Date().toISOString(), status: "대기" };
  persist([report, ...reports]);
  return report;
}

export function updateCommunityReportStatus(id: number, status: Exclude<ReportStatus, "대기">) {
  const reports = parse(read());
  if (!reports.some(report => report.id === id)) throw new Error("신고 항목을 찾을 수 없어요.");
  persist(reports.map(report => report.id === id ? { ...report, status } : report));
}
