/**
 * Sigma CDP Enhancer - Barrel Export
 *
 * CDP(Chrome DevTools Protocol)를 활용한 추출 데이터 보강 모듈.
 * 페이지 컨텍스트가 아닌 Playwright/Extension 프로세스에서 실행됩니다.
 */
export { enhance } from './core';
export type { EnhanceResult } from './core';
export type { CDPClient, EnhanceOptions, PlatformFontInfo, FontEnhancement } from './types';
export { enhanceFonts } from './font';
