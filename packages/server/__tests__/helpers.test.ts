/**
 * helpers 스펙:
 *   - jsonResponse: 임의 데이터를 MCP ToolResult({ content: [{ type: 'text', text: JSON }] }) 형식으로 래핑
 *   - validateToken: 토큰 문자열 → { valid, binding, error } 반환
 *   - getTargetFromBinding: 바인딩 → { pluginId?, pageId? }. null이면 빈 객체
 *   - formatSize: 바이트 → "500B", "1.5KB", "2.5MB" 형식
 */
import { describe, test, expect } from 'bun:test';
import { jsonResponse, validateToken, getTargetFromBinding, formatSize } from '../src/mcp/helpers';
import { tokenStore } from '../src/auth/token';

describe('jsonResponse', () => {
  test('결과는 content 배열을 가져야 함', () => {
    const result = jsonResponse({ x: 1 });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBe(1);
  });

  test('content[0].type은 "text"여야 함', () => {
    expect(jsonResponse({}).content[0].type).toBe('text');
  });

  test('content[0].text는 유효한 JSON이어야 함', () => {
    const result = jsonResponse({ key: 'value' });
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    expect(JSON.parse(result.content[0].text)).toEqual({ key: 'value' });
  });

  test('배열도 올바르게 직렬화', () => {
    expect(JSON.parse(jsonResponse([1, 2]).content[0].text)).toEqual([1, 2]);
  });

  test('null도 올바르게 직렬화', () => {
    expect(jsonResponse(null).content[0].text).toBe('null');
  });

  test('중첩 객체도 올바르게 직렬화', () => {
    const data = { a: { b: { c: [1, 2, 3] } } };
    expect(JSON.parse(jsonResponse(data).content[0].text)).toEqual(data);
  });
});

describe('validateToken', () => {
  // tokenStore는 helpers.ts 내부에서 사용하는 동일 인스턴스

  test('빈 문자열 → valid: false', () => {
    const result = validateToken('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('존재하지 않는 토큰 → valid: false', () => {
    const result = validateToken('stk-does-not-exist00');
    expect(result.valid).toBe(false);
  });

  test('유효한 토큰 → valid: true, binding: null', () => {
    const token = tokenStore.createToken();
    const result = validateToken(token);
    expect(result.valid).toBe(true);
    expect(result.binding).toBeNull();
  });

  test('바인딩된 토큰 → binding 정보 포함', () => {
    const token = tokenStore.createToken();
    tokenStore.bindToken(token, 'p1', 'pg1', 'f.fig', 'Page');
    const result = validateToken(token);
    expect(result.valid).toBe(true);
    expect(result.binding).not.toBeNull();
    expect(result.binding!.pluginId).toBe('p1');
  });

  test('만료된 토큰 → valid: false, error에 "만료" 포함', () => {
    const token = tokenStore.createToken();
    tokenStore.validateToken(token)!.expiresAt = new Date(Date.now() - 1);
    const result = validateToken(token);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('만료');
  });
});

describe('getTargetFromBinding', () => {
  test('null → 빈 객체 (기본값 사용 의미)', () => {
    const result = getTargetFromBinding(null);
    expect(result).toEqual({});
  });

  test('바인딩 → pluginId와 pageId 추출', () => {
    const result = getTargetFromBinding({
      pluginId: 'p1', pageId: 'pg1', fileName: 'f.fig', pageName: 'P',
    });
    expect(result).toEqual({ pluginId: 'p1', pageId: 'pg1' });
  });

  test('fileName/pageName은 반환하지 않아야 함 (표시용이므로)', () => {
    const result = getTargetFromBinding({
      pluginId: 'p1', pageId: 'pg1', fileName: 'f.fig', pageName: 'P',
    }) as Record<string, unknown>;
    expect(result).not.toHaveProperty('fileName');
    expect(result).not.toHaveProperty('pageName');
  });
});

describe('formatSize', () => {
  test('1024 미만 → "NB"', () => {
    expect(formatSize(0)).toBe('0B');
    expect(formatSize(500)).toBe('500B');
    expect(formatSize(1023)).toBe('1023B');
  });

  test('1024~1MB → "N.NKB"', () => {
    expect(formatSize(1024)).toBe('1.0KB');
    expect(formatSize(1536)).toBe('1.5KB');
  });

  test('1MB 이상 → "N.NMB"', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0MB');
    expect(formatSize(1024 * 1024 * 2.5)).toBe('2.5MB');
  });

  test('경계값: 정확히 1024 → KB 형식', () => {
    const result = formatSize(1024);
    expect(result).toContain('KB');
  });

  test('경계값: 정확히 1MB → MB 형식', () => {
    const result = formatSize(1024 * 1024);
    expect(result).toContain('MB');
  });
});
