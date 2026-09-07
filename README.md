# KBO 직관 안내 챗봇

KBO 경기·구장·예매 정보를 수집하고 제공하기 위한 팀 프로젝트입니다.

현재는 데이터 수집·전처리 스크립트, React 기본 화면, Django 패키지 환경과 PostgreSQL 설정이 있습니다.
Django 앱·API 및 프론트엔드와 DB의 연결은 아직 구현하지 않았습니다.

## 폴더 구성

```text
SKN34-3rd-5Team/
├── backend/               # Django 환경·공통 Python 의존성
│   ├── pyproject.toml
│   └── uv.lock
├── frontend/              # React + Vite
│   ├── package.json
│   ├── package-lock.json
│   └── src/App.jsx        # 기본 화면
├── crawling/              # API·웹 데이터 수집
├── preprocessing/         # 데이터 정제·구조화
├── data/
│   ├── raw/               # 원본·기준 자료 보존
│   └── preprocessed/      # 수집·전처리 결과
├── docs/                  # 참고 자료·과거 보고서
├── .env.example           # 환경변수 예시
├── compose.yaml           # PostgreSQL
└── README.md
```

루트 `compose.yaml`은 PostgreSQL만 실행합니다. 앱 컨테이너는 포함하지 않습니다.

## 처음 설치 및 실행

1. uv, Node.js/npm, Docker Compose를 설치하고 Docker를 실행합니다.
2. 터미널에서 이 저장소의 루트 폴더로 이동합니다.
3. 아래 순서로 Python·프론트엔드 패키지를 설치하고 DB·화면을 실행합니다.

```bash
uv sync --project backend --locked
npm --prefix frontend ci --include=dev
docker compose up -d
npm --prefix frontend run dev
```

- 프론트엔드: http://localhost:5173 (포트 사용 중이면 Vite가 표시한 주소 확인)
- DB: `127.0.0.1:5432`, 로컬 개발용 DB명·사용자·비밀번호는 `baseball`
- DB 종료: `docker compose down` (데이터 볼륨 유지)
- Python 확인: `uv run --project backend --locked python -m django --version`
- 프론트 빌드: `npm --prefix frontend run build`

## 데이터 작업

- [크롤링 실행](crawling/README.md) → [전처리 실행](preprocessing/README.md) → [데이터 관리](data/README.md)
- Python 패키지는 `backend/pyproject.toml` 하나에서 관리하고 `backend/uv.lock`도 함께 공유합니다.
- 수집·전처리 실행 시 `data/preprocessed/`가 갱신됩니다. `data/raw/`는 자동으로 덮어쓰지 않습니다.
- 카카오 수집에는 루트 `.env`의 `KAKAO_REST_API_KEY`가 필요합니다. `.env.example`은 예시만 공유하고 실제 키는 커밋하지 않습니다.
- 데이터 공개 전 출처별 재배포 조건을 확인합니다.

## 참고

- [Python·VS Code 설정](docs/환경설정_my_venv.md)
- [참고 문서와 과거 보고서](docs/README.md)
- 크롤러/파서 스크립트는 자기 위치 기준 상대경로로 `../data/raw`, `../data/preprocessed`를 찾아가므로, 스크립트 자체를 옮기면 경로가 여전히 맞는지 재점검 필요.
