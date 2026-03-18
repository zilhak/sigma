/**
 * SigmaTokenStore 스펙 (CLAUDE.md + JSDoc):
 *   - 메모리 전용, 서버 재시작 시 휘발
 *   - 토큰 형식: stk-{16자리 hex}
 *   - 10분 만료, 사용(validate) 시마다 갱신
 *   - 지연 정리: 만료 토큰은 접근 시점에 제거
 *   - 100회 로그인마다 일괄 정리
 *   - bindToken: 이미 바인딩 있으면 덮어씀
 *   - deleteToken: 존재하면 true, 없으면 false
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { SigmaTokenStore } from '../src/auth/token';

describe('SigmaTokenStore', () => {
  let store: SigmaTokenStore;

  beforeEach(() => {
    SigmaTokenStore.resetInstance();
    store = SigmaTokenStore.getInstance();
  });

  // === 싱글톤 ===
  describe('싱글톤 패턴', () => {
    test('getInstance()는 동일 인스턴스를 반환해야 함', () => {
      expect(SigmaTokenStore.getInstance()).toBe(store);
    });

    test('resetInstance() 후 새 인스턴스여야 함', () => {
      SigmaTokenStore.resetInstance();
      expect(SigmaTokenStore.getInstance()).not.toBe(store);
    });

    test('reset 후 이전 토큰은 사라져야 함', () => {
      const token = store.createToken();
      SigmaTokenStore.resetInstance();
      const newStore = SigmaTokenStore.getInstance();
      expect(newStore.validateToken(token)).toBeNull();
    });
  });

  // === 토큰 생성 ===
  describe('createToken', () => {
    test('stk-{16자리 hex} 형식이어야 함', () => {
      expect(store.createToken()).toMatch(/^stk-[a-f0-9]{16}$/);
    });

    test('매번 다른 토큰이어야 함', () => {
      const tokens = Array.from({ length: 20 }, () => store.createToken());
      expect(new Set(tokens).size).toBe(20);
    });

    test('생성 직후 validate 가능해야 함', () => {
      const token = store.createToken();
      expect(store.validateToken(token)).not.toBeNull();
    });

    test('생성 직후 binding은 null이어야 함', () => {
      const token = store.createToken();
      expect(store.validateToken(token)!.binding).toBeNull();
    });
  });

  // === 토큰 검증 ===
  describe('validateToken', () => {
    test('존재하지 않는 토큰 → null', () => {
      expect(store.validateToken('stk-0000000000000000')).toBeNull();
    });

    test('빈 문자열 → null', () => {
      expect(store.validateToken('')).toBeNull();
    });

    test('유효한 토큰 → 데이터 반환', () => {
      const token = store.createToken();
      const data = store.validateToken(token);
      expect(data).not.toBeNull();
      expect(data!.token).toBe(token);
    });

    test('검증 시 만료 시간이 갱신되어야 함 (사용할 때마다 연장)', () => {
      const token = store.createToken();
      const data1 = store.validateToken(token)!;
      const expiry1 = data1.expiresAt.getTime();
      // 다시 검증
      const data2 = store.validateToken(token)!;
      expect(data2.expiresAt.getTime()).toBeGreaterThanOrEqual(expiry1);
    });

    test('만료된 토큰 → null 반환 + 자동 삭제 (지연 정리)', () => {
      const token = store.createToken();
      // 만료 시간을 과거로 설정
      store.validateToken(token)!.expiresAt = new Date(Date.now() - 1);
      expect(store.validateToken(token)).toBeNull();
      // 삭제되었으므로 총 개수 감소
      expect(store.getTotalTokenCount()).toBe(0);
    });
  });

  // === 바인딩 ===
  describe('bindToken', () => {
    test('유효한 토큰에 바인딩 → true', () => {
      const token = store.createToken();
      expect(store.bindToken(token, 'plug-1', 'page-1', 'File.fig', 'Page 1')).toBe(true);
    });

    test('바인딩 후 데이터에 반영되어야 함', () => {
      const token = store.createToken();
      store.bindToken(token, 'plug-1', 'page-1', 'File.fig', 'Page 1');
      const binding = store.validateToken(token)!.binding!;
      expect(binding.pluginId).toBe('plug-1');
      expect(binding.pageId).toBe('page-1');
      expect(binding.fileName).toBe('File.fig');
      expect(binding.pageName).toBe('Page 1');
    });

    test('재바인딩 시 이전 값을 덮어써야 함', () => {
      const token = store.createToken();
      store.bindToken(token, 'A', 'pA', 'A.fig', 'PA');
      store.bindToken(token, 'B', 'pB', 'B.fig', 'PB');
      const binding = store.validateToken(token)!.binding!;
      expect(binding.pluginId).toBe('B');
      expect(binding.fileName).toBe('B.fig');
    });

    test('존재하지 않는 토큰 → false', () => {
      expect(store.bindToken('stk-invalid', 'p', 'p', 'f', 'n')).toBe(false);
    });

    test('만료된 토큰 → false', () => {
      const token = store.createToken();
      store.validateToken(token)!.expiresAt = new Date(Date.now() - 1);
      expect(store.bindToken(token, 'p', 'p', 'f', 'n')).toBe(false);
    });
  });

  // === 삭제 ===
  describe('deleteToken', () => {
    test('존재하는 토큰 삭제 → true', () => {
      const token = store.createToken();
      expect(store.deleteToken(token)).toBe(true);
    });

    test('삭제 후 validate → null', () => {
      const token = store.createToken();
      store.deleteToken(token);
      expect(store.validateToken(token)).toBeNull();
    });

    test('존재하지 않는 토큰 삭제 → false', () => {
      expect(store.deleteToken('stk-nope')).toBe(false);
    });

    test('이미 삭제한 토큰 재삭제 → false', () => {
      const token = store.createToken();
      store.deleteToken(token);
      expect(store.deleteToken(token)).toBe(false);
    });
  });

  // === getBinding ===
  describe('getBinding', () => {
    test('바인딩 없는 토큰 → null', () => {
      const token = store.createToken();
      expect(store.getBinding(token)).toBeNull();
    });

    test('바인딩 있는 토큰 → 바인딩 정보', () => {
      const token = store.createToken();
      store.bindToken(token, 'p1', 'pg1', 'f.fig', 'P');
      expect(store.getBinding(token)!.pluginId).toBe('p1');
    });

    test('잘못된 토큰 → null', () => {
      expect(store.getBinding('invalid')).toBeNull();
    });
  });

  // === 상태 조회 ===
  describe('상태 조회', () => {
    test('초기 상태: 0개 토큰', () => {
      expect(store.getTotalTokenCount()).toBe(0);
      expect(store.getActiveTokenCount()).toBe(0);
    });

    test('생성 후 카운트 증가', () => {
      store.createToken();
      store.createToken();
      expect(store.getTotalTokenCount()).toBe(2);
      expect(store.getActiveTokenCount()).toBe(2);
    });

    test('만료된 토큰은 active에서 제외되어야 함', () => {
      const t1 = store.createToken();
      store.createToken();
      store.validateToken(t1)!.expiresAt = new Date(Date.now() - 1);
      // total에는 여전히 2개 (지연 정리 전)
      expect(store.getTotalTokenCount()).toBe(2);
      // active에는 1개만
      expect(store.getActiveTokenCount()).toBe(1);
    });

    test('getStatus 구조', () => {
      store.createToken();
      const status = store.getStatus();
      expect(status).toHaveProperty('totalTokens');
      expect(status).toHaveProperty('activeTokens');
      expect(status).toHaveProperty('loginCount');
      expect(status.loginCount).toBe(1);
    });
  });

  // === 일괄 정리 (100회 로그인마다) ===
  describe('자동 정리', () => {
    test('100회 로그인 시 만료된 토큰이 자동 제거되어야 함', () => {
      // 먼저 만료될 토큰 하나 생성
      const expiredToken = store.createToken();
      store.validateToken(expiredToken)!.expiresAt = new Date(Date.now() - 1);

      // 99회 더 로그인 (총 100회)
      for (let i = 0; i < 99; i++) {
        store.createToken();
      }
      // 100회째에 cleanup이 발동하므로 만료 토큰이 사라져야 함
      expect(store.getTotalTokenCount()).toBe(99); // 100 - 1 expired
    });
  });
});
