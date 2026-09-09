# 챗봇 연결과 수정

챗봇 화면과 실제 답변을 만드는 부분을 분리했습니다. `.env.example`의 기본값은 **예시 응답 모드**입니다. API 키 없이 대화창·입력·로딩·오류 화면을 개발할 때 사용할 수 있으며, 예시 응답은 실제 Luna 응답과 구분해 표시합니다.

## 전용 채팅 페이지

- 메인에서 질문을 전송하면 `/chat`으로 이동하며 같은 질문을 한 번 전송합니다. 질문을 URL에 넣지 않습니다.
- `/chat`은 대화 목록, 새 대화, 대화 본문, 하단 입력창으로 구성합니다. 일반 사이트 헤더·푸터·모바일 하단 메뉴는 이 페이지에서 표시하지 않습니다.
- 다른 페이지의 `직관 도우미` 버튼은 작은 팝업을 엽니다. 팝업은 `/chat`과 같은 대화 기록·입력 중인 질문·응답 대기 상태를 사용합니다. 채팅 페이지 안에서는 떠 있는 버튼을 숨깁니다.
- 팝업 상단의 `채팅 크게 보기`는 `/chat`으로 이동하고, 전용 페이지 상단의 `채팅 작게 보기`는 원래 페이지로 돌아가 팝업을 엽니다. `/chat`을 직접 열었다면 홈으로 돌아갑니다. 팝업을 닫거나 크기를 전환해도 요청을 중복 전송하거나 취소하지 않습니다.
- 대화와 입력 중인 질문은 루트 레이아웃의 상태로 유지됩니다. 새 대화와 이전 대화 전환을 지원하며, 응답을 기다리는 동안에는 취소 후 전환합니다. 페이지 새로고침이나 탭 종료 후 복원하는 계정별 대화 저장은 아직 연결하지 않았습니다.
- 루트 작성 중 채팅으로 이동해도 미완성 입력을 메모리에 보관합니다. 돌아오면 복원하고, 저장하거나 명시적으로 버리면 지웁니다.

## GPT-5.6 Luna 연결

1. `frontend/.env.example`을 `frontend/.env.local`로 복사합니다. 이미 `.env.local`이 있으면 덮어쓰지 말고 아래 항목만 추가하거나 수정합니다.
2. 다음 값을 입력합니다. API 키는 자신의 로컬 파일에만 넣습니다.

   ```dotenv
   CHAT_PROVIDER=openai
   OPENAI_MODEL=gpt-5.6-luna
   OPENAI_API_KEY=발급받은_API_키
   ```

3. 실행 중인 프론트 서버를 중지한 뒤 `frontend` 폴더에서 `npm run dev`로 다시 실행합니다. 접속 주소는 `http://localhost:3000`입니다.
4. 대화창에서 연결 상태를 확인하고 질문을 보내 실제 답변이 도착하는지 확인합니다. 실제 호출은 해당 API 계정의 사용량과 비용에 반영됩니다.

모델명은 `OPENAI_MODEL` 한 곳에서 바꿀 수 있습니다. 공식 모델 식별자는 [OpenAI Docs의 GPT-5.6 Luna 문서](https://developers.openai.com/api/docs/models/gpt-5.6-luna)에서 확인했습니다. 실제 사용에는 해당 모델을 사용할 수 있는 API 계정과 키가 필요합니다.

예시 응답으로 돌아가려면 `CHAT_PROVIDER=demo`로 바꾸고 서버를 재시작합니다. API 키는 `NEXT_PUBLIC_` 변수, 브라우저 코드, 대화 메시지 또는 Git에 넣지 않습니다. `.env.local`은 Git 제외 대상입니다.

팀 Docker는 `frontend` 폴더를 컨테이너의 `/app`에 연결하므로 같은 `frontend/.env.local`을 읽습니다. 환경변수를 변경하면 프론트 컨테이너를 재시작합니다. 이 연결을 위해 포트나 Compose 설정을 바꿀 필요는 없습니다.

## 팀 챗봇과 연결

팀의 RAG·LLM 서버가 준비되면 아래 두 값을 설정하고 프론트 서버를 재시작합니다.

```dotenv
CHAT_PROVIDER=backend
CHAT_BACKEND_URL=팀_챗봇의_전체_요청_URL
```

브라우저는 항상 같은 사이트의 `/chat-api`로 요청합니다. Next.js 서버가 선택된 제공자로 전달하므로, 화면을 다시 만들 필요 없이 실제 연결 부분을 교체할 수 있습니다. 기존 Nginx에서 `/api/`는 Django에 연결되기 때문에 챗봇 중계 경로는 `/chat-api`로 분리했습니다.

팀 서버에 보내는 요청:

```json
{
  "messages": [
    { "role": "user", "content": "잠실 첫 직관 코스를 도와주세요." }
  ],
  "context": { "stadium": "잠실야구장", "intent": "route" }
}
```

`messages`에는 `user`와 `assistant` 메시지가 들어갑니다. `context`는 선택 사항이며, `intent`는 `route`, `baseball`, `stadium` 중 하나입니다. 팀 서버는 다음 형식으로 응답하면 됩니다.

```json
{ "reply": "답변 내용" }
```

`GET /chat-api`는 설정 상태 `{provider, model, ready}`를, `POST /chat-api`는 답변과 상태 `{reply, provider, model, ready}`를 반환합니다. `ready`는 필요한 설정이 있는지 나타내며, 외부 API 인증이나 응답 성공까지 보장하지 않습니다.

## 어디를 수정하나요?

| 바꾸려는 것 | 파일 |
| --- | --- |
| 채팅 페이지와 화면 디자인 | `app/chat/page.tsx`, `components/chat-workspace.tsx`, `styles/chat-workspace.css` |
| 작은 채팅 팝업과 디자인 | `components/chat-popup.tsx`, `styles/chat-popup.css` |
| 두 화면의 공통 답변 표시 | `components/chat-answer.tsx` |
| 대화 상태·페이지 이동·직관 도우미 버튼 | `components/chat-provider.tsx` |
| 채팅 페이지의 사이트 공통 영역 숨김 | `components/site-frame.tsx` |
| 브라우저에서 보내는 요청 | `lib/chat/client.ts` |
| 요청·응답 형식 | `lib/chat/types.ts` |
| 챗봇의 역할과 답변 지침 | `lib/chat/prompt.ts` |
| API 없이 보여주는 예시 답변 | `lib/chat/demo.ts` |
| Luna 또는 팀 서버 연결 방식 | `lib/chat/server.ts` |
| 서버 요청 진입점 | `app/chat-api/route.ts` |
| 루트 작성 화면의 질문 버튼 | `components/route-writer.tsx` |

루트 작성 화면의 코스 예시는 고정된 작성 도우미입니다. **AI에게 질문하기**는 현재 선택한 구장·일정·테마를 전용 채팅 페이지에 전달하며, 답변이 작성 중인 본문을 자동으로 바꾸지는 않습니다.

현재 연결은 팀의 검색 데이터, 경기 일정 API, 지도 경로 계산까지 포함한 완성형 RAG가 아닙니다. 공개 서비스에 연결할 때는 팀 백엔드의 인증과 호출량 제한, 데이터 출처 및 답변 검증을 추가해야 합니다.
