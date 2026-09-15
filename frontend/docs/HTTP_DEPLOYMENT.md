# HTTP 배포 호환성

브라우저는 Nginx의 `/api/`를 통해 Django에 직접 로그인합니다. 기존 Bearer 토큰 흐름은 쿠키 설정과 무관하며, Next의 채팅·관리자 보조 경로에서만 httpOnly 쿠키를 사용합니다.

HTTP 전용 개발 배포에서는 서버 환경에 다음 값을 명시합니다.

```env
AUTH_COOKIE_SECURE=false
```

HTTPS에서는 `true`로 설정합니다. 값을 비우거나 잘못 입력하면 기존 `NODE_ENV` 기본값(프로덕션은 Secure, 개발은 일반 쿠키)을 유지합니다. 요청의 `Origin`, `Referer`, `X-Forwarded-Proto`로 이 값을 자동 완화하지 않습니다.

원격 HTTP에서는 브라우저 정책상 GPS, Web Share, 비동기 Clipboard API가 제한될 수 있습니다. 코스 공유는 선택 복사를 거쳐 실패 시 직접 복사할 내용을 표시하고, 로컬 UI 식별자는 `crypto.getRandomValues()` 또는 비보안 식별자 fallback을 사용합니다.
