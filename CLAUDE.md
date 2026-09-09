# Duet — 캐릭터 AI 챗 백엔드 (사이드 프로젝트)

## 한 줄 요약
유저가 캐릭터를 골라 실시간 스트리밍으로 대화하는 AI 챗 서비스.
목표는 기능 수가 아니라 **"대규모 실시간 트래픽을 견디는 LLM 챗 백엔드"의 설계 판단과 실측 수치**를 남기는 것.
(타겟: 큐피스트 닷닷닷팀 백엔드 포지션 — 스트리밍, TPS, 메시지 큐, AI Harness)

## 작업 전 반드시 읽을 문서
| 문서 | 내용 |
|---|---|
| docs/PRD.md | 왜/무엇을 만드는지, 스코프·비스코프, 비기능 목표 수치, 안전 정책 |
| docs/ARCHITECTURE.md | 구성요소, 요청 흐름, 신뢰성·가드레일·관측 설계, ADR 요약 |
| docs/API.md | REST + SSE 계약 (FE/BE 공통 기준) |
| docs/DATA_MODEL.md | 테이블·인덱스·제약, Redis 키 |
| docs/EVENTS.md | Kafka 토픽·이벤트 계약, 컨슈머 의미론 |
| docs/ROADMAP.md | 마일스톤, 티켓, 완료 기준(DoD) |
| docs/SETUP.md | Claude Code 설치·세션 운영·티켓 루프 (사람용 가이드) |

티켓 작업 순서: ROADMAP의 티켓 → 관련 docs 섹션 → 기존 코드.

## 기술 스택 (고정. 바꾸려면 docs/adr/ 에 ADR 먼저)
- TypeScript strict, Node.js 22 LTS, pnpm workspaces
- API: NestJS 11 (REST + SSE). 입력 검증은 zod (packages/contracts 공유 스키마)
- DB: PostgreSQL 16, Drizzle ORM + drizzle-kit 마이그레이션. 핫패스는 생성되는 SQL을 그대로 읽을 수 있게 작성
- Redis 7 (ioredis): 레이트리밋, 세션 락, 스트리밍 버퍼(Redis Stream), 사용량 카운터
- Kafka (로컬은 Redpanda), 클라이언트 kafkajs
- LLM: OpenAI 호환 Chat Completions 스트리밍. `LlmProvider` 인터페이스 뒤에 두고 mock/real 교체
- 관측: pino 구조화 로그 + prom-client 메트릭 + trace_id (AsyncLocalStorage)
- 테스트: vitest(unit), supertest(e2e). 외부 I/O는 fake 구현체
- 프론트: Vite + React + TypeScript (기능 확인용 최소 UI)
- 부하: apps/mock-llm + load/ (undici SSE 러너, k6)

## 저장소 구조
```
apps/api           NestJS API (REST, SSE, generation 파이프라인)
apps/worker        Kafka 컨슈머 (usage 집계, 출력 모더레이션, 요약 메모리)
apps/web           최소 프론트
apps/mock-llm      지연·속도·오류율 설정 가능한 OpenAI 호환 스트리밍 스텁
packages/contracts zod 스키마 + 타입 (REST/SSE/Kafka 이벤트) — 유일한 계약 소스
packages/eval      골든셋 기반 프롬프트 평가 CLI (LLM-as-judge)
load/              부하 테스트 스크립트와 결과(load/results)
infra/             docker-compose, (M5) AWS
docs/              설계 문서, docs/adr/ 설계 결정 기록
```

## 자주 쓰는 명령
```
pnpm i
pnpm infra:up            # postgres, redis, redpanda, mock-llm
pnpm db:migrate && pnpm db:seed
pnpm -F @duet/api dev    # :3000
pnpm -F @duet/worker dev
pnpm -F @duet/web dev    # :5173
pnpm test | pnpm test:e2e | pnpm lint | pnpm typecheck
pnpm build                     # packages/contracts 산출물 (typecheck·test가 자동 선행)
pnpm -F @duet/contracts dev    # 계약을 고치며 작업할 때 tsup --watch
pnpm eval -- --character mina --versions 1,2
pnpm load:smoke          # mock-llm 대상 소규모 부하
```
M0에서 실제 스크립트로 확정한다. 이 목록과 package.json이 어긋나면 이 파일을 고친다.

