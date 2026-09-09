import { CONTRACTS_PACKAGE_NAME } from '@duet/contracts';
import { describe, expect, it } from 'vitest';

// 통과하면 워크스페이스 링크 + tsup 산출물 + package.json exports 조건 해석 +
// vitest 모듈 해석이 모두 맞다는 뜻이다.
describe('workspace wiring', () => {
  it('resolves @duet/contracts through its built output', () => {
    expect(CONTRACTS_PACKAGE_NAME).toBe('@duet/contracts');
  });
});
