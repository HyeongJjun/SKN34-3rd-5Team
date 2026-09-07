
# 프론트엔드 (React + Vite)

기본 화면만 구성되어 있으며 백엔드 API 연동은 아직 없습니다. 프로젝트 루트에서 실행합니다.

```bash
npm --prefix frontend ci --include=dev
npm --prefix frontend run dev
```

접속: http://localhost:5173
기본 화면: `src/App.jsx`
빌드 검증: `npm --prefix frontend run build`

의존성은 `package.json`, 정확한 버전은 `package-lock.json`으로 관리합니다.
기본 포트가 사용 중이면 Vite가 출력한 접속 주소를 확인합니다.

[전체 실행 안내](../README.md)
