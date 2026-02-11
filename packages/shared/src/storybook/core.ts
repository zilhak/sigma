/**
 * Sigma Storybook Core
 *
 * Storybook 환경에서 story 목록 조회, story 렌더링 영역 감지,
 * 컴포넌트 추출을 지원하는 유틸리티 모듈.
 *
 * Playwright에서 inject하여 사용합니다.
 */
import { extractElement } from '../extractor/core';
import type { ExtractedNode } from '../types';

// ============================================================
// Types
// ============================================================

export interface StoryEntry {
  /** Story ID (e.g., "button--primary") */
  id: string;
  /** Story title (e.g., "Button") */
  title: string;
  /** Story name (e.g., "Primary") */
  name: string;
  /** "story" | "docs" */
  type: string;
  /** Import path (e.g., "./src/Button.stories.tsx") */
  importPath?: string;
  /** Tags (e.g., ["autodocs"]) */
  tags?: string[];
}

export interface StorybookIndex {
  v: number;
  entries: Record<string, StoryEntry>;
}

// ============================================================
// Story Root
// ============================================================

/**
 * Storybook iframe 내 story 렌더링 컨테이너를 반환
 * iframe.html 내부에서 호출해야 합니다.
 */
export function getStoryRoot(): HTMLElement | null {
  return document.getElementById('storybook-root');
}

// ============================================================
// Story List
// ============================================================

/**
 * Storybook의 /index.json에서 story 목록을 가져옴
 * @param baseUrl - Storybook base URL (기본: 현재 origin)
 */
export async function getStories(baseUrl?: string): Promise<StoryEntry[]> {
  const base = baseUrl || window.location.origin;
  const url = `${base}/index.json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch stories: ${res.status} ${res.statusText}`);
  }

  const data: StorybookIndex = await res.json();
  const entries = Object.values(data.entries);

  // story 타입만 필터 (docs 제외)
  return entries.filter((entry) => entry.type === 'story');
}

// ============================================================
// Current Story
// ============================================================

/**
 * 현재 URL에서 story ID 추출
 * iframe.html?id=button--primary&viewMode=story → "button--primary"
 */
export function getCurrentStoryId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

// ============================================================
// Story Extraction
// ============================================================

/**
 * 현재 렌더링된 story를 ExtractedNode로 추출
 * @param selector - 추출 대상 CSS 선택자 (기본: #storybook-root의 첫 번째 자식)
 */
export function extractStory(selector?: string): ExtractedNode | null {
  let element: HTMLElement | null;

  if (selector) {
    element = document.querySelector(selector) as HTMLElement | null;
  } else {
    const root = getStoryRoot();
    if (!root) {
      console.error('[Sigma Storybook] #storybook-root not found');
      return null;
    }
    // 첫 번째 자식 요소를 추출 대상으로 사용
    element = root.firstElementChild as HTMLElement | null;
    if (!element) {
      console.error('[Sigma Storybook] #storybook-root has no children');
      return null;
    }
  }

  if (!element) {
    console.error('[Sigma Storybook] Element not found:', selector);
    return null;
  }

  return extractElement(element);
}

// ============================================================
// Extract and Save
// ============================================================

export interface SaveResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * 현재 story를 추출하여 Sigma 서버에 저장
 * @param name - 컴포넌트 이름 (e.g., "Components/CCBadge/Default")
 * @param serverUrl - Sigma 서버 URL (기본: http://localhost:19832)
 * @param selector - 추출 대상 CSS 선택자 (기본: #storybook-root 첫 번째 자식)
 */
export async function extractAndSave(
  name: string,
  serverUrl?: string,
  selector?: string
): Promise<SaveResult> {
  const extracted = extractStory(selector);
  if (!extracted) {
    return { success: false, error: 'extraction failed' };
  }

  const server = serverUrl || 'http://localhost:19832';
  try {
    const res = await fetch(`${server}/api/extracted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        data: extracted,
        format: 'json',
        timestamp: Date.now(),
      }),
    });
    const result = await res.json();
    return { success: true, id: result.component?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ============================================================
// Story Navigation (메인 프레임에서 호출)
// ============================================================

/**
 * Story ID로 Storybook의 preview iframe을 전환 (SPA 라우팅)
 *
 * 메인 Storybook 페이지(localhost:6006)에서 호출해야 합니다.
 * iframe의 src를 변경하여 story를 전환하고, 렌더링 완료까지 대기합니다.
 *
 * @param storyId - Story ID (e.g., "components-ccbadge--default")
 * @param options.baseUrl - Storybook base URL (기본: 현재 origin)
 * @param options.timeout - 렌더링 대기 타임아웃 ms (기본: 10000)
 */
export async function navigateToStory(
  storyId: string,
  options?: { baseUrl?: string; timeout?: number }
): Promise<boolean> {
  const iframe = document.getElementById('storybook-preview-iframe') as HTMLIFrameElement | null;
  if (!iframe) {
    throw new Error(
      '[Sigma Storybook] storybook-preview-iframe not found. Call from main Storybook page.'
    );
  }

  const base = options?.baseUrl || window.location.origin;
  const timeout = options?.timeout || 10000;
  const url = `${base}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;

  // iframe load 대기
  await new Promise<void>((resolve) => {
    const onLoad = () => {
      iframe.removeEventListener('load', onLoad);
      resolve();
    };
    iframe.addEventListener('load', onLoad);
    iframe.src = url;
  });

  // 렌더링 완료 대기
  return waitForStoryRendered(timeout);
}

// ============================================================
// Render Wait (메인 프레임 / iframe 양쪽에서 호출 가능)
// ============================================================

/**
 * Story 렌더링 완료를 대기
 *
 * #storybook-root에 자식 요소가 나타날 때까지 폴링합니다.
 * 메인 프레임에서 호출하면 iframe의 contentDocument를 확인하고,
 * iframe 내부에서 호출하면 로컬 DOM을 확인합니다.
 *
 * @param timeout - 최대 대기 시간 ms (기본: 10000)
 * @returns true면 렌더링 완료, false면 타임아웃
 */
export function waitForStoryRendered(timeout = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();

    const getRoot = (): HTMLElement | null => {
      // iframe 내부에서 호출된 경우
      const localRoot = document.getElementById('storybook-root');
      if (localRoot) return localRoot;

      // 메인 프레임에서 호출된 경우 → iframe의 contentDocument 접근
      const iframe = document.getElementById(
        'storybook-preview-iframe'
      ) as HTMLIFrameElement | null;
      try {
        return iframe?.contentDocument?.getElementById('storybook-root') ?? null;
      } catch {
        return null;
      }
    };

    const check = () => {
      const root = getRoot();
      if (root && root.children.length > 0) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeout) {
        resolve(false);
        return;
      }
      requestAnimationFrame(check);
    };

    check();
  });
}

// ============================================================
// URL Builder
// ============================================================

/**
 * Story ID로 iframe URL 생성
 * @param storyId - Story ID (e.g., "button--primary")
 * @param baseUrl - Storybook base URL (기본: 현재 origin)
 */
export function getStoryIframeUrl(storyId: string, baseUrl?: string): string {
  const base = baseUrl || window.location.origin;
  return `${base}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
}
