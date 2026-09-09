"use client";

import { useState } from "react";
import type { KboSnapshot, KboStanding } from "@/lib/kbo/types";
import {
  DetailTeamMark, KboDetailEmpty, KboDetailHeading, KboDetailLoading,
  KboDetailSource, KboDetailWarning, useKboResource,
} from "./kbo-detail-shared";

type SortKey = "rank" | "played" | "wins" | "draws" | "losses" | "winRate" | "gamesBehind" | "battingAverage" | "era";
type SortState = { key: SortKey; ascending: boolean };

function nextSort(current: SortState, key: SortKey): SortState {
  return { key, ascending: current.key === key ? !current.ascending : ["rank", "gamesBehind", "era"].includes(key) };
}

const columns: { key: keyof KboStanding; label: string; sort?: SortKey }[] = [
  { key: "rank", label: "순위", sort: "rank" }, { key: "team", label: "팀" },
  { key: "played", label: "경기", sort: "played" }, { key: "wins", label: "승", sort: "wins" },
  { key: "draws", label: "무", sort: "draws" }, { key: "losses", label: "패", sort: "losses" },
  { key: "winRate", label: "승률", sort: "winRate" }, { key: "gamesBehind", label: "게임차", sort: "gamesBehind" },
  { key: "streak", label: "연속" }, { key: "battingAverage", label: "타율", sort: "battingAverage" },
  { key: "era", label: "평균자책", sort: "era" }, { key: "lastTen", label: "최근 10경기" },
];

export function KboStandingsPage() {
  const { data, error, loading, refreshing, refresh } = useKboResource<KboSnapshot>("/kbo-api", 60_000);
  const [sort, setSort] = useState<SortState>({ key: "rank", ascending: true });
  const season = data?.date.slice(0, 4) ?? "2026";
  const standings = [...(data?.standings ?? [])].sort((a, b) => {
    const difference = Number(a[sort.key]) - Number(b[sort.key]);
    return (sort.ascending ? difference : -difference) || a.rank - b.rank;
  });
  const changeSort = (key: SortKey) => setSort(previous => nextSort(previous, key));

  return <main className="container kbo-detail-page">
    <KboDetailHeading active="standings" />
    <section className="kbo-detail-body" aria-labelledby="kbo-ranking-title">
      <div className="kbo-record-heading"><div><p className="eyebrow">{season} SEASON</p><h2 id="kbo-ranking-title">팀 순위</h2></div><span className="kbo-detail-season">{season} 정규리그</span></div>
      <div className="kbo-record-toolbar"><p>기록 이름을 누르면 해당 기록 순으로 정렬할 수 있어요.</p>
        <button type="button" disabled={sort.key === "rank" && sort.ascending} onClick={() => setSort({ key: "rank", ascending: true })}>순위순으로 보기</button>
      </div>
      {data && (data.stale || data.warning || error) && <KboDetailWarning pending={refreshing} onRetry={refresh} text={data.stale || error ? undefined : data.warning ?? undefined} />}
      {loading ? <KboDetailLoading label="KBO 팀 순위를 불러오고 있어요." rows={10} /> : !data ? <KboDetailEmpty title="팀 순위를 불러오지 못했어요." description="잠시 후 다시 확인해 주세요." retry={refresh} pending={refreshing} />
        : standings.length ? <>
          <p className="kbo-record-scroll-note">옆으로 밀어 타율·평균자책·최근 10경기까지 확인하세요. <span aria-hidden="true">→</span></p>
          <div className="kbo-record-scroll" role="region" aria-label="KBO 전체 팀 순위와 기록, 좌우 스크롤 가능" tabIndex={0}>
            <table className="kbo-record-table"><caption className="sr-only">{season} KBO 정규리그 10개 팀 순위 및 기록. 정렬 버튼을 눌러 오름차순과 내림차순을 전환할 수 있습니다.</caption>
              <thead><tr>{columns.map(column => <th scope="col" key={column.key} aria-sort={column.sort === sort.key ? (sort.ascending ? "ascending" : "descending") : undefined}>
                {column.sort ? <button type="button" onClick={() => changeSort(column.sort!)} aria-label={`${column.label} ${nextSort(sort, column.sort).ascending ? "오름차순" : "내림차순"} 정렬`}>
                  {column.label}<span aria-hidden="true" className={column.sort === sort.key ? "is-sorted" : undefined}>{column.sort === sort.key ? sort.ascending ? "↑" : "↓" : "↕"}</span>
                </button> : column.label}
              </th>)}</tr></thead>
              <tbody>{standings.map(team => <tr key={team.teamCode}>
                <td><span className={`kbo-record-rank${team.rank === 1 ? " is-first" : ""}`}>{team.rank}</span></td>
                <th scope="row"><span className="kbo-record-team"><DetailTeamMark code={team.teamCode} name={team.team} />{team.team}</span></th>
                <td>{team.played}</td><td>{team.wins}</td><td>{team.draws}</td><td>{team.losses}</td>
                <td className="kbo-record-emphasis">{team.winRate}</td><td>{team.gamesBehind}</td>
                <td className={team.streak.includes("승") ? "kbo-record-positive" : undefined}>{team.streak}</td>
                <td>{team.battingAverage}</td><td>{team.era}</td><td>{team.lastTen}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="kbo-record-sort-status sr-only" role="status">{columns.find(column => column.key === sort.key)?.label} {sort.ascending ? "오름차순" : "내림차순"} 정렬</p>
        </> : <KboDetailEmpty title="아직 확인할 수 있는 순위가 없어요." description="정규리그 순위가 제공되면 표시해 드릴게요." retry={refresh} pending={refreshing} />}
      {data && <KboDetailSource source={{ ...data.source, url: "https://www.tving.com/sports/kbo/history" }} fetchedAt={data.fetchedAt} sourceUpdatedAt={data.sourceUpdatedAt} />}
      <div className="kbo-record-glossary"><h3>기록, 이렇게 읽어보세요</h3><dl>
        <div><dt>승률</dt><dd>무승부를 제외한 경기 중 승리한 비율</dd></div>
        <div><dt>게임차</dt><dd>선두 팀과의 승패 차이를 경기 수로 표시</dd></div>
        <div><dt>평균자책</dt><dd>투수가 9이닝 동안 허용한 평균 자책점</dd></div>
      </dl></div>
      <p className="kbo-detail-footnote">정규리그 기준이며, 경기 결과와 순위·기록의 반영 시점은 다를 수 있어요.</p>
    </section>
  </main>;
}
