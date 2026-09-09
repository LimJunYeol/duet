import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Nest DI 는 design:paramtypes 메타데이터로 생성자 인자를 푼다. 이 메타데이터가
 * 테스트 트랜스폼에서 빠지면 런타임은 멀쩡한데 테스트에서만 DI 가 깨진다.
 * vitest 가 어떤 트랜스포머를 쓰든(과거 esbuild 는 미지원) 결과가 같도록 SWC 로 고정한다.
 * 플러그인 인스턴스는 프로젝트마다 새로 만든다.
 */
const nestSwc = () =>
  swc.vite({
    module: { type: 'es6' },
    jsc: {
      target: 'es2023',
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
    },
  });

export default defineConfig({
  test: {
    // 프로젝트 필터로 아직 파일이 없는 스위트(e2e)를 돌려도 실패가 아니다.
    passWithNoTests: true,
    projects: [
      {
        plugins: [nestSwc()],
        test: {
          name: 'unit',
          environment: 'node',
          include: ['{apps,packages}/*/src/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        plugins: [nestSwc()],
        test: {
          name: 'e2e',
          environment: 'node',
          include: ['{apps,packages}/*/test/**/*.e2e.test.ts'],
          passWithNoTests: true,
        },
      },
    ],
  },
});
