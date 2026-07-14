/**
 * 내장 스펙 프리셋 스펙:
 *   - 모든 프리셋 항목의 HTML은 스펙 검증기를 통과해야 한다 (규칙 위반 프리셋 배포 방지)
 *   - namespace/alias는 이름 규칙을 지켜야 한다
 *   - 모든 slot에는 설명(data-sigma-desc)이 있어야 한다 (카탈로그 품질)
 */
import { describe, test, expect } from 'bun:test';
import { validateComponentSpecHtml, isValidSpecName } from '@sigma/shared';
import { SPEC_PRESETS, SPEC_PRESET_NAMES } from '../src/mcp/spec-presets';

describe('내장 스펙 프리셋', () => {
  test('프리셋 팩이 정의되어 있다', () => {
    expect(SPEC_PRESET_NAMES).toContain('annotation');
    expect(SPEC_PRESET_NAMES).toContain('wireframe');
  });

  for (const presetName of SPEC_PRESET_NAMES) {
    const preset = SPEC_PRESETS[presetName];

    test(`${presetName}: namespace가 이름 규칙을 지킨다`, () => {
      expect(isValidSpecName(preset.namespace)).toBe(true);
    });

    for (const item of preset.items) {
      test(`${presetName}/${item.alias}: alias 규칙 + 검증기 통과 + param 설명`, () => {
        expect(isValidSpecName(item.alias)).toBe(true);
        expect(item.description.length).toBeGreaterThan(10);

        const result = validateComponentSpecHtml(item.html);
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
        // 모든 param에 설명이 있어야 카탈로그에서 바로 쓸 수 있다
        for (const param of result.params) {
          expect(param.description ? param.description.length : 0).toBeGreaterThan(0);
        }
      });
    }
  }
});
