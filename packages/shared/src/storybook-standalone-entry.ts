/**
 * Sigma Storybook Standalone - IIFE Entry Point
 *
 * esbuild로 빌드되어 self-contained IIFE JS 파일로 출력됩니다.
 * Playwright에서 page.addScriptTag({ path }) 로 inject하여 사용합니다.
 *
 * ⚠️ 주의: extractStory()는 내부적으로 extractElement()를 사용하므로
 *   extractor.standalone.js 없이도 독립 동작합니다 (번들에 포함됨).
 *
 * 사용법 (메인 프레임):
 *   await page.addScriptTag({ path: '/path/to/storybook.standalone.js' });
 *   const stories = await page.evaluate(() => window.__sigma_storybook__.getStories());
 *   await page.evaluate((id) => window.__sigma_storybook__.navigateToStory(id), storyId);
 *
 * 사용법 (iframe):
 *   const frame = page.frames().find(f => f.url().includes('iframe.html'));
 *   await frame.addScriptTag({ path: '/path/to/storybook.standalone.js' });
 *   const result = await frame.evaluate(() => window.__sigma_storybook__.extractAndSave('name'));
 */
import {
  getStoryRoot,
  getStories,
  getCurrentStoryId,
  extractStory,
  extractAndSave,
  navigateToStory,
  waitForStoryRendered,
  getStoryIframeUrl,
} from './storybook/core';
import type { StoryEntry, SaveResult } from './storybook/core';
import type { ExtractedNode } from './types';

declare global {
  interface Window {
    __sigma_storybook__?: SigmaStorybookAPI;
  }
}

interface SigmaStorybookAPI {
  /** Story 렌더링 컨테이너 (#storybook-root) 반환 */
  getStoryRoot: () => HTMLElement | null;
  /** Storybook /index.json에서 story 목록 조회 */
  getStories: (baseUrl?: string) => Promise<StoryEntry[]>;
  /** 현재 URL에서 story ID 추출 */
  getCurrentStoryId: () => string | null;
  /** 현재 렌더링된 story를 ExtractedNode로 추출 (iframe 내부) */
  extractStory: (selector?: string) => ExtractedNode | null;
  /** 추출하여 Sigma 서버에 저장 (iframe 내부) */
  extractAndSave: (name: string, serverUrl?: string, selector?: string) => Promise<SaveResult>;
  /** Story 전환 - iframe src 변경 + 렌더링 대기 (메인 프레임) */
  navigateToStory: (
    storyId: string,
    options?: { baseUrl?: string; timeout?: number }
  ) => Promise<boolean>;
  /** Story 렌더링 완료 대기 (메인 프레임 / iframe 양쪽 가능) */
  waitForStoryRendered: (timeout?: number) => Promise<boolean>;
  /** Story ID로 iframe URL 생성 */
  getStoryIframeUrl: (storyId: string, baseUrl?: string) => string;
  /** 스크립트 버전 */
  version: string;
}

if (!window.__sigma_storybook__) {
  window.__sigma_storybook__ = {
    getStoryRoot,
    getStories,
    getCurrentStoryId,
    extractStory,
    extractAndSave,
    navigateToStory,
    waitForStoryRendered,
    getStoryIframeUrl,
    version: '1.2.0',
  };

  console.log(
    '[Sigma] Storybook script v1.2.0 loaded. APIs: getStoryRoot, getStories, getCurrentStoryId, extractStory, extractAndSave, navigateToStory, waitForStoryRendered, getStoryIframeUrl'
  );
}
