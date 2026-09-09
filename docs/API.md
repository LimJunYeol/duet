# API — Duet v1

## 공통
- Base `/v1` · JSON · UTF-8
- 인증: `Authorization: Bearer <jwt>` (dev-login 발급). 미인증 401.
- 트레이스: 응답 헤더 `x-trace-id`. 요청에 같은 헤더를 보내면 수용한다.
- 시간: ISO 8601 UTC · ID: UUID v7 문자열 · seq: 세션 내 정수(1부터)
- 에러 포맷
  ```json
  { "error": { "code": "RATE_LIMITED", "message": "사람이 읽을 메시지", "details": {} } }
  ```
- 커서 페이지네이션: `?cursor=<seq>&limit=50` → `{ "items": [...], "nextCursor": 123 | null }`. seq 내림차순(최신 먼저). cursor 는 "이 seq 미만"을 의미.
- 레이트리밋 헤더: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, 429 시 `Retry-After`
- 스키마의 진실은 `packages/contracts/src/api/*.ts`(zod). 이 문서와 어긋나면 contracts 기준으로 문서를 고친다.

## 에러 코드
| code | HTTP | 의미 |
|---|---|---|
| VALIDATION_FAILED | 400 | 입력 스키마 위반 (details.issues) |
| MODERATION_BLOCKED | 400 | 입력 정책 위반 (details.categories) |
| UNAUTHORIZED | 401 | 토큰 없음/무효 |
| FORBIDDEN | 403 | 남의 세션 |
| NOT_FOUND | 404 | |
| GENERATION_IN_PROGRESS | 409 | 세션에 진행 중 생성 있음 (details.assistantMessageId) |
| GENERATION_NOT_STREAMABLE | 409 | 이어볼 수 없는 상태 |
| RATE_LIMITED | 429 | 분당 한도 |
| DAILY_LIMIT | 429 | 플랜 일일 한도 (details.resetAt) |
| PROVIDER_UNAVAILABLE | 503 | 첫 토큰 전 재시도·폴백 소진 |

## 엔드포인트

### 인증 (dev 전용, 프로덕션 빌드에서 비활성)
`POST /v1/auth/dev-login`
```json
{ "handle": "junyeol", "plan": "free", "locale": "ko" }
```
→ `200 { "token": "...", "user": { "id", "handle", "plan", "locale" } }`

### 캐릭터
`GET /v1/characters` → `{ "items": [Character] }`
`GET /v1/characters/{slug}` → `Character`
```json
Character {
  "id": "...", "slug": "mina", "name": "미나", "tagline": "장난스러운 카페 사장",
  "avatarEmoji": "☕", "locale": "ko", "openingLine": "어서 와, 오늘은 뭐 마실래?",
  "activePromptVersion": 3
}
```

### 세션
`POST /v1/sessions` `{ "characterSlug": "mina", "locale": "ko" }` → `201 Session`
`GET /v1/sessions?limit=20&cursor=` → 내 세션 목록 (lastMessageAt desc, cursor = lastMessageAt ISO)
`GET /v1/sessions/{id}` → `Session`
```json
Session {
  "id": "...", "characterSlug": "mina", "promptVersionId": "...", "locale": "ko",
  "title": null, "status": "active", "hasSummary": false,
  "lastMessageAt": "2026-09-09T12:00:00.000Z", "createdAt": "..."
}
```

### 메시지
`GET /v1/sessions/{id}/messages?cursor=&limit=50` → `{ "items": [Message], "nextCursor": 123 }`
```json
Message {
  "id": "...", "seq": 13, "role": "assistant",
  "content": "응, 많이 힘들었어?",
  "status": "complete",           // queued | streaming | complete | partial | aborted | failed
  "isRedacted": false,            // true 면 content 는 "[removed]"
  "createdAt": "...",
  "meta": { "model": "...", "ttftMs": 412, "latencyMs": 1830, "tokensIn": 812, "tokensOut": 23 } // assistant 만
}
```

`POST /v1/sessions/{id}/messages` — 메시지 전송. **응답은 SSE**
```json
{ "content": "오늘 좀 피곤해", "idempotencyKey": "9b3c8f2e-...." }
```
- 요청 헤더 `Accept: text/event-stream` 필수 (없으면 406).
- 성공: `200 text/event-stream` (아래 SSE 규격).
- 검증·한도·모더레이션 실패는 SSE 시작 전에 JSON 에러로 응답.
- 같은 idempotencyKey 재전송: 새 생성 없이 기존 assistant 메시지 스트림에 attach (M2). M1에서는 완료된 경우 `done` 1건, 진행 중이면 409 GENERATION_IN_PROGRESS.

`GET /v1/sessions/{id}/messages/{assistantMessageId}/stream` — 이어보기 / attach (M2)
- `Last-Event-ID: <seq>` 로 재개 지점 지정. 없으면 처음부터 재전송.
- 이어볼 수 없으면 409 GENERATION_NOT_STREAMABLE.

`POST /v1/sessions/{id}/messages/{assistantMessageId}/abort` → `202 { "status": "aborting" }` (M2)
- 이미 종료된 생성이면 200 과 현재 status.

### 사용량
`GET /v1/me/usage` → `{ "date": "2026-09-09", "plan": "free", "messagesUsed": 12, "messagesLimit": 50, "resetAt": "..." }`

### 운영 (admin 토큰, M3)
- `POST /v1/admin/characters` · `POST /v1/admin/characters/{id}/prompt-versions` · `POST /v1/admin/prompt-versions/{id}/activate`
- `GET /v1/admin/reviews?status=pending` · `POST /v1/admin/reviews/{id}/decision` `{ "decision": "approved" | "removed", "decisionId": "uuid" }` (선택)

### 시스템
`GET /health` → `{ "status": "ok", "checks": { "postgres": "ok", "redis": "ok", "kafka": "ok" } }` (하나라도 실패면 503)
`GET /metrics` → Prometheus 텍스트

## SSE 규격
- 헤더: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`
- 15초마다 `: keepalive` 코멘트 프레임
- 이벤트 순서: `meta` 1회 → `delta` 0..n → (`done` | `error`) 1회 → 연결 종료

```
event: meta
data: {"userMessageId":"...","assistantMessageId":"...","traceId":"...","model":"...","promptVersionId":"..."}

id: 1
event: delta
data: {"seq":1,"text":"응, "}

id: 2
event: delta
data: {"seq":2,"text":"많이 힘들었어?"}

event: done
data: {"assistantMessageId":"...","status":"complete","content":"응, 많이 힘들었어?","finishReason":"stop","usage":{"tokensIn":812,"tokensOut":23},"ttftMs":412,"latencyMs":1830}

event: error
data: {"code":"PROVIDER_TIMEOUT","message":"...","assistantMessageId":"...","status":"partial","partialContent":"응, 많이"}
```
- `id:`는 delta seq. 클라이언트는 마지막 id를 저장했다가 재접속 시 `Last-Event-ID`로 보낸다.
- `done.content`는 항상 최종본. 클라이언트는 누적 텍스트를 이것으로 덮어쓴다.
- `error` 후 스트림은 닫힌다. status가 partial/aborted면 저장된 부분 응답이 히스토리에 남는다.
- `finishReason`: `stop | length | aborted | provider_error | safety`
- 클라이언트 메모: POST 응답 SSE는 `EventSource`로 읽을 수 없다. `fetch` + `ReadableStream`으로 파싱한다 (`apps/web/src/lib/sse.ts`). GET resume은 `EventSource` 사용 가능.
