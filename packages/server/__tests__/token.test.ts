import { describe, test, expect, beforeEach } from 'bun:test';
import { SigmaTokenStore } from '../src/auth/token';

describe('SigmaTokenStore', () => {
  let store: SigmaTokenStore;

  beforeEach(() => {
    SigmaTokenStore.resetInstance();
    store = SigmaTokenStore.getInstance();
  });

  describe('싱글톤', () => {
    test('같은 인스턴스 반환', () => {
      const a = SigmaTokenStore.getInstance();
      const b = SigmaTokenStore.getInstance();
      expect(a).toBe(b);
    });

    test('reset 후 새 인스턴스', () => {
      const a = SigmaTokenStore.getInstance();
      SigmaTokenStore.resetInstance();
      const b = SigmaTokenStore.getInstance();
      expect(a).not.toBe(b);
    });
  });

  describe('createToken', () => {
    test('stk- 접두사 형식', () => {
      const token = store.createToken();
      expect(token).toMatch(/^stk-[a-f0-9]{16}$/);
    });

    test('매번 고유한 토큰', () => {
      const tokens = new Set(Array.from({ length: 10 }, () => store.createToken()));
      expect(tokens.size).toBe(10);
    });

    test('토큰 수 증가', () => {
      expect(store.getTotalTokenCount()).toBe(0);
      store.createToken();
      expect(store.getTotalTokenCount()).toBe(1);
      store.createToken();
      expect(store.getTotalTokenCount()).toBe(2);
    });
  });

  describe('validateToken', () => {
    test('유효한 토큰 → 데이터 반환', () => {
      const token = store.createToken();
      const data = store.validateToken(token);
      expect(data).not.toBeNull();
      expect(data!.token).toBe(token);
      expect(data!.binding).toBeNull();
    });

    test('존재하지 않는 토큰 → null', () => {
      expect(store.validateToken('stk-nonexistent')).toBeNull();
    });

    test('만료된 토큰 → null + 자동 삭제', () => {
      const token = store.createToken();
      const data = store.validateToken(token)!;
      // 만료 시간을 과거로 설정
      data.expiresAt = new Date(Date.now() - 1000);

      expect(store.validateToken(token)).toBeNull();
      expect(store.getTotalTokenCount()).toBe(0);
    });

    test('검증 시 만료 시간 갱신', () => {
      const token = store.createToken();
      const data1 = store.validateToken(token)!;
      const expiry1 = data1.expiresAt.getTime();

      // 약간의 시간 경과 시뮬레이션
      const data2 = store.validateToken(token)!;
      expect(data2.expiresAt.getTime()).toBeGreaterThanOrEqual(expiry1);
    });
  });

  describe('bindToken', () => {
    test('바인딩 성공', () => {
      const token = store.createToken();
      const result = store.bindToken(token, 'plugin-1', 'page-1', 'Design.fig', 'Page 1');
      expect(result).toBe(true);

      const data = store.validateToken(token)!;
      expect(data.binding).toEqual({
        pluginId: 'plugin-1',
        pageId: 'page-1',
        fileName: 'Design.fig',
        pageName: 'Page 1',
      });
    });

    test('재바인딩 (덮어쓰기)', () => {
      const token = store.createToken();
      store.bindToken(token, 'plugin-1', 'page-1', 'A.fig', 'Page A');
      store.bindToken(token, 'plugin-2', 'page-2', 'B.fig', 'Page B');

      const data = store.validateToken(token)!;
      expect(data.binding!.pluginId).toBe('plugin-2');
      expect(data.binding!.fileName).toBe('B.fig');
    });

    test('잘못된 토큰에 바인딩 → false', () => {
      expect(store.bindToken('stk-invalid', 'p1', 'p1', 'f', 'p')).toBe(false);
    });

    test('만료된 토큰에 바인딩 → false', () => {
      const token = store.createToken();
      const data = store.validateToken(token)!;
      data.expiresAt = new Date(Date.now() - 1000);
      expect(store.bindToken(token, 'p1', 'p1', 'f', 'p')).toBe(false);
    });
  });

  describe('deleteToken', () => {
    test('존재하는 토큰 삭제 → true', () => {
      const token = store.createToken();
      expect(store.deleteToken(token)).toBe(true);
      expect(store.validateToken(token)).toBeNull();
    });

    test('존재하지 않는 토큰 삭제 → false', () => {
      expect(store.deleteToken('stk-nope')).toBe(false);
    });
  });

  describe('getBinding', () => {
    test('바인딩 있으면 반환', () => {
      const token = store.createToken();
      store.bindToken(token, 'p1', 'pg1', 'file.fig', 'Page');
      const binding = store.getBinding(token);
      expect(binding).not.toBeNull();
      expect(binding!.pluginId).toBe('p1');
    });

    test('바인딩 없으면 null', () => {
      const token = store.createToken();
      expect(store.getBinding(token)).toBeNull();
    });
  });

  describe('getStatus', () => {
    test('초기 상태', () => {
      const status = store.getStatus();
      expect(status.totalTokens).toBe(0);
      expect(status.activeTokens).toBe(0);
      expect(status.loginCount).toBe(0);
    });

    test('토큰 생성 후 카운트', () => {
      store.createToken();
      store.createToken();
      const status = store.getStatus();
      expect(status.totalTokens).toBe(2);
      expect(status.activeTokens).toBe(2);
      expect(status.loginCount).toBe(2);
    });
  });

  describe('getActiveTokenCount', () => {
    test('만료된 토큰은 카운트 제외', () => {
      const token1 = store.createToken();
      store.createToken(); // active

      // token1 만료시키기
      const data = store.validateToken(token1)!;
      data.expiresAt = new Date(Date.now() - 1000);

      expect(store.getActiveTokenCount()).toBe(1);
    });
  });
});
