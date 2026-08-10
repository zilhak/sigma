import { describe, it, expect } from 'vitest';
import { baseProvenance } from '../src/lint/run.js';

/**
 * base 출처를 응답에 싣지 않으면 «의도한 base 로 돌았는지» 를 확인할 방법이 없다.
 * 실사고: `configPath` 를 빠뜨린 실행이 문서 저장 base(custom 0)로 돌아 파일 base 의
 * 커스텀 규칙이 통째로 빠진 채 "위반 0" 이 나왔고, 그것을 «깨끗함» 으로 기록했다.
 */
describe('baseProvenance — base 가 어디서 왔는지', () => {
  it('base 출처를 싣는다', () => {
    expect(baseProvenance('/root/.sigma/lint.json', { custom: [] })).toEqual({
      baseConfig: '/root/.sigma/lint.json',
    });
  });

  it('문서 저장 base 인데 커스텀이 없으면 경고한다 — 파일 base 의 커스텀이 안 돈 실행이다', () => {
    const out = baseProvenance('document-stored', { builtins: {} });
    expect(out.baseConfig).toBe('document-stored');
    expect(String(out.baseWarning)).toContain('customRan');
  });

  it('문서 저장 base 라도 커스텀이 있으면 경고하지 않는다 — 그건 정상 사용이다', () => {
    const out = baseProvenance('document-stored', {
      custom: [{ id: 'x', kind: 'predicate', code: 'export default () => null' }],
    } as never);
    expect(out.baseWarning).toBeUndefined();
  });

  it('base 라벨이 없으면(구 호출 경로) 아무것도 싣지 않는다', () => {
    expect(baseProvenance(undefined, null)).toEqual({});
  });
});
