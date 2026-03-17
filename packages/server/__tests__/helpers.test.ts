import { describe, test, expect } from 'bun:test';
import { jsonResponse, validateToken, getTargetFromBinding, formatSize } from '../src/mcp/helpers';
import { tokenStore } from '../src/auth/token';

describe('jsonResponse', () => {
  test('객체를 ToolResult로 래핑', () => {
    const result = jsonResponse({ success: true, data: 'hello' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toBe('hello');
  });

  test('에러 객체 래핑', () => {
    const result = jsonResponse({ error: '문제 발생' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('문제 발생');
  });

  test('배열 래핑', () => {
    const result = jsonResponse([1, 2, 3]);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual([1, 2, 3]);
  });

  test('null 래핑', () => {
    const result = jsonResponse(null);
    expect(result.content[0].text).toBe('null');
  });
});

describe('validateToken', () => {
  test('빈 토큰 → 에러', () => {
    const result = validateToken('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('토큰');
  });

  test('유효한 토큰 → valid', () => {
    // helpers.ts 내부에서 사용하는 tokenStore와 동일한 인스턴스 사용
    const token = tokenStore.createToken();
    const result = validateToken(token);
    expect(result.valid).toBe(true);
    expect(result.binding).toBeNull();
  });

  test('바인딩된 토큰 → binding 포함', () => {
    const token = tokenStore.createToken();
    tokenStore.bindToken(token, 'p1', 'pg1', 'file.fig', 'Page 1');
    const result = validateToken(token);
    expect(result.valid).toBe(true);
    expect(result.binding!.pluginId).toBe('p1');
  });

  test('만료된 토큰 → 에러', () => {
    const token = tokenStore.createToken();
    const data = tokenStore.validateToken(token)!;
    data.expiresAt = new Date(Date.now() - 1000);

    const result = validateToken(token);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('만료');
  });
});

describe('getTargetFromBinding', () => {
  test('바인딩 없으면 빈 객체', () => {
    expect(getTargetFromBinding(null)).toEqual({});
  });

  test('바인딩 있으면 pluginId/pageId 반환', () => {
    const result = getTargetFromBinding({
      pluginId: 'p1',
      pageId: 'pg1',
      fileName: 'file.fig',
      pageName: 'Page',
    });
    expect(result.pluginId).toBe('p1');
    expect(result.pageId).toBe('pg1');
  });
});

describe('formatSize', () => {
  test('바이트', () => {
    expect(formatSize(500)).toBe('500B');
  });

  test('KB', () => {
    expect(formatSize(1536)).toBe('1.5KB');
  });

  test('MB', () => {
    expect(formatSize(1024 * 1024 * 2.5)).toBe('2.5MB');
  });

  test('0', () => {
    expect(formatSize(0)).toBe('0B');
  });
});
