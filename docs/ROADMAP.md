# ROADMAP — 6주

원칙: 매 마일스톤 끝에 "동작하는 것 + 문서 + 수치 또는 테스트"가 남는다. 다음 마일스톤 시작 전에 이전 DoD를 전부 닫는다.
티켓 접두사: PL(planner) / BE(backend) / FE(frontend). 한 티켓 = 한 브랜치 = 한 PR.
티켓 본문은 `.claude/agents/planner.md`의 템플릿(목적/범위/비범위/수용 기준/면접 포인트/문서)을 따른다.

## M0 · 스캐폴딩 (2~3일)
| 티켓 | 담당 | 내용 |
|---|---|---|
| BE-00 | backend | pnpm 워크스페이스, tsconfig strict, eslint/prettier, vitest, GitHub Actions(lint/typecheck/test) |
| BE-01 | backend | `infra/docker-compose.yml`(postgres, redis, redpanda, mock-llm 자리), `.env.example`, pnpm 스크립트를 CLAUDE.md와 일치 |
| BE-02 | backend | `packages/contracts` 초기: Character/Session/Message/SSE 이벤트/에러 zod 스키마 |
| BE-03 | backend | `apps/api` 골격: config 모듈, pino, trace_id 미들웨어, `/health`, `/metrics`, 전역 에러 필터(에러 포맷) |
| FE-00 | frontend | `apps/web` 골격(Vite React TS), contracts 참조, dev-login 화면 |
| PL-00 | planner | PRD 검토·확정, 캐릭터 3명 페르소나 초안(성인 · 안전 정책 준수), 골든셋 10개 초안 |

**DoD**: `pnpm infra:up && pnpm -F @duet/api dev` 후 `/health` ok. CI 초록. 모든 스크립트가 CLAUDE.md 목록과 일치.

## M1 · 핵심 흐름 (1~2주차)
| 티켓 | 담당 | 내용 | 면접 포인트 |
|---|---|---|---|
| BE-10 | backend | DB 스키마·마이그레이션·시드 (DATA_MODEL.md) | seq 채번, 부분 유니크 인덱스 |
| BE-11 | backend | dev-login JWT, 인증 가드, 세션 소유권 검사 | |
| BE-12 | backend | characters 조회 API | |
| BE-13 | backend | sessions 생성/목록/상세 (prompt_version 고정, opening_line을 seq 1 assistant로 삽입) | 프롬프트 버전 핀 |
| BE-14 | backend | messages 히스토리 커서 페이지네이션 | 오프셋 vs 커서 |
| BE-15 | backend | `LlmProvider` 인터페이스 + OpenAI 호환 스트리밍 구현 + `FakeLlmProvider`(스크립트된 델타·지연·오류) | 어댑터 경계 |
| BE-16 | backend | ContextBuilder(토큰 예산, js-tiktoken) + 단위 테스트 | 예산 배분 |
| BE-17 | backend | Generation 파이프라인 v1: 락, 삽입 tx, 스트리밍 루프, 타임아웃 3종, 첫 토큰 전 재시도·폴백, 상태 전이, 완료 저장 | **핵심** |
| BE-18 | backend | SSE 컨트롤러(meta/delta/done/error, keepalive, disconnect 감지) + e2e(fake provider) | SSE 프레이밍 |
| FE-10 | frontend | 캐릭터 목록 → 세션 생성 → 채팅 화면 진입 | |
| FE-11 | frontend | POST SSE 파서(fetch + ReadableStream), 스트리밍 버블, done 덮어쓰기, error 표시 | |
| FE-12 | frontend | 히스토리 무한 스크롤(커서), 새로고침 후 세션 복원 | |
| PL-10 | planner | BE-17 수용 기준(Given-When-Then) 10개 이상 작성 — 타임아웃/재시도/폴백/전이 | |

**DoD**: 실제 LLM(또는 mock)으로 대화가 스트리밍되고 새로고침해도 이어진다. 핵심 경로 e2e 통과. ADR 0001~0003 작성.

