"use client";

import { useMemo, useSyncExternalStore } from "react";

const KEY = "kbo-admin-hidden-posts-v1";
const EVENT = "kbo-admin-hidden-posts-change";
const EMPTY = "[]";

function read() {
  if (typeof window === "undefined") return EMPTY;
  try { return localStorage.getItem(KEY) ?? EMPTY; } catch { return EMPTY; }
}

function parse(raw: string): string[] {
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === "string" && id.length <= 200))] : []; }
  catch { return []; }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback); window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(EVENT, callback); };
}

export function useHiddenPostIds() {
  const raw = useSyncExternalStore(subscribe, read, () => EMPTY);
  return useMemo(() => parse(raw), [raw]);
}

export function togglePostHidden(id: string) {
  const hidden = parse(read());
  localStorage.setItem(KEY, JSON.stringify(hidden.includes(id) ? hidden.filter(item => item !== id) : [...hidden, id]));
  window.dispatchEvent(new Event(EVENT));
}
