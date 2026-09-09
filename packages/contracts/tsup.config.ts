import { defineConfig } from 'tsup';

// CJS 소비자(apps/api, worker, mock-llm)와 ESM 소비자(apps/web)를 한 산출물로 덮는다.
// 근거: docs/adr/0008-internal-package-consumption.md
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
});
