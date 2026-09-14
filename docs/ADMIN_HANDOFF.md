# 관리자 기능 1차

- 프론트 `/admin`: 회원 번호·아이디 검색, 20명씩 조회, 운영 관리자 권한 부여·회수.
- 관리자 로그인: `/login?next=admin`. 기존 팀 JWT 로그인과 HttpOnly 쿠키 사용.
- `TEAM_BACKEND_URL`은 Django 기본 주소입니다. 로컬 Next 개발 서버는 `http://localhost:8000/`, Docker 프론트는 `http://backend:8000/`을 사용합니다.
- 운영 관리자: 활성 `is_staff` 계정. 회원 조회 가능.
- 마스터 관리자: 활성 `is_staff` + `is_superuser` 계정. 운영 관리자 권한 변경 가능.
- 자신과 슈퍼유저의 권한은 변경 불가. 슈퍼유저 생성/승격은 이 API가 제공하지 않습니다.
- 백엔드 `GET /auth/user` 응답에 권한 플래그 추가.
- `GET /auth/admin/members/?q=&page=1`, `PATCH /auth/admin/members/{id}/role/` (`{"is_staff":true}`) 추가.
- 백엔드가 모든 요청의 사용자 권한을 확인하며 프론트 값으로 권한을 결정하지 않습니다. 권한 변경은 트랜잭션과 Django LogEntry로 기록합니다.
- 회원 역할 확인 응답에 권한 필드가 없는 이전 백엔드는 접근 거부됩니다. 프론트와 백엔드를 함께 반영해야 합니다.
- `python manage.py bootstrap_admin`은 로컬 `.env`에 설정된 사용자명과 단방향 비밀번호 해시로 최초 마스터 관리자를 생성합니다. 이미 존재하는 계정은 권한만 보정하며 비밀번호를 다시 덮어쓰지 않습니다.
- Docker 백엔드는 migration 직후 `bootstrap_admin`을 실행합니다. 환경 변수가 비어 있으면 계정 생성 없이 넘어갑니다.
- 새 테이블은 만들지 않으며 기존 Django 사용자·admin 로그 테이블을 사용합니다.
- 현재 게시글·코스는 이 회원 관리 범위에 포함하지 않습니다.
