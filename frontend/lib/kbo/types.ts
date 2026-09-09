export type KboGameStatus = "scheduled" | "live" | "final" | "cancelled" | "postponed" | "suspended" | "unknown";

export type KboGame = {
  id: string;
  date: string;
  startsAt: string | null;
  time: string;
  stadium: string;
  away: { code: string; name: string; score: number | null; startingPitcher?: string | null };
  home: { code: string; name: string; score: number | null; startingPitcher?: string | null };
  status: KboGameStatus;
  statusLabel: string;
};

export type KboStanding = {
  rank: number;
  teamCode: string;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: string;
  gamesBehind: string;
  streak: string;
  battingAverage: string;
  era: string;
  lastTen: string;
};

export type KboSourceData = {
  date: string;
  games: KboGame[];
  standings: KboStanding[];
  sourceUpdatedAt: string | null;
};

export type KboSnapshot = KboSourceData & {
  fetchedAt: string;
  updatedAt: string;
  nextCheckAt: string;
  mode: "hourly" | "five-minute" | "final-check";
  source: { name: string; url: string };
  stale: boolean;
  warning: string | null;
};

export type KboApiResponse = { data: KboSnapshot | null; error: string | null };

export type KboScheduleDay = {
  date: string;
  status: "ready" | "empty" | "pending" | "error";
  gameCount: number;
};

export type KboScheduleMonth = {
  year: 2026;
  month: string;
  today: string;
  games: KboGame[];
  days: KboScheduleDay[];
  fetchedAt: string | null;
  stale: boolean;
  warning: string | null;
  loading: boolean;
  source: { name: string; url: string };
};

export type KboScheduleResponse = { data: KboScheduleMonth | null; error: string | null };
