# HTTP 배포 호환성

현재 화면은 일반 HTTP 주소에서도 핀·코스 저장, 로그인, 공유, 지도 탐색이 오류로 중단되지 않도록 구성되어 있습니다.

## 배포 환경 변수

Docker Compose를 사용할 때 루트 `.env`에 공개 주소에 맞춰 다음 값을 설정합니다.

```env
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=서버IP또는도메인,backend,localhost,127.0.0.1
FRONTEND_BASE_URL=http://서버IP또는도메인
AUTH_COOKIE_SECURE=false
NEXT_PUBLIC_KAKAO_MAP_KEY=카카오_JavaScript_키
```

`AUTH_COOKIE_SECURE=auto`도 사용할 수 있습니다. Nginx가 전달하는 `X-Forwarded-Proto`가 `http`이면 일반 쿠키, `https`이면 Secure 쿠키를 발급합니다. 공개 HTTPS 전환 후에는 `true`로 고정할 수 있습니다.

카카오 Developers의 JavaScript SDK 도메인에는 사용자가 실제로 여는 전체 origin을 등록해야 합니다. 예를 들어 `http://203.0.113.10`과 `http://203.0.113.10:3000`은 서로 다른 origin입니다.

## HTTP에서 사용하는 대체 동작

- 핀·방문·코스·채팅 ID는 `crypto.randomUUID()` 대신 HTTP에서도 제공되는 `crypto.getRandomValues()`로 만듭니다.
- 코스 번호는 HTTPS 전용 Web Locks가 없으면 `localStorage` 임시 잠금으로 탭 간 할당을 직렬화합니다.
- 네이티브 공유와 비동기 클립보드가 없으면 버튼 클릭 중 선택 복사를 시도하고, 실패하면 직접 복사할 내용을 표시합니다.
- 원격 HTTP에서 브라우저가 GPS 위치를 차단하면 지도에서 현재 위치 또는 출발지를 눌러 핀으로 지정할 수 있습니다.
- 인증 쿠키의 Secure 속성은 공개 요청 프로토콜에 맞춰 정합니다.

`http://localhost`는 브라우저가 신뢰 가능한 로컬 주소로 취급할 수 있어 실제 원격 HTTP 주소와 결과가 다를 수 있습니다. 자동 GPS 위치는 브라우저 정책상 원격 HTTP에서 제공할 수 없으며, 정확한 자동 위치가 필요하면 공개 주소를 HTTPS로 전환해야 합니다.
