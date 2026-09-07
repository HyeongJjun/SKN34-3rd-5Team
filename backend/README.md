
# 백엔드 환경 (Django)

백엔드·크롤링·전처리의 Python 의존성을 함께 관리합니다. 기본 환경은 `backend/.venv`입니다.
모든 명령은 프로젝트 루트 기준입니다.

```bash
uv sync --project backend --locked
uv run --project backend --locked python -m django --version
```

Conda를 쓸 경우 아래 방식으로 Python 환경은 Conda, 패키지는 uv로 관리합니다.
현재 머신에서는 Conda 환경 생성이 내부 TypeError로 실패하여 아래 경로는 미검증입니다.

```bash
conda env create -f backend/environment.yml
conda activate skn34-backend
uv sync --project backend --active --inexact --locked
python -m django --version
```

기본 패키지 추가: `uv add --project backend 패키지명`
Conda 환경 패키지 추가: `uv add --project backend --active --inexact 패키지명`
`--inexact`는 Conda가 관리하는 패키지를 삭제하지 않기 위한 옵션입니다.
`pyproject.toml`과 `uv.lock`을 함께 공유합니다. uv는 별도 설치가 필요합니다.
Django 앱과 DB 연결은 아직 구현하지 않았습니다.

[전체 실행 안내](../README.md) · [VS Code 설정](../docs/환경설정_my_venv.md)
