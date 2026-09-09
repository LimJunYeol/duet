import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

class Dependency {}

// Nest 의 @Injectable 과 같은 자리. 데코레이터가 하나라도 붙어야 컴파일러가
// design:paramtypes 를 내보낸다.
const Marker = (): ClassDecorator => () => undefined;

@Marker()
class Consumer {
  constructor(readonly dep: Dependency) {}
}

// 메타데이터가 사라지면 getMetadata 가 undefined 를 돌려주므로 이 테스트가 먼저 깨진다.
// (vitest.config.ts 의 SWC 트랜스폼을 빼고 tsconfig 플래그를 끄면 실제로 실패하는 것을 확인했다.)
describe('decorator metadata', () => {
  it('emits design:paramtypes so Nest DI can resolve constructor params', () => {
    const paramTypes: unknown = Reflect.getMetadata('design:paramtypes', Consumer);
    expect(paramTypes).toEqual([Dependency]);
  });
});
