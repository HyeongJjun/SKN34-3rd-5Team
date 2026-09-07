# data

데이터 수집·전처리 패키지는 `../backend/pyproject.toml`에서 함께 관리합니다.
프로젝트 루트에서 `uv sync --project backend --locked`로 설치합니다.

원본 보존과 생성 결과를 분리합니다.

- [raw/](raw/README.md) — 원본·기준 자료. 스크립트가 자동으로 덮어쓰지 않습니다.
- [preprocessed/](preprocessed/README.md) — 수집·전처리 결과. 실행 시 갱신될 수 있습니다.

외부 API에서 받은 값도 스크립트가 생성·갱신하는 파일이면 `preprocessed/`에 둡니다.
공개 전 출처별 이용조건을 확인하고, 미확정·비공식 자료는 확정 정보와 구분합니다.

[수집 방법](../crawling/README.md) · [전처리 방법](../preprocessing/README.md)
