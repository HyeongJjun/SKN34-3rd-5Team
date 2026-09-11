import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { getStadium, getStadiumMapUrl, stadiums } from "@/lib/stadiums";

type StadiumPageProps = { params: Promise<{ code: string }> };

export function generateStaticParams() {
  return stadiums.map(({ code }) => ({ code }));
}

export async function generateMetadata({ params }: StadiumPageProps): Promise<Metadata> {
  const stadium = getStadium((await params).code);
  return { title: stadium ? `${stadium.name} 구장 정보` : "구장을 찾을 수 없어요" };
}

export default async function StadiumPage({ params }: StadiumPageProps) {
  const stadium = getStadium((await params).code);
  if (!stadium) notFound();

  return (
    <main className="info-page stadium-detail-page">
      <section className="info-hero">
        <div className="container page-intro stadium-detail-intro">
          <Link className="stadium-detail-back" href="/stadiums">← 전체 구장 보기</Link>
          <p className="eyebrow">YOUR NEXT BALLPARK</p>
          <h1>{stadium.name}</h1>
          <p>{stadium.teams.join(" · ")}의 홈구장에서 직관의 하루를 시작해 보세요.</p>
        </div>
      </section>

      <section className="container stadium-detail-content" aria-labelledby="stadium-info-heading">
        <a className={`stadium-detail-art stadium-seat-art stadium-seat-art-${stadium.code.toLowerCase()}`} href={stadium.seatingMap.src} target="_blank" rel="noopener noreferrer" aria-label={`${stadium.name} 전체 좌석 안내도 원본 크게 보기 (새 창)`}>
          <Image className={`stadium-detail-seat-map stadium-detail-seat-map-${stadium.code.toLowerCase()}`} src={stadium.seatingMap.src} alt={`${stadium.name} 전체 좌석 안내도`} fill sizes="(max-width: 760px) 100vw, 46vw" priority />
          <span className="stadium-detail-art-label">{stadium.code} SEATING MAP</span>
          <span className="stadium-seat-zoom">원본 크게 보기 ↗</span>
        </a>
        <div className="stadium-detail-info">
          <p className="eyebrow">BALLPARK INFORMATION</p>
          <h2 id="stadium-info-heading">구장 정보</h2>
          <dl className="stadium-detail-facts">
            <div><dt>홈팀</dt><dd>{stadium.teams.join(" · ")}</dd></div>
            <div><dt>주소</dt><dd>{stadium.address}</dd></div>
            <div><dt>좌석도</dt><dd><a className="stadium-official-seat-link" href={stadium.seatingMap.sourceUrl} target="_blank" rel="noopener noreferrer">구단 공식 안내에서 확인 ↗</a></dd></div>
          </dl>
          <div className="stadium-detail-actions">
            <Link href={`/routes/new?stadium=${encodeURIComponent(stadium.name)}`} className="button button-primary">이 구장으로 코스 만들기 <Icon name="arrow" size={17} /></Link>
            <a href={getStadiumMapUrl(stadium)} target="_blank" rel="noopener noreferrer" className="button button-secondary" aria-label={`${stadium.name} 카카오맵에서 보기 (새 창)`}><Icon name="pin" size={17} /> 카카오맵에서 보기 ↗</a>
          </div>
        </div>
      </section>

      <section className="container info-help-banner">
        <div><p className="eyebrow">READY FOR THE GAME?</p><h2>구장은 정했으니, 하루를 채워볼까요?</h2><p>경기 전후에 들르고 싶은 곳을 골라 나만의 직관 루트를 만들어 보세요.</p></div>
        <Link href="/guide" className="button button-secondary">직관 가이드 보기 <Icon name="arrow" size={16} /></Link>
      </section>
    </main>
  );
}
