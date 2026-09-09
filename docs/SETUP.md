# SETUP — Claude Code 설치부터 첫 티켓까지

공식 문서(code.claude.com/docs) 2026-09 기준으로 확인한 내용. 명령이 안 맞으면 문서가 바뀐 것이니 `claude doctor`와 문서를 먼저 본다.

## 0. 준비물

| 항목 | 이유 | 확인 |
|---|---|---|
| Claude 유료 플랜(Pro/Max/Team/Enterprise) 또는 Console 계정 | 무료 플랜은 Claude Code 미포함 | — |
| Git | 워크트리·PR 워크플로우 | `git --version` |
| Node.js 22 LTS + pnpm | 프로젝트(NestJS) 실행용. Claude Code 자체는 네이티브 바이너리라 Node 불필요 | `node -v`, `pnpm -v` |
| Docker Desktop | postgres / redis / redpanda / mock-llm 컨테이너 | `docker compose version` |
| VS Code 1.94+ | 확장으로 diff 리뷰 | — |

- OS: macOS 13+, Windows 10 1809+, Ubuntu 20.04+.
- Windows는 두 가지 중 택일. **네이티브**(Git for Windows 설치 시 Bash 툴 사용 가능) 또는 **WSL2**(Linux 툴체인, 샌드박스 지원). 이 프로젝트는 docker·bash 스크립트를 많이 쓰므로 WSL2 권장. WSL 안에서 설치·실행하고 VS Code는 WSL 확장으로 붙인다.
- pnpm: `npm install -g pnpm`

## 1. Claude Code 설치

