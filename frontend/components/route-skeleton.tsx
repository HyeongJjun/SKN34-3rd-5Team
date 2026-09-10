export function RouteListSkeleton() {
  return <main className="container community-page" aria-busy="true" aria-label="커뮤니티 게시판 불러오는 중"><p className="sr-only" role="status">게시글을 불러오고 있어요.</p><div className="community-breadcrumb" aria-hidden="true">홈 › 커뮤니티</div><div className="community-header" aria-hidden="true"><div><div className="route-skeleton community-loading-title"/><div className="route-skeleton community-loading-description"/></div></div><div className="community-layout"><div><div className="route-skeleton community-loading-filter" aria-hidden="true"/><RouteBoardSkeleton/></div></div></main>;
}

export function RouteBoardSkeleton() {
  return <div className="community-loading-table" aria-hidden="true"><div className="community-loading-head"/>{Array.from({ length: 6 }, (_, index) => <div className="community-loading-row" key={index}><div><div className="route-skeleton route-skeleton-badge"/><div className="route-skeleton route-skeleton-title"/></div><div className="route-skeleton"/><div className="route-skeleton"/></div>)}</div>;
}

export function RouteCardsSkeleton({ count = 6, className = "route-card-grid" }: { count?: number; className?: string } = {}) {
  return <div className={className} aria-hidden="true">{Array.from({ length: count }, (_, index) => <div className="route-card route-card-skeleton" key={index}><div className="route-skeleton route-card-image"/><div className="route-card-content"><div className="route-skeleton route-skeleton-badge"/><div className="route-skeleton route-skeleton-title"/><div className="route-skeleton route-skeleton-line"/><div className="route-skeleton route-skeleton-line is-short"/><div className="route-skeleton route-skeleton-footer"/></div></div>)}</div>;
}

export function RouteDetailSkeleton() {
  return <main className="container route-detail-page route-detail-skeleton" aria-busy="true" aria-label="코스 상세 불러오는 중"><p className="route-sr-only" role="status">저장된 코스를 불러오고 있어요.</p><div className="route-skeleton route-skeleton-badge" aria-hidden="true"/><div className="route-skeleton route-skeleton-heading" aria-hidden="true"/><div className="route-skeleton route-skeleton-subheading" aria-hidden="true"/><div className="route-skeleton route-detail-cover" aria-hidden="true"/><div className="route-skeleton route-skeleton-line" aria-hidden="true"/><div className="route-skeleton route-skeleton-line is-short" aria-hidden="true"/></main>;
}
