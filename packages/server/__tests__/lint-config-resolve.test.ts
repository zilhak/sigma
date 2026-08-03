/**
 * sigma_lint 확장 스펙:
 *   - mergeConfigs: base + override (builtins rule 단위 override, custom 은 override 우선)
 *   - resolvePageConfig: configMode(uniform|per-page|merge) × 저장config 유무 조합
 *   - readStoredConfig: 저장값 파싱/검증 (부분 실패 시 error 표기)
 *   - renderReportMarkdown: 요약/표/상세 섹션 생성
 */
import { describe, test, expect } from 'bun:test';
import { mergeConfigs, resolvePageConfig, readStoredConfig } from '../src/lint/resolve-config';
import { validateLintConfigShape, LintConfigError } from '../src/lint/load-config';
import { renderReportMarkdown, type PageLintResult } from '../src/lint/report';
import type { Violation } from '@sigma/shared';

// wsServer.getPageData 만 쓰는 최소 스텁 (page → 저장 raw 매핑)
function stubServer(store: Record<string, string | null>) {
  return {
    async getPageData({ key, pageId }: { key?: string; pageId?: string }) {
      const raw = store[pageId ?? ''] ?? null;
      return { targetId: pageId ?? '', targetName: pageId ?? '', key, value: raw };
    },
  } as unknown as Parameters<typeof resolvePageConfig>[0];
}

describe('mergeConfigs', () => {
  test('builtins 는 rule 단위로 override(페이지가 base 덮음)', () => {
    const base = { builtins: { section_gap: { gap: 80 }, raw_node: { enabled: false } } };
    const over = { builtins: { raw_node: { enabled: true } } };
    const merged = mergeConfigs(base, over);
    expect(merged.builtins).toEqual({ section_gap: { gap: 80 }, raw_node: { enabled: true } });
  });

  test('custom 은 override 에 있으면 교체, 없으면 base 유지', () => {
    const base = { custom: [{ id: 'a', select: {}, check: {} }] } as never;
    expect(mergeConfigs(base, {}).custom).toEqual([{ id: 'a', select: {}, check: {} }]);
    const over = { custom: [{ id: 'b', select: {}, check: {} }] } as never;
    expect(mergeConfigs(base, over).custom).toEqual([{ id: 'b', select: {}, check: {} }]);
  });

  test('null 인자 허용', () => {
    expect(mergeConfigs(null, null)).toEqual({ builtins: {}, custom: undefined });
  });
});

describe('readStoredConfig', () => {
  test('저장값 없으면 config=null, error 없음', async () => {
    const r = await readStoredConfig(stubServer({ P1: null }), 'P1', undefined);
    expect(r.config).toBeNull();
    expect(r.error).toBeUndefined();
  });

  test('유효 JSON config 파싱', async () => {
    const r = await readStoredConfig(stubServer({ P1: '{"builtins":{"raw_node":{"enabled":true}}}' }), 'P1', undefined);
    expect(r.config?.builtins?.raw_node).toEqual({ enabled: true });
  });

  test('깨진 JSON 은 error 표기, config=null (부분 실패 허용)', async () => {
    const r = await readStoredConfig(stubServer({ P1: '{not json' }), 'P1', undefined);
    expect(r.config).toBeNull();
    expect(r.error).toContain('JSON');
  });

  test('스키마 위반(builtins 배열)은 error 표기', async () => {
    const r = await readStoredConfig(stubServer({ P1: '{"builtins":[]}' }), 'P1', undefined);
    expect(r.config).toBeNull();
    expect(r.error).toBeTruthy();
  });
});

