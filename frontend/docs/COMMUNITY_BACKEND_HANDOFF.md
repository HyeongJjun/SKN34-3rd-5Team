# 게시글·댓글 백엔드 연결 인계

현재 자유 게시판, 팀 게시판, 승부 예측의 글과 댓글은 `localStorage`의 `kbo-community-content-v1`에 저장된다. 일반 HTTP에서도 동작하도록 ID는 `crypto.randomUUID()` 대신 `createClientId()`로 만든다. 브라우저를 새로고침해도 유지되지만 다른 기기나 브라우저와 공유되지는 않는다.

## 현재 데이터 형식

게시글은 `id`, `clientId`, `postNumber`, `board`, `teamCode`, `category`, `title`, `content`, `authorId`, `author`, `createdAt`, `updatedAt`, `views`, `recommendations`를 가진다. 댓글은 `id`, `clientId`, `postId`, `authorId`, `author`, `content`, `createdAt`, `updatedAt`을 가진다. `clientId`는 서버 이전 시 중복 등록을 막는 idempotency key로 사용할 수 있다.

전체 브라우저 데이터를 옮길 때는 `exportCommunityContent()`가 반환하는 `{ schemaVersion, exportedAt, posts, comments }` 형태를 사용한다. 댓글은 반드시 게시글을 먼저 저장하고, 로컬 `postId`와 서버 게시글 ID의 매핑을 만든 뒤 저장한다.

## 권장 API 계약

- `GET /api/community/posts?board=&team=&page=`: 게시글 목록
- `POST /api/community/posts`: 게시글 생성. 요청의 `clientId`를 unique로 처리
- `GET /api/community/posts/{id}`: 게시글 상세
- `GET /api/community/posts/{id}/comments`: 댓글 목록
- `POST /api/community/posts/{id}/comments`: 댓글 생성. 요청의 `clientId`를 unique로 처리

프론트 연결 시 `frontend/lib/community-store.ts`의 조회 훅과 생성 함수 내부만 API 호출로 교체하면 게시판 컴포넌트의 화면 구조는 유지할 수 있다. 서버가 게시글 번호, 작성자, 생성 시각을 최종 확정하며, `authorId`는 로그인 세션에서 결정해야 한다. 브라우저가 보낸 작성자명과 권한은 신뢰하지 않는다.

이관이 성공하면 서버가 반환한 `clientId` 목록과 비교한 뒤 해당 브라우저의 로컬 레코드만 제거한다. 요청 중 실패한 레코드는 남겨 재시도할 수 있게 한다.
