import type { KboGame, KboSnapshot, KboSourceData } from "./types";

export const FIVE_MINUTES = 5 * 60_000;
export const ONE_HOUR = 60 * 60_000;
export const MAX_FINAL_CHECKS = 6;

export type CollectionControl = {
  mode: KboSnapshot["mode"];
  nextCheckAt: string;
  completionKey: string | null;
  completionSeenAt: string | null;
  finalCheckAttempts: number;
  minimumPlayed: Record<string, number>;
  finished: boolean;
};
export type CollectionRecord = {
  data: KboSourceData;
  fetchedAt: string;
  updatedAt: string;
  control: CollectionControl;
  failures: number;
  warning: string | null;
};

export function koreaDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isGameComplete(game: KboGame): boolean {
  if (game.status === "cancelled" || game.status === "postponed") return true;
  return game.status === "final" && game.home.score !== null && game.away.score !== null;
}

// Reject incomplete collections instead of turning an empty/partial response into
// a no-game day. A postponed game must remain present with its confirmed status.
export function assertCompleteCollection(previous: CollectionRecord | null, data: KboSourceData, date: string): void {
  if (data.date !== date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("일정 날짜가 일치하지 않습니다.");
  if (data.standings.length !== 10 || new Set(data.standings.map(team => team.teamCode)).size !== 10) throw new Error("10개 구단의 순위를 확인하지 못했습니다.");
  if (new Set(data.games.map(game => game.id)).size !== data.games.length || data.games.some(game => game.date !== date)) throw new Error("경기 식별 정보가 올바르지 않습니다.");
  if (data.games.some(game => game.status === "final" && !isGameComplete(game))) throw new Error("종료 경기의 최종 점수가 누락되었습니다.");
  if (previous?.data.date === date) {
    const ids = new Set(data.games.map(game => game.id));
    if (previous.data.games.some(game => !ids.has(game.id))) throw new Error("기존 경기 일부가 응답에서 누락되었습니다.");
  }
}

export function planCollection(previous: CollectionRecord | null, data: KboSourceData, now = new Date()): { control: CollectionControl; warning: string | null } {
  const timestamp = now.getTime();
  const old = previous?.data.date === data.date ? previous : null;
  const minimumPlayed = { ...old?.control.minimumPlayed };
  if (old) {
    const previousGames = new Map(old.data.games.map(game => [game.id, game]));
    const newlyFinished = data.games.filter(game => game.status === "final" && previousGames.has(game.id) && previousGames.get(game.id)?.status !== "final");
    const newGamesByTeam = new Map<string, number>();
    for (const game of newlyFinished) {
      for (const team of [game.home, game.away]) newGamesByTeam.set(team.code, (newGamesByTeam.get(team.code) ?? 0) + 1);
    }
    for (const team of old.data.standings) {
      const count = newGamesByTeam.get(team.teamCode);
      if (count) minimumPlayed[team.teamCode] = Math.max(minimumPlayed[team.teamCode] ?? 0, team.played + count);
    }
  }
  const control: CollectionControl = {
    mode: "hourly", nextCheckAt: new Date(timestamp + ONE_HOUR).toISOString(),
    completionKey: null, completionSeenAt: null, finalCheckAttempts: 0, minimumPlayed, finished: false,
  };
  if (!data.games.length) return { control: { ...control, finished: true }, warning: null };

  const allComplete = data.games.every(isGameComplete);
  if (!allComplete) {
    const startTimes = data.games.filter(game => game.status !== "cancelled" && game.status !== "postponed").map(game => game.startsAt ? Date.parse(game.startsAt) : NaN).filter(Number.isFinite);
    const firstStart = startTimes.length ? Math.min(...startTimes) : null;
    const started = data.games.some(game => ["live", "final", "suspended"].includes(game.status)) || firstStart === null || firstStart <= timestamp;
    control.mode = started ? "five-minute" : "hourly";
    control.nextCheckAt = new Date(started ? timestamp + FIVE_MINUTES : Math.min(timestamp + ONE_HOUR, firstStart!)).toISOString();
    return { control, warning: null };
  }

  // A day consisting only of cancellations has no game results to add to ranks.
  if (data.games.every(game => game.status === "cancelled" || game.status === "postponed")) return { control: { ...control, finished: true }, warning: null };

  const completionKey = JSON.stringify([...data.games].sort((a, b) => a.id.localeCompare(b.id)).map(game => [game.id, game.status, game.away.score, game.home.score]));
  const sameCompletion = old?.control.completionKey === completionKey;
  control.completionKey = completionKey;
  control.completionSeenAt = sameCompletion ? old.control.completionSeenAt : now.toISOString();
  const standingsCaughtUp = Object.entries(minimumPlayed).every(([code, count]) => data.standings.some(team => team.teamCode === code && team.played >= count));
  if (sameCompletion && old.control.finished && standingsCaughtUp) return { control: { ...control, finished: true }, warning: null };

  const confirmedAfterDelay = sameCompletion && control.completionSeenAt !== null && timestamp >= Date.parse(control.completionSeenAt) + FIVE_MINUTES;
  if (confirmedAfterDelay && standingsCaughtUp) return { control: { ...control, finished: true }, warning: null };

  control.finalCheckAttempts = confirmedAfterDelay ? (old?.control.finalCheckAttempts ?? 0) + 1 : 0;
  control.mode = control.finalCheckAttempts >= MAX_FINAL_CHECKS ? "hourly" : "final-check";
  control.nextCheckAt = new Date(timestamp + (control.mode === "hourly" ? ONE_HOUR : FIVE_MINUTES)).toISOString();
  return { control, warning: standingsCaughtUp ? null : "경기 결과의 순위 반영을 확인하고 있어요." };
}

export function recordSuccessfulCollection(previous: CollectionRecord | null, data: KboSourceData, date: string, now = new Date()): CollectionRecord {
  assertCompleteCollection(previous, data, date);
  const { control, warning } = planCollection(previous, data, now);
  // Provider timestamps and crawl times do not represent changes to sports data.
  const fingerprint = (value: KboSourceData) => JSON.stringify([value.date, value.games, value.standings]);
  const changed = !previous || fingerprint(previous.data) !== fingerprint(data);
  return { data, fetchedAt: now.toISOString(), updatedAt: changed ? now.toISOString() : previous.updatedAt, control, failures: 0, warning };
}

export function recordFailedCollection(previous: CollectionRecord, now = new Date()): CollectionRecord {
  const failures = previous.failures + 1;
  const delay = Math.min(ONE_HOUR, FIVE_MINUTES * 2 ** Math.min(failures - 1, 4));
  return { ...previous, failures, control: { ...previous.control, nextCheckAt: new Date(now.getTime() + delay).toISOString() }, warning: "최신 정보를 확인하지 못해 마지막으로 저장한 정보를 표시하고 있어요." };
}
