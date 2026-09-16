# 아키텍처 · 흐름 다이어그램

[archify](https://github.com/tt-a1i/archify)로 만든 인터랙티브 다이어그램입니다. 원본은 `*.archify.json`, 결과는 같은 이름의 `.html`입니다.

| 다이어그램 | 종류 | 인터랙티브 | 움직이는 그림 | 정지 그림 | 영상 |
| --- | --- | --- | --- | --- | --- |
| 시스템 아키텍처 | architecture | [HTML](system_architecture.html) | [GIF](../images/system_architecture.gif) | [PNG](../images/system_architecture.png) · [SVG](../images/system_architecture.svg) | [MP4](../media/system_architecture.mp4) |
| 챗봇 RAG · 에이전트 흐름 | workflow | [HTML](chat_pipeline.html) | [GIF](../images/chat_pipeline.gif) | [PNG](../images/chat_pipeline.png) · [SVG](../images/chat_pipeline.svg) | [MP4](../media/chat_pipeline.mp4) |
| 직관 코스 추천 순서 | sequence | [HTML](course_sequence.html) | [GIF](../images/course_sequence.gif) | [PNG](../images/course_sequence.png) · [SVG](../images/course_sequence.svg) | [MP4](../media/course_sequence.mp4) |
| 데이터 수집 · 전처리 · 인덱싱 | dataflow | [HTML](data_pipeline.html) | [GIF](../images/data_pipeline.gif) | [PNG](../images/data_pipeline.png) · [SVG](../images/data_pipeline.svg) | [MP4](../media/data_pipeline.mp4) |
| 협업 · CI/CD 배포 | workflow | [HTML](deploy_cicd.html) | [GIF](../images/deploy_cicd.gif) | [PNG](../images/deploy_cicd.png) · [SVG](../images/deploy_cicd.svg) | [MP4](../media/deploy_cicd.mp4) |
| 화면 흐름 (UX Flow) | workflow | [HTML](ux_flow.html) | [GIF](../images/ux_flow.gif) | [PNG](../images/ux_flow.png) · [SVG](../images/ux_flow.svg) | [MP4](../media/ux_flow.mp4) |

## 어디에 무엇을 쓰나

| 쓰는 곳 | 파일 | 동작 |
| --- | --- | --- |
| GitHub README | `images/*.gif` | 페이지에서 바로 움직임 (선을 따라 점이 흐름) |
| PPT — 간단히 | `images/*.gif` | 이미지로 삽입하면 슬라이드쇼에서 반복 재생 |
| PPT — 선명하게 | `media/*.mp4` | 삽입 → 비디오 → 재생 탭에서 **자동 시작 · 반복 재생** 체크 |
| PPT · 보고서 정지 화면 | `images/*.png` (약 5000px) · `*.svg` | 확대해도 깨지지 않음 |
| 발표 중 시연 | `architecture/*.html` | 내려받아 브라우저로 열기 → **Present**(발표 화면) · **Play story**(단계별 설명) · 노드 클릭 · 검색 |

> GitHub는 레포 안의 HTML을 실행하지 않습니다. HTML은 내려받아 열거나 GitHub Pages로 배포해서 보세요.
> 뷰어의 버튼 글자(Present, Export 등)는 영어로 나오고, 다이어그램 안 글자는 한국어입니다.

## 다시 만들기

```bash
# JSON 수정 후 (archify 스킬 폴더 경로 지정)
ARCHIFY=~/archify bash docs/architecture/build_media.sh
# HTML만 있고 그림 · 영상만 다시 뽑을 때
bash docs/architecture/build_media.sh
```

필요: Node.js 18+ (HTML 생성), Python + `playwright` (내보내기), `ffmpeg` (GIF · MP4 변환)
