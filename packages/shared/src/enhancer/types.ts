/**
 * CDP 보강 레이어 타입
 *
 * Playwright CDPSession 또는 Chrome Extension debugger와 호환되는
 * CDP 클라이언트 인터페이스를 정의합니다.
 */

/** CDP 클라이언트 추상화 - Playwright CDPSession과 호환 */
export interface CDPClient {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
}

/** 보강 옵션 */
export interface EnhanceOptions {
  /** 실제 렌더링 폰트 감지 (CSS.getPlatformFontsForNode) */
  platformFonts?: boolean;
  /** pseudo-element 정밀 바운딩 (DOM.getBoxModel) */
  precisePseudo?: boolean;
}

/** 플랫폼 폰트 정보 */
export interface PlatformFontInfo {
  familyName: string;
  postScriptName: string;
  isCustomFont: boolean;
  /** 이 폰트로 렌더링된 글리프 수 */
  glyphCount: number;
}

/** 노드별 폰트 보강 결과 */
export interface FontEnhancement {
  /** ExtractedNode.id */
  nodeId: string;
  /** 실제 렌더링에 사용된 폰트 */
  platformFonts: PlatformFontInfo[];
  /** 가장 많이 사용된 폰트 */
  primaryFont: string;
}