## M2 · 안정성 (3주차)
| 티켓 | 담당 | 내용 | 면접 포인트 |
|---|---|---|---|
| BE-20 | backend | Redis Stream 델타 버퍼 + SSE 핸들러를 XREAD tail 방식으로 전환 | 진화 이유 |
| BE-21 | backend | GET stream 이어보기(Last-Event-ID), TTL 만료 시 DB 폴백 | resume 설계 |
| BE-22 | backend | abort 엔드포인트 + 생성기 중단(AbortController) + partial 저장 | |
| BE-23 | backend | 멱등성 키: 중복 POST는 기존 생성에 attach | 멱등 |
| BE-24 | backend | 레이트리밋(Lua 토큰 버킷) + 일일 한도 + 응답 헤더 | 원자성 |
| BE-25 | backend | Kafka 프로듀서(엔벨로프, 헤더 trace) + `message.created` / `generation.completed` 발행 | 파티션 키 |
| BE-26 | backend | `apps/worker` 골격 + worker.usage + processed_events 멱등 + DLQ + 랙 메트릭 + graceful shutdown | at-least-once |
| FE-20 | frontend | 끊김 시 자동 재접속(EventSource GET resume), 중단 버튼, 429 안내, 사용량 표시 | |
| PL-20 | planner | 장애 시나리오 목록(프로바이더 hang·중간 오류·클라이언트 이탈·중복 클릭·한도 초과) → e2e 케이스 | |

**DoD**: 장애 시나리오 e2e 전부 통과. api 프로세스 2개를 띄워도 resume/attach 동작. ADR 0004~0007 작성.

## M3 · AI Harness (4주차)
| 티켓 | 담당 | 내용 | 면접 포인트 |
|---|---|---|---|
| BE-30 | backend | 입력 모더레이션(룰 엔진 + 선택 분류기, fail-open, 메트릭) | 실패 정책 |
| BE-31 | backend | 출력 스트리밍 룰 필터(문장 버퍼) → safety 중단 | fail-closed |
| BE-32 | backend | worker.moderation(사후 판정, is_redacted, review_items) | 비동기 검수 |
| BE-33 | backend | 요약 메모리: 트리거 + `summary.requested` + worker.summary(낙관적 락) + ContextBuilder 반영 | 메모리 |
| BE-34 | backend | 프롬프트 버전 admin API + 활성화 | |
| BE-35 | backend | `packages/eval` CLI: 골든셋 러너, judge 루브릭, 리포트, CI 게이트 | 평가 게이트 |
| BE-36 | backend | (선택) 리뷰 큐 Prepare → Commit API | HITL |
| PL-30 | planner | 골든셋 30개 이상(캐릭터별 10, 안전 케이스 포함), judge 루브릭 문구 | |
| FE-30 | frontend | redacted 표시, 차단 안내, 요약 존재 표시 | |

**DoD**: 프롬프트 v2를 만들고 eval로 v1 vs v2 리포트 생성. 골든셋 안전 케이스 100% 차단.

## M4 · 성능 (5주차)
| 티켓 | 담당 | 내용 |
|---|---|---|
| BE-40 | backend | `apps/mock-llm`: `TTFT_MS`, `TOKENS_PER_SEC`, `TOKENS`, `ERROR_RATE`, `HANG_RATE` 환경변수, OpenAI 호환 스트리밍 |
| BE-41 | backend | `db:seed:perf`(100만 행) + 히스토리 쿼리 EXPLAIN 전후, 인덱스 결정 |
| BE-42 | backend | `load/`: undici SSE 러너(TTFT·총지연·오류율 퍼센타일) + k6(REST) + 결과 표 자동 생성 |
| BE-43 | backend | 100 → 500 → 1,000 동시 세션 측정, 병목 1개 이상 개선(전후 수치), api 2인스턴스 측정 |
| PL-40 | planner | `docs/PERF.md` 구성: 조건 · 커밋 · 수치 · 해석 · 한계 |

**DoD**: PRD §5 목표 달성 여부가 표로 있음(미달이면 원인 분석 포함).

## M5 · 배포·정리 (6주차)
| 티켓 | 담당 | 내용 |
|---|---|---|
| BE-50 | backend | AWS: ECS Fargate(api, worker), RDS Postgres, ElastiCache, Redpanda on EC2(단일 노드). 비용 상한, 데모 후 정리 스크립트 |
| BE-51 | backend | README: 아키텍처, 설계 판단 5개, 수치, 실패 사례, 개발 워크플로우(Claude Code 역할 분담) |
| PL-50 | planner | 이력서 Projects 문단, 면접 예상 질문 15개와 답 초안 |

**DoD**: 공개 URL에서 데모 1회 녹화. README만 읽고 시스템을 설명할 수 있음.

## 지원 타이밍
저연차 공고가 뜨는 시점에 최소 M2 종료 상태여야 한다. M2 종료 시점의 README + 수치(M4 일부라도)로 먼저 지원하고, 이후 마일스톤은 면접 전까지 계속 채운다.
