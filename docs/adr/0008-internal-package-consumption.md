# ADR-0008 내부 패키지(@duet/contracts)는 빌드 산출물로 소비한다

- 날짜: 2026-09-10 · 상태: 채택
- 티켓: BE-00

## 맥락

`packages/contracts` 는 apps/api·worker(CJS, NestJS)와 apps/web(ESM, Vite) 양쪽이 함께 쓴다.
모노레포 내부 패키지를 TS 소스 그대로 소비하면 설정이 줄지만, 실행 시점에 누가 `.ts` 를
JS 로 바꾸는지가 불분명해진다.

## 결정

tsup 으로 ESM + CJS + `.d.ts`/`.d.cts` 를 빌드하고, 소비자는 `dist` 만 본다.
`exports` 조건 분기로 CJS 소비자와 ESM 소비자를 함께 지원한다.

## 대안과 기각 이유

- **대안 A — TS 소스 직접 소비 (`main`/`types` → `src/index.ts`)** — 기각.
  `nest start`(tsc/SWC)도 `nest build`도 `node_modules` 아래 파일을 컴파일·emit 하지 않는다.
  따라서 dev(`pnpm -F @duet/api dev`)와 prod(`node dist/main.js`) 양쪽에서 런타임 require 가
  `.ts` 를 직접 만나 **Node 타입 스트리핑에 의존**하게 된다. Node 22.23.2 는
  `process.features.typescript === 'strip'` 으로 기능이 켜져 있지만, node 바이너리에
  `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`("Stripping types is currently unsupported for
  files under node_modules", 판정은 `url.includes('/node_modules/')`)이 있어 pnpm 심링크를
  realpath 로 푸는 순서에 결과가 걸린다. enum·parameter property 를 쓰면
  `--experimental-transform-types` 가 추가로 필요하다. 배포 산출물의 실행 가능 여부를
  실험적 기능에 걸 이유가 없다.
- **대안 B — tsc project references (`tsc -b`)** — 기각. composite·declarationMap 설정이
  패키지마다 늘고 `-b` 와 `--noEmit` 조합에 제약이 있다. 패키지 6개 규모에서는
  tsup 설정 한 파일이 더 짧고 설명하기 쉽다.

## 결과

- 얻는 것: dev/prod 실행 경로가 동일하고, M5 Docker 이미지에서 `dist` 를 그대로 복사할 수 있다.
  타입도 CJS(`.d.cts`)/ESM(`.d.ts`)이 분리돼 `moduleResolution: Node16` 소비자가 정상 해석된다.
- 잃는 것: contracts 를 고칠 때 빌드가 필요하다. 루트 `typecheck`/`test` 는 앞에
  `build:contracts` 를 붙여 낡은 산출물로 인한 유령 에러를 막고, 연속 작업 시에는
  `pnpm -F @duet/contracts dev`(tsup --watch)를 띄운다.
- 다시 검토할 조건: 내부 패키지가 늘어 빌드 팬아웃이 아프면 project references 재검토.

## 부록: TypeScript 5.x 핀

설치 시점의 최신은 TypeScript 7(네이티브 포트)이지만, tsup 의 `.d.ts` 생성(rollup-plugin-dts)이
크래시하고 typescript-eslint 8.x 가 `>=4.8.4 <6.1.0` 를 요구한다. NestJS 11 도 5.x 기준이다.
따라서 `typescript@^5.9` 로 핀한다. 위 도구들이 TS 7 을 지원하면 올린다.