## 코드 원칙 — "이해하기 쉬운, 실수하기 어려운"
1. 모듈 경계 = 도메인 경계: `characters / sessions / chat(context) / generation / moderation / usage / events`.
   모듈 간 호출은 서비스 인터페이스로만. 다른 모듈의 리포지토리 직접 참조 금지.
2. 상태는 enum + 명시적 전이 함수. 문자열 상태값 하드코딩 금지
   (`message.status = 'partial'` 금지 → `transition(current, 'PROVIDER_FAILED')`).
3. 외부 I/O(LLM, Kafka, Redis, 시계)는 인터페이스 뒤에. 테스트는 fake 구현체로. 네트워크 mock 라이브러리 남용 금지.
4. 실패 경로가 먼저. 새 I/O를 추가하면 타임아웃·재시도 가능 여부·실패 시 저장 상태를 코드에서 읽을 수 있어야 한다.
5. 숫자는 전부 `config/`에. 타임아웃, 한도, 버퍼 TTL 등 매직 넘버 금지.
6. 주석은 "왜"만. "무엇"은 이름과 타입으로 설명한다.
7. 함수 40줄, 파일 300줄을 넘으면 분리를 검토한다.
8. 로그는 이벤트 이름 + 구조화 필드. 문자열 포맷 로그 금지.

## 계약 변경 절차 (FE/BE 협업 규칙)
1. `packages/contracts` 스키마 변경 + `docs/API.md`(또는 `docs/EVENTS.md`) 갱신 — 같은 PR
2. BE 구현 + 계약 테스트(응답이 스키마를 통과하는지)
3. FE 반영
계약과 다른 응답을 내보내는 코드는 기능이 아니라 버그다.

## Definition of Done (모든 티켓 공통)
- [ ] 단위 테스트, 필요한 경우 e2e
- [ ] `pnpm lint && pnpm typecheck && pnpm test` 통과
- [ ] 관련 docs 갱신 (API / DATA_MODEL / EVENTS / ARCHITECTURE)
- [ ] 설계 판단이 있었다면 `docs/adr/NNNN-제목.md` (10줄 이내도 OK)
- [ ] 새 실패 경로가 로그·메트릭에 드러남
- [ ] PR 본문에 "무엇을 / 왜 / 어떻게 검증했는지"

## 하지 말 것
- 결제, 소셜 로그인, 푸시 알림, 이미지 생성, UI 꾸미기
- 실제 LLM API로 부하 테스트 (반드시 apps/mock-llm)
- 시크릿 커밋. `.env`는 `.env.example`만 커밋
- 계약(contracts) 우회 응답, 문서 없는 스키마 변경
- 미성년자·성적 콘텐츠 관련 캐릭터/프롬프트. 모든 캐릭터는 성인. 안전 정책은 docs/PRD.md §7

## 역할 분담 (서브에이전트, .claude/agents/)
- `planner` — 요구사항 → 유저스토리·수용기준·계약 변경안·골든셋. 코드는 쓰지 않는다.
- `backend` — apps/api, apps/worker, apps/mock-llm, packages/contracts, packages/eval, load/
- `frontend` — apps/web. contracts는 읽기만.
한 티켓 = 한 브랜치 = 한 PR. 티켓 ID를 브랜치·커밋에 붙인다 (`feat/BE-17-generation-pipeline`).

## 사람이 직접 읽고 소유해야 하는 코드 (면접 대비)
아래는 생성 후 반드시 라인 단위로 읽고 이해하며, 필요하면 직접 고친다. 설명할 수 없는 코드는 머지하지 않는다.
- `apps/api/src/generation/**` — 스트리밍 루프, 타임아웃, 부분 저장, 중단
- `apps/api/src/chat/context-builder.ts` — 토큰 예산 배분, 요약 트리거
- `apps/api/src/generation/stream-buffer.ts` — Redis Stream 버퍼와 이어보기
- `apps/worker/src/consumers/**` — 멱등 처리, 재시도, DLQ
- `packages/contracts/src/{sse,events}.ts` — 계약
- `load/results/*.md` — 수치의 측정 조건
