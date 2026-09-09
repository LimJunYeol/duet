# EVENTS — Kafka 계약

## 토픽
| 토픽 | 키 | 파티션(로컬) | 프로듀서 | 컨슈머(그룹) |
|---|---|---|---|---|
| `chat.message.created` | session_id | 3 | api | worker.usage (M2) |
| `chat.generation.completed` | session_id | 3 | api | worker.usage (M2), worker.moderation (M3) |
| `chat.summary.requested` | session_id | 3 | api | worker.summary (M3) |
| `chat.dlq` | 원본 키 | 1 | worker | 없음 (수동 조사·재발행) |
- 파티션 키 = session_id → 세션 내 순서 보장 (ADR 0004).
- 보존: 로컬 7일. 페이로드 `version` 필드로 호환성 관리.

## 엔벨로프 (`packages/contracts/src/events.ts`)
```json
{
  "eventId": "uuid v7",
  "type": "chat.generation.completed",
  "version": 1,
  "occurredAt": "2026-09-09T12:00:00.000Z",
  "traceId": "uuid",
  "key": "session-uuid",
  "payload": {}
}
```
Kafka 헤더: `trace-id`, `event-type`, `schema-version`. 페이로드는 JSON. 프로듀서는 발행 전, 컨슈머는 소비 후 zod로 검증하고, 실패는 DLQ.

## 페이로드
### `chat.message.created` v1
```json
{ "sessionId": "...", "userId": "...", "messageId": "...", "seq": 12, "contentLength": 9, "locale": "ko" }
```
원문은 싣지 않는다 (개인정보 최소화, 컨슈머는 DB에서 읽는다).

### `chat.generation.completed` v1
```json
{ "sessionId": "...", "userId": "...", "assistantMessageId": "...", "replyToSeq": 12,
  "status": "complete", "finishReason": "stop", "model": "...", "promptVersionId": "...",
  "tokensIn": 812, "tokensOut": 23, "ttftMs": 412, "latencyMs": 1830 }
```
status가 `complete | partial | aborted | failed` 모두 발행한다 (실패도 집계·관측 대상).

### `chat.summary.requested` v1
```json
{ "sessionId": "...", "fromSeq": 21, "toSeq": 44, "sessionVersion": 3 }
```

## 컨슈머 의미론
- **at-least-once**. 모든 핸들러는 멱등: `processed_events (event_id, consumer)` INSERT가 성공할 때만 처리하고, 처리와 INSERT는 같은 DB 트랜잭션.
- **순서**: 같은 세션의 이벤트는 같은 파티션. 컨슈머는 파티션 내 순차 처리(파티션당 동시성 1).
- **실패**: 핸들러 예외 → 지수 백오프 재시도 3회(프로세스 내) → `chat.dlq`로 원본 + 오류 + 시도 횟수 발행 → 오프셋 커밋. 포이즌 메시지가 파티션을 막지 않게 한다.
- **오프셋 커밋**: 처리 완료 후 수동 커밋. 배치 처리는 하지 않는다(단순함 우선). 처리량은 PERF.md에서 측정 후 재검토.
- **재처리**: `pnpm events:replay --from dlq` 스크립트로 수동 재발행.
- **랙 관측**: 컨슈머가 주기적으로 `highWatermark − committedOffset`을 `duet_consumer_lag{topic}`으로 노출.
- **셧다운**: SIGTERM 시 진행 중 메시지 처리 완료 → 커밋 → 종료. 처리 중단 시에도 멱등성 덕분에 재처리 안전.

## 각 컨슈머
| 컨슈머 | 입력 | 처리 | 쓰기 |
|---|---|---|---|
| worker.usage | message.created, generation.completed | 유저·일 단위 메시지 수/토큰 UPSERT | usage_daily |
| worker.moderation | generation.completed (status complete\|partial) | 분류 모델 호출(타임아웃 5s) → verdict → severe면 redact + 리뷰 항목 | moderation_events, messages.is_redacted, review_items |
| worker.summary | summary.requested | 메시지 조회 → 요약 생성 → 낙관적 락 UPDATE (version 불일치면 폐기) | sessions.summary, summary_upto_seq, version |

## 스키마 변경 규칙
- 필드 추가는 같은 version. 의미 변경·삭제는 version+1 → 컨슈머가 두 버전 모두 처리 → 프로듀서 전환 → 구버전 처리 제거.
- 토픽 이름은 바꾸지 않는다. 새 의미는 새 토픽.