macOS / Linux / WSL:
```bash
curl -fsSL https://claude.ai/install.sh | bash
```
Windows PowerShell (프롬프트가 `PS C:\`):
```powershell
irm https://claude.ai/install.ps1 | iex
```
Windows CMD (프롬프트가 `C:\`):
```bat
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```
Homebrew를 쓰면 `brew install --cask claude-code` (자동 업데이트 안 됨, `brew upgrade claude-code`).

확인:
```bash
claude --version   # 예: 2.1.xxx (Claude Code)
claude doctor      # 설치·설정 진단
```
- 네이티브 설치는 백그라운드로 자동 업데이트. 즉시 반영은 `claude update`.
- `command not found`면 터미널을 다시 열고, 그래도 안 되면 `~/.local/bin`이 PATH에 있는지 확인.
- 안정 채널을 원하면 `~/.claude/settings.json`에 `"autoUpdatesChannel": "stable"`.

## 2. 로그인

```bash
claude            # 첫 실행 시 브라우저 로그인
claude auth status --text
```
- 세션 안에서 `/login`으로 계정 전환.
- Console(API 크레딧) 과금을 원하면 `claude auth login --console` 또는 `ANTHROPIC_API_KEY` 설정.

## 3. VS Code 확장

1. 확장 마켓에서 **Claude Code** (`anthropic.claude-code`) 설치 → 편집기 우상단 Spark 아이콘 → Sign in.
2. 확장은 자체 CLI를 내장하지만 **터미널의 `claude` 명령은 1번 설치가 따로 필요**하다.
3. 프롬프트 박스 하단이 권한 모드. Pro/Max/Team은 **Auto**가 기본(분류기가 대신 승인). **Plan** 모드는 계획을 마크다운 문서로 열어 인라인 코멘트를 달 수 있어 설계 티켓에 유용.
4. CLI와 확장은 세션 기록을 공유한다. 터미널에서 `claude --resume`.

추천 배치: 역할 세션은 **터미널**(워크트리·플래그 필요), diff 리뷰는 **확장**.

## 4. 리포 만들기 + 설계 문서 넣기

```bash
mkdir duet && cd duet
git init -b main
# duet-design.zip 을 풀어서 CLAUDE.md, docs/, .claude/agents/ 가 리포 루트에 오게 복사
```

`.gitignore`:
```
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
.claude/worktrees/
.claude/settings.local.json
load/results/raw/
```

`.worktreeinclude` (워크트리 생성 시 gitignore된 파일을 복사):
```
.env
```

`.claude/settings.json` (프로젝트 공용, 커밋):
```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(pnpm *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(docker compose *)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Bash(git push --force *)"
    ]
  }
}
```

```bash
git add -A
git commit -m "chore: design docs and Claude Code config"
# GitHub 리포 생성 후 push (gh 사용 시: gh repo create duet --private --source=. --push)
```

## 5. 첫 세션 — 문서 로딩 확인

```bash
cd duet
claude
```
- 처음 실행 시 폴더 **신뢰(trust) 다이얼로그** → Yes. `--worktree`는 이 신뢰가 먼저 있어야 동작한다.
- `/context`로 CLAUDE.md가 로드됐는지 확인.
- 첫 프롬프트:
  > CLAUDE.md와 docs/ 전체를 읽고 (1) 이 프로젝트를 5줄로 요약하고 (2) 문서 간 모순이나 빠진 정의가 있으면 목록으로 알려줘. 코드는 아직 만들지 마.
- `@`를 입력했을 때 `planner (agent)`, `backend (agent)`, `frontend (agent)`가 뜨면 서브에이전트 인식 성공.
- 자주 쓰는 키: `Shift+Tab` 권한 모드 순환 · `Esc` 중단 · `/clear` · `/compact` · `/usage` · `/model` · `/tasks` · `/help`

## 6. 역할 분담 — 실행 방법

### 6.1 한 세션 + 서브에이전트 (처음엔 이것으로)
메인 세션에서 `@`로 지목한다:
```
@agent-planner docs/ROADMAP.md 의 PL-00 을 진행해줘.
@agent-backend BE-00 을 진행해줘. 끝나면 변경 파일 목록과 요약을 줘.
```
- 자연어("planner 서브에이전트로 …")도 되지만 `@` 지목이 확실하다.
- 서브에이전트는 기본적으로 **백그라운드**로 돌고 결과만 돌아온다. `/tasks`로 진행 상황과 트랜스크립트 확인.
- 메인 세션은 서브에이전트가 읽은 파일을 모르므로, 결과에 "변경 파일 목록 + 요약"을 항상 요구한다.

### 6.2 병렬 세션 = 워크트리 (FE/BE 동시 작업)
터미널 1 (백엔드):
```bash
claude -w BE-14 -n BE-14 --append-system-prompt-file .claude/agents/backend.md
```
터미널 2 (프론트):
```bash
claude -w FE-10 -n FE-10 --append-system-prompt-file .claude/agents/frontend.md
```
- `-w <name>`: `.claude/worktrees/<name>/`에 `worktree-<name>` 브랜치로 격리 체크아웃. 두 세션의 파일이 섞이지 않는다.
- `-n <name>`: 세션 이름. 나중에 `claude -r BE-14`로 재개.
- `--append-system-prompt-file`: 기본 시스템 프롬프트를 **유지한 채** 역할 규칙을 덧붙인다. `claude --agent backend`는 기본 프롬프트를 통째로 교체하는 방식이라 처음엔 append를 권장.
- 워크트리는 새 체크아웃이라 `pnpm i`가 필요하다. `.env`는 `.worktreeinclude`로 자동 복사된다.
- docker 인프라(`pnpm infra:up`)는 **메인 체크아웃에서 한 번만** 띄운다. 워크트리들은 같은 컨테이너를 공유하므로, e2e는 한 번에 한 세션만 돌린다.
- 세션 종료 시 워크트리 유지/삭제를 묻는다. PR 머지 후 삭제.
- 첫 프롬프트 예:
  > docs/ROADMAP.md 에서 BE-14 를 찾아 진행해. 구현 전에 접근 / 실패 경로 / 테스트 계획을 5줄로 먼저 적어.

### 6.3 데스크톱 앱
세션마다 워크트리가 자동으로 생긴다. 터미널보다 GUI가 편하면 이쪽.

## 7. 티켓 루프 (매 티켓 동일)

1. **계획**: `Shift+Tab`으로 Plan 모드 → "BE-17 계획 세워줘" → 계획을 읽고 고칠 것 지적 → 승인
2. **구현**: Auto 모드. 방향이 틀리면 `Esc`로 끊고 수정 지시
3. **검증**: "pnpm lint && pnpm typecheck && pnpm test 돌리고 실패만 요약해줘"
4. **리뷰**: `git diff`를 **본인이** 읽는다. CLAUDE.md의 "직접 소유 코드"는 라인 단위로.
   > 이 변경에서 내가 면접에서 설명해야 할 설계 판단 3개와, 고려했던 대안을 말해줘
5. **문서**: "DoD 체크리스트대로 갱신할 docs 가 있는지 확인하고, 설계 판단이 있었으면 docs/adr 에 ADR 써줘"
6. **커밋/PR**: "PR 본문 초안(무엇을 / 왜 / 어떻게 검증)을 써줘" → 커밋 → push → PR
7. 다음 티켓 전 `/clear`. 한 티켓이 길어지면 `/compact`.

## 8. M0 시작 프롬프트 (복붙용)

메인 세션(리포 루트)에서 순서대로:

1. Plan 모드에서
   > CLAUDE.md, docs/ROADMAP.md 의 M0 섹션, docs/ARCHITECTURE.md §1 을 읽어. BE-00(모노레포 스캐폴딩)을 계획해줘. 스택은 CLAUDE.md 고정값 그대로.
2. 승인 후
   > 계획대로 진행해. 끝나면 lint/typecheck/test 결과와 생성된 파일 트리를 보여줘.
3. > BE-01: infra/docker-compose.yml(postgres 16, redis 7, redpanda; mock-llm 은 빈 서비스 자리만), .env.example, 그리고 pnpm 스크립트를 CLAUDE.md "자주 쓰는 명령"과 정확히 일치시켜. 불일치하면 CLAUDE.md 를 고치고 이유를 말해.
4. > @agent-planner PL-00: docs/PRD.md 검토, 캐릭터 3명 페르소나 초안(전원 성인, PRD §7 준수), 골든셋 10개를 eval/golden/ 에 jsonl 로. 코드는 쓰지 마.
5. > BE-02: packages/contracts 에 docs/API.md 와 docs/EVENTS.md 의 스키마를 zod 로 정의해. 스키마마다 예시 fixture 와 파싱 테스트를 붙여.
6. > BE-03: apps/api 골격 — config 모듈, pino, trace_id 미들웨어, /health, /metrics, 전역 에러 필터(docs/API.md 에러 포맷). e2e 로 /health 200 을 확인해.

M0 DoD: `pnpm infra:up && pnpm -F @duet/api dev` 후 `curl localhost:3000/health` 가 ok. CI 초록.

## 9. 사용량·비용

- `/usage`: 플랜 한도와 무엇이 사용량을 끌어올리는지(서브에이전트, 긴 컨텍스트) 확인.
- 절약: 티켓마다 `/clear`, 반복 구현은 `/model`로 Sonnet, 설계·리뷰만 상위 모델. 서브에이전트 병렬 실행은 사용량을 빨리 소모한다.
- Pro로 시작하고, M1 중반에 한도에 자주 걸리면 Max를 검토.

## 10. 자주 겪는 문제

| 증상 | 원인 / 해결 |
|---|---|
| `claude: command not found` | 터미널 재시작 → `~/.local/bin` PATH 확인 → `claude doctor` |
| Windows 설치 명령 오류 | PowerShell(`PS C:\`)과 CMD(`C:\`) 명령이 다르다 |
| Bash 대신 PowerShell로 명령이 돈다 | Git for Windows 설치 (또는 WSL2) |
| `--worktree`가 신뢰 오류로 종료 | 리포 루트에서 `claude`를 한 번 실행해 trust 수락 |
| `@`에 서브에이전트가 안 뜬다 | 세션 시작 후에 `.claude/agents/`를 새로 만든 경우 → 세션 재시작 |
| 확장은 설치했는데 터미널 `claude`가 없다 | 확장은 PATH에 추가하지 않는다. 1번 설치 |
| 워크트리에 `.env`가 없다 | `.worktreeinclude` 확인 |
| 워크트리에서 e2e 실패 | 인프라를 메인 체크아웃에서 띄웠는지, 다른 세션이 e2e 중인지 |
| 컨텍스트가 꽉 찼다 | `/compact` 또는 티켓 단위 `/clear` |
| 설정이 반영 안 된다 | `/context`, `/doctor`로 실제 로드된 것 확인 |
