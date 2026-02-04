/**
 * Sigma Token Store
 *
 * AI Agent의 작업공간 혼동 방지를 위한 sigma 토큰 관리 모듈.
 * 보안이 아닌 "AI 오류 방지 메커니즘"으로 설계됨.
 *
 * 핵심 규칙:
 * - 메모리 전용: 파일시스템 저장 안 함, 서버 재시작 시 휘발
 * - 10분 만료: 사용 시마다 갱신
 * - 지연 정리: 만료된 토큰은 접근 시 제거
 * - 100회 로그인마다 일괄 정리
 */

import { randomBytes } from 'crypto';

/**
 * Sigma 토큰에 바인딩된 작업공간 정보
 */
export interface SigmaTokenBinding {
  pluginId: string;
  pageId: string;
  fileName: string;
  pageName: string;
}

/**
 * Sigma 토큰 데이터
 */
export interface SigmaTokenData {
  token: string;
  expiresAt: Date;
  binding: SigmaTokenBinding | null;
  createdAt: Date;
}

/**
 * Sigma 토큰 저장소
 *
 * 메모리 기반 토큰 관리. 싱글톤 패턴으로 구현.
 */
export class SigmaTokenStore {
  private static instance: SigmaTokenStore | null = null;

  private tokens: Map<string, SigmaTokenData> = new Map();
  private loginCount: number = 0;

  /** 토큰 만료 시간 (밀리초) - 10분 */
  private readonly TOKEN_EXPIRY_MS = 10 * 60 * 1000;

  /** 일괄 정리 트리거 로그인 횟수 */
  private readonly CLEANUP_THRESHOLD = 100;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): SigmaTokenStore {
    if (!SigmaTokenStore.instance) {
      SigmaTokenStore.instance = new SigmaTokenStore();
    }
    return SigmaTokenStore.instance;
  }

  /**
   * 테스트용: 인스턴스 초기화
   */
  static resetInstance(): void {
    SigmaTokenStore.instance = null;
  }

  /**
   * 새 sigma 토큰 생성
   *
   * @returns 생성된 토큰 문자열 (stk-{random})
   */
  createToken(): string {
    const token = this.generateToken();
    const now = new Date();

    this.tokens.set(token, {
      token,
      expiresAt: new Date(now.getTime() + this.TOKEN_EXPIRY_MS),
      binding: null,
      createdAt: now,
    });

    // 로그인 카운터 증가 및 100회마다 정리
    this.loginCount++;
    if (this.loginCount >= this.CLEANUP_THRESHOLD) {
      this.cleanupExpiredTokens();
      this.loginCount = 0;
    }

    console.log(`[Sigma Token] Created: ${token}`);
    return token;
  }

  /**
   * Sigma 토큰 검증
   *
   * 유효한 토큰이면 만료 시간을 갱신하고 데이터 반환.
   * 만료되었거나 존재하지 않으면 null 반환 (지연 정리).
   *
   * @param token 검증할 토큰
   * @returns 토큰 데이터 또는 null
   */
  validateToken(token: string): SigmaTokenData | null {
    const data = this.tokens.get(token);

    // 토큰이 존재하지 않음
    if (!data) {
      return null;
    }

    // 만료 확인 → 만료되었으면 그때서야 제거 (지연 정리)
    const now = new Date();
    if (now > data.expiresAt) {
      this.tokens.delete(token);
      console.log(`[Sigma Token] Expired and removed: ${token}`);
      return null;
    }

    // 유효한 토큰 → 만료 시간 갱신
    data.expiresAt = new Date(now.getTime() + this.TOKEN_EXPIRY_MS);

    return data;
  }

  /**
   * Sigma 토큰에 작업공간 바인딩
   *
   * 이미 바인딩이 있으면 덮어씀 (unbind 개념 없음).
   *
   * @param token 토큰
   * @param pluginId Figma 플러그인 ID
   * @param pageId 페이지 ID
   * @param fileName 파일명 (표시용)
   * @param pageName 페이지명 (표시용)
   * @returns 성공 여부
   */
  bindToken(
    token: string,
    pluginId: string,
    pageId: string,
    fileName: string,
    pageName: string
  ): boolean {
    const data = this.validateToken(token);

    if (!data) {
      return false;
    }

    const previousBinding = data.binding;
    data.binding = {
      pluginId,
      pageId,
      fileName,
      pageName,
    };

    if (previousBinding) {
      console.log(
        `[Sigma Token] Rebind: ${token} (${previousBinding.fileName}/${previousBinding.pageName} → ${fileName}/${pageName})`
      );
    } else {
      console.log(`[Sigma Token] Bind: ${token} → ${fileName}/${pageName}`);
    }

    return true;
  }

  /**
   * Sigma 토큰 삭제 (로그아웃)
   *
   * @param token 삭제할 토큰
   * @returns 삭제 성공 여부 (존재했으면 true)
   */
  deleteToken(token: string): boolean {
    const existed = this.tokens.has(token);
    if (existed) {
      this.tokens.delete(token);
      console.log(`[Sigma Token] Deleted: ${token}`);
    }
    return existed;
  }

  /**
   * 토큰의 바인딩 정보만 조회 (만료 시간 갱신 없이)
   *
   * @param token 토큰
   * @returns 바인딩 정보 또는 null
   */
  getBinding(token: string): SigmaTokenBinding | null {
    const data = this.validateToken(token);
    return data?.binding ?? null;
  }

  /**
   * 만료된 토큰 일괄 정리
   *
   * 100회 로그인마다 자동 호출됨.
   */
  private cleanupExpiredTokens(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [token, data] of this.tokens) {
      if (now > data.expiresAt) {
        this.tokens.delete(token);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Sigma Token] Cleanup: ${cleaned} expired tokens removed`);
    }
  }

  /**
   * 토큰 문자열 생성
   *
   * 형식: stk-{16자리 hex} (stk = Sigma ToKen)
   */
  private generateToken(): string {
    const random = randomBytes(8).toString('hex');
    return `stk-${random}`;
  }

  // ============ 디버깅/상태 확인용 메서드 ============

  /**
   * 현재 활성 토큰 수 (만료되지 않은 것만)
   */
  getActiveTokenCount(): number {
    const now = new Date();
    let count = 0;
    for (const data of this.tokens.values()) {
      if (now <= data.expiresAt) {
        count++;
      }
    }
    return count;
  }

  /**
   * 전체 토큰 수 (만료 포함)
   */
  getTotalTokenCount(): number {
    return this.tokens.size;
  }

  /**
   * 저장소 상태 정보 (디버깅용)
   */
  getStatus(): {
    totalTokens: number;
    activeTokens: number;
    loginCount: number;
  } {
    return {
      totalTokens: this.tokens.size,
      activeTokens: this.getActiveTokenCount(),
      loginCount: this.loginCount,
    };
  }
}

// 기본 내보내기: 싱글톤 인스턴스
export const tokenStore = SigmaTokenStore.getInstance();