describe('resolvePageConfig', () => {
  const base = { builtins: { section_gap: { gap: 80 } } };

  test('uniform: 항상 base', async () => {
    const r = await resolvePageConfig(stubServer({}), 'P1', 'uniform', base, undefined);
    expect(r.source).toBe('base');
    expect(r.config).toBe(base);
  });

  test('per-page: 저장 있으면 page-stored', async () => {
    const srv = stubServer({ P1: '{"builtins":{"raw_node":{"enabled":true}}}' });
    const r = await resolvePageConfig(srv, 'P1', 'per-page', base, undefined);
    expect(r.source).toBe('page-stored');
    expect(r.config?.builtins?.raw_node).toEqual({ enabled: true });
  });

  test('per-page: 저장 없으면 base 폴백', async () => {
    const r = await resolvePageConfig(stubServer({}), 'P1', 'per-page', base, undefined);
    expect(r.source).toBe('base');
  });

  test('per-page: 저장·base 모두 없으면 skip', async () => {
    const r = await resolvePageConfig(stubServer({}), 'P1', 'per-page', null, undefined);
    expect(r.source).toBe('skipped');
    expect(r.config).toBeNull();
  });

  test('merge: base + 페이지 override 병합', async () => {
    const srv = stubServer({ P1: '{"builtins":{"raw_node":{"enabled":true}}}' });
    const r = await resolvePageConfig(srv, 'P1', 'merge', base, undefined);
    expect(r.source).toBe('merged');
    expect(r.config?.builtins).toEqual({ section_gap: { gap: 80 }, raw_node: { enabled: true } });
  });

  test('merge: 저장 없으면 base 그대로', async () => {
    const r = await resolvePageConfig(stubServer({}), 'P1', 'merge', base, undefined);
    expect(r.source).toBe('base');
  });
});

describe('renderReportMarkdown', () => {
  const v = (rule: string, msg: string): Violation => ({ rule, source: 'builtin', message: msg, nodes: ['1:2'] });
  const pages: PageLintResult[] = [
    { pageId: '1:1', pageName: 'Clean Page', configSource: 'base', violations: [] },
    { pageId: '1:2', pageName: 'Dirty Page', configSource: 'page-stored', violations: [v('raw_node', 'raw FRAME "x"'), v('raw_node', 'raw RECT')] },
    { pageId: '1:3', pageName: 'Skipped Page', configSource: 'skipped', violations: [] },
  ];
  const md = renderReportMarkdown(pages, { fileName: 'F', scope: 'file', configMode: 'per-page', baseConfigLabel: 'none', timestamp: 0 });

  test('요약에 총 위반 수 포함', () => {
    expect(md).toContain('총 위반 2건');
  });
  test('페이지별 요약 표에 세 페이지 모두', () => {
    expect(md).toContain('Clean Page');
    expect(md).toContain('Dirty Page');
    expect(md).toContain('Skipped Page');
  });
  test('위반 있는 페이지만 상세 섹션', () => {
    expect(md).toContain('### Dirty Page');
    expect(md).not.toContain('### Clean Page');
  });
  test('룰별 집계 표기', () => {
    expect(md).toContain('`raw_node` 2');
  });
  test('skip 페이지는 위반수 대신 —', () => {
    const skipRow = md.split('\n').find(l => l.includes('Skipped Page'));
    expect(skipRow).toContain('—');
  });
});

describe('config.componentSpec 형태검증 (스펙 등록 정책)', () => {
  const shape = (v: unknown) => () => validateLintConfigShape(v, 'test');

  test('올바른 정책은 통과', () => {
    const cfg = validateLintConfigShape({
      componentSpec: { warn: [{ aliasPattern: '^table$', message: '쓰지 마세요' }] },
    }, 'test');
    expect(cfg.componentSpec?.warn).toHaveLength(1);
  });

  test('componentSpec 이 객체가 아니면 거부', () => {
    expect(shape({ componentSpec: [] })).toThrow(LintConfigError);
  });

  test('warn 이 배열이 아니면 거부', () => {
    expect(shape({ componentSpec: { warn: {} } })).toThrow(LintConfigError);
  });

  test('aliasPattern/message 누락은 거부 — 조용히 안 도는 정책을 막는다', () => {
    expect(shape({ componentSpec: { warn: [{ message: 'x' }] } })).toThrow(/aliasPattern/);
    expect(shape({ componentSpec: { warn: [{ aliasPattern: '^t' }] } })).toThrow(/message/);
  });

  test('componentSpec 미지정은 통과(기존 config 호환)', () => {
    expect(validateLintConfigShape({ builtins: {} }, 'test').componentSpec).toBeUndefined();
  });
});
