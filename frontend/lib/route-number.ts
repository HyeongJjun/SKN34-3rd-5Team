"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const KEY = "kbo-route-numbers-v1";
const EVENT = "kbo-route-numbers-change";
const FALLBACK_LOCK_KEY = `${KEY}:lock`;
const samples: Record<string, string> = {
  "jamsil-day": "000001", "gocheok-day": "000002", "incheon-day": "000003",
  "suwon-day": "000004", "daejeon-day": "000005", "daegu-day": "000006",
};
type Registry = { last: number; entries: Record<string, string> };

function parse(raw: string | null): Registry {
  if (!raw) return { last: 6, entries: {} };
  const value = JSON.parse(raw) as Registry;
  if (!value || !Number.isInteger(value.last) || value.last < 6 || value.last > 999999 || !value.entries || typeof value.entries !== "object" || Array.isArray(value.entries)) throw new Error("Invalid route number registry");
  const numbers = Object.values(value.entries);
  if (numbers.some(number => typeof number !== "string" || !/^\d{6}$/.test(number) || Number(number) <= 6 || Number(number) > value.last) || new Set(numbers).size !== numbers.length) throw new Error("Invalid route numbers");
  return value;
}

function allocateNumber(id: string) {
    const registry = parse(window.localStorage.getItem(KEY));
    if (Object.hasOwn(registry.entries, id)) return registry.entries[id];
    if (registry.last >= 999999) throw new Error("Route numbers exhausted");
    const number = String(registry.last + 1).padStart(6, "0");
    window.localStorage.setItem(KEY, JSON.stringify({ last: registry.last + 1, entries: { ...registry.entries, [id]: number } }));
    window.dispatchEvent(new Event(EVENT));
    return number;
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function withStorageLock<T>(callback: () => T): Promise<T> {
  const token = `${Date.now()}:${Math.random()}`;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const now = Date.now();
    let current: { token?: string; expiresAt?: number } = {};
    try { current = JSON.parse(window.localStorage.getItem(FALLBACK_LOCK_KEY) ?? "{}"); } catch { current = {}; }
    if (!current.token || !Number.isFinite(current.expiresAt) || current.expiresAt! <= now) {
      window.localStorage.setItem(FALLBACK_LOCK_KEY, JSON.stringify({ token, expiresAt: now + 1000 }));
      await wait(0);
      let acquired: { token?: string } = {};
      try { acquired = JSON.parse(window.localStorage.getItem(FALLBACK_LOCK_KEY) ?? "{}"); } catch { acquired = {}; }
      if (acquired.token === token) {
        try { return callback(); }
        finally {
          try {
            const latest = JSON.parse(window.localStorage.getItem(FALLBACK_LOCK_KEY) ?? "{}");
            if (latest.token === token) window.localStorage.removeItem(FALLBACK_LOCK_KEY);
          } catch { /* Expiry releases an unreadable lease. */ }
        }
      }
    }
    await wait(12 + Math.floor(Math.random() * 18));
  }
  throw new Error("Route number allocation is busy");
}

/** Local preview only. Entries survive route deletion and remain unique across tabs on HTTP. */
export async function ensureLocalRouteNumber(id: string): Promise<string> {
  if (Object.hasOwn(samples, id)) return samples[id];
  if (!id) throw new Error("Route number allocation is unavailable");
  if (navigator.locks?.request) return navigator.locks.request(KEY, () => allocateNumber(id));
  return withStorageLock(() => allocateNumber(id));
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(EVENT, callback); };
}

export function useRouteNumber(id?: string, serverNumber?: string): string {
  const [failedId, setFailedId] = useState<string>();
  const raw = useSyncExternalStore(subscribe, () => {
    try { return window.localStorage.getItem(KEY) ?? ""; } catch { return ""; }
  }, () => "");
  const sampleNumber = id && Object.hasOwn(samples, id) ? samples[id] : undefined;
  let localNumber: string | undefined;
  try { const registry = parse(raw); if (id && Object.hasOwn(registry.entries, id)) localNumber = registry.entries[id]; } catch { /* Never rebuild a damaged registry and reuse numbers. */ }
  useEffect(() => {
    if (!id || serverNumber || sampleNumber || localNumber) return;
    let active = true;
    void ensureLocalRouteNumber(id).catch(() => { if (active) setFailedId(id); });
    return () => { active = false; };
  }, [id, serverNumber, sampleNumber, localNumber]);
  return serverNumber || sampleNumber || localNumber || (failedId === id ? "번호 확인 필요" : "번호 준비 중");
}
