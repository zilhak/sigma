/**
 * Playwright Scripts Registry
 *
 * SIGMA_SCRIPTS_DIR 환경변수에서 스크립트 경로를 읽어
 * MCP tool로 반환할 스크립트 메타데이터를 제공합니다.
 *
 * - 개발: packages/shared/dist/ (bun run build 후)
 * - 프로덕션: ~/.sigma/scripts/ (설치 스크립트가 복사)
 * - Docker: 환경변수로 지정된 경로
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface PlaywrightScript {
  name: string;
  description: string;
  path: string;
  exists: boolean;
  api: Array<{
    method: string;
    description: string;
    params: string;
    returns: string;
    example: string;
  }>;
  usage: string;
}

/**
 * 스크립트 디렉토리 경로 결정
 *
 * 우선순위:
 * 1. SIGMA_SCRIPTS_DIR 환경변수
 * 2. 개발 모드 fallback: packages/shared/dist/
 */
function getScriptsDir(): string {
  const envDir = process.env.SIGMA_SCRIPTS_DIR;
  if (envDir) {
    return envDir;
  }

  // 개발 모드: packages/shared/dist/ 에서 빌드 결과를 직접 사용
  // server/src/scripts/registry.ts 기준으로 ../../../../shared/dist
  const devFallback = resolve(__dirname, '..', '..', '..', 'shared', 'dist');
  return devFallback;
}

/**
 * Playwright에서 사용할 수 있는 Sigma 임베드 스크립트 목록 반환
 */
export function getPlaywrightScripts(): PlaywrightScript[] {
  const scriptsDir = getScriptsDir();
  const extractorPath = resolve(scriptsDir, 'extractor.standalone.js');
  const diffPath = resolve(scriptsDir, 'diff.standalone.js');
  const storybookPath = resolve(scriptsDir, 'storybook.standalone.js');

  const enhancerPath = resolve(scriptsDir, 'enhancer.js');

  return [
    {
      name: 'extractor.standalone.js',
      description:
        '웹 컴포넌트를 ExtractedNode JSON으로 추출하고, 페이지 구조 탐색 및 디자인 토큰 추출을 지원하는 통합 Sigma 임베드 스크립트. ' +
        'Playwright page.addScriptTag()로 inject 후 window.__sigma__ API 사용.',
      path: extractorPath,
      exists: existsSync(extractorPath),
      api: [
        // === 추출 API ===
        {
          method: 'window.__sigma__.extract(selectorOrElement)',
          description: 'CSS 선택자 또는 DOM 요소를 ExtractedNode로 추출',
          params: 'string (CSS selector) | Element (DOM element)',
          returns: 'ExtractedNode | null',
          example:
            "const data = await page.evaluate(() => window.__sigma__.extract('button.primary'));",
        },
        {
          method: 'window.__sigma__.extractAt(x, y)',
          description: '좌표에서 요소를 찾아 ExtractedNode로 추출',
          params: 'x: number, y: number',
          returns: 'ExtractedNode | null',
          example:
            'const data = await page.evaluate(() => window.__sigma__.extractAt(100, 200));',
        },
        {
          method: 'window.__sigma__.extractAll(selector)',
          description: '셀렉터에 매칭되는 모든 요소를 일괄 추출',
          params: 'selector: string',
          returns: 'ExtractedNode[]',
          example:
            "const buttons = await page.evaluate(() => window.__sigma__.extractAll('button'));",
        },
        {
          method: 'window.__sigma__.extractVisible(options?)',
          description:
            '뷰포트 내 보이는 컴포넌트를 자동 감지하여 추출. 시맨틱 요소, role 속성, 컴포넌트 클래스명 패턴 기반.',
          params: 'options?: { minWidth?: number, minHeight?: number }',
          returns: 'ExtractedNode[]',
          example:
            'const components = await page.evaluate(() => window.__sigma__.extractVisible());',
        },

        // === 탐색 API ===
        {
          method: 'window.__sigma__.findByText(text, tagName?)',
          description: '텍스트 내용으로 요소 찾기 (가장 구체적인 매칭 반환)',
          params: 'text: string, tagName?: string',
          returns: 'ElementInfo | null',
          example:
            "const btn = await page.evaluate(() => window.__sigma__.findByText('Sign Up', 'button'));",
        },
        {
          method: 'window.__sigma__.findByAlt(altText)',
          description: 'alt 속성으로 이미지 찾기',
          params: 'altText: string',
          returns: 'ElementInfo | null',
          example:
            "const logo = await page.evaluate(() => window.__sigma__.findByAlt('Logo'));",
        },
        {
          method: 'window.__sigma__.findForm(action?)',
          description: 'form 요소 찾기',
          params: 'action?: string',
          returns: 'ElementInfo | null',
          example:
            "const form = await page.evaluate(() => window.__sigma__.findForm('login'));",
        },
        {
          method: 'window.__sigma__.findContainer(options)',
          description: '크기 조건에 맞는 컨테이너 찾기 (부모 방향 탐색)',
          params: '{ minWidth?, minHeight?, maxWidth?, maxHeight?, fromElement? }',
          returns: 'ElementInfo | null',
          example:
            "const card = await page.evaluate(() => window.__sigma__.findContainer({ minWidth: 200, minHeight: 100 }));",
        },
        {
          method: 'window.__sigma__.getElementInfo(selector)',
          description: '셀렉터로 요소 메타정보(위치, 크기, 텍스트 등) 조회',
          params: 'selector: string',
          returns: 'ElementInfo | null',
          example:
            "const info = await page.evaluate(() => window.__sigma__.getElementInfo('.hero'));",
        },
        {
          method: 'window.__sigma__.getPageStructure()',
          description:
            '페이지 전체 구조 요약 (폼, 이미지, 버튼, 링크 수, 메인 콘텐츠 영역 등)',
          params: '-',
          returns: 'PageStructure',
          example:
            'const structure = await page.evaluate(() => window.__sigma__.getPageStructure());',
        },

        // === 디자인 토큰 API ===
        {
          method: 'window.__sigma__.getDesignTokens(selectorOrElement?)',
          description:
            'CSS 커스텀 프로퍼티(변수) 추출. 선택자 미지정 시 :root의 변수 반환. 스타일시트 규칙과 computed value를 모두 수집.',
          params: 'selectorOrElement?: string | Element',
          returns: 'Record<string, string>',
          example:
            "const tokens = await page.evaluate(() => window.__sigma__.getDesignTokens());",
        },

        // === 메타 ===
        {
          method: 'window.__sigma__.version',
          description: '스크립트 버전',
          params: '-',
          returns: 'string',
          example:
            'const ver = await page.evaluate(() => window.__sigma__.version);',
        },
      ],
      usage: [
        '// 1. 스크립트 inject',
        "await page.addScriptTag({ path: '<path>' });",
        '',
        '// 2-A. 단일 컴포넌트 추출',
        "const data = await page.evaluate(() => window.__sigma__.extract('.my-component'));",
        '',
        '// 2-B. 일괄 추출',
        "const buttons = await page.evaluate(() => window.__sigma__.extractAll('button'));",
        '',
        '// 2-C. 뷰포트 내 모든 컴포넌트 자동 추출',
        'const all = await page.evaluate(() => window.__sigma__.extractVisible());',
        '',
        '// 3. 페이지 구조 파악',
        'const structure = await page.evaluate(() => window.__sigma__.getPageStructure());',
        '',
        '// 4. 디자인 토큰 수집',
        'const tokens = await page.evaluate(() => window.__sigma__.getDesignTokens());',
        '',
        '// 5. (선택) Sigma 서버로 전송',
        "// sigma_create_frame({ token, data, name: 'MyComponent' })",
      ].join('\n'),
    },

    {
      name: 'diff.standalone.js',
      description:
        'ExtractedNode 비교 스크립트. 두 추출 결과의 구조적 차이를 분석하고, 스냅샷 저장/비교 기능 제공.',
      path: diffPath,
      exists: existsSync(diffPath),
      api: [
        {
          method: 'window.__sigma_diff__.compare(nodeA, nodeB)',
          description: '두 ExtractedNode의 구조적 차이를 비교',
          params: 'nodeA: ExtractedNode, nodeB: ExtractedNode',
          returns: 'DiffResult { equal, differences[] }',
          example:
            'const diff = await page.evaluate((a, b) => window.__sigma_diff__.compare(a, b), nodeA, nodeB);',
        },
        {
          method: 'window.__sigma_diff__.snapshot(selectorOrNode)',
          description: '요소의 현재 상태를 스냅샷으로 저장 (메모리)',
          params: 'selectorOrNode: string | ExtractedNode',
          returns: 'string (snapshot ID)',
          example:
            "const snapId = await page.evaluate(() => window.__sigma_diff__.snapshot('.btn'));",
        },
        {
          method: 'window.__sigma_diff__.compareWithSnapshot(snapshotId, selectorOrNode)',
          description: '이전 스냅샷과 현재 상태를 비교',
          params: 'snapshotId: string, selectorOrNode: string | ExtractedNode',
          returns: 'DiffResult',
          example:
            "const diff = await page.evaluate((id) => window.__sigma_diff__.compareWithSnapshot(id, '.btn'), snapId);",
        },
        {
          method: 'window.__sigma_diff__.listSnapshots()',
          description: '저장된 스냅샷 목록 조회',
          params: '-',
          returns: 'Array<{ id, selector, timestamp }>',
          example:
            'const snaps = await page.evaluate(() => window.__sigma_diff__.listSnapshots());',
        },
      ],
      usage: [
        '// 1. 추출 스크립트 + diff 스크립트 inject (둘 다 필요)',
        "await page.addScriptTag({ path: '<extractor-path>' });",
        "await page.addScriptTag({ path: '<diff-path>' });",
        '',
        '// 2. 변경 전 스냅샷 저장',
        "const snapId = await page.evaluate(() => window.__sigma_diff__.snapshot('.component'));",
        '',
        '// 3. (페이지 변경 발생...)',
        '',
        '// 4. 스냅샷과 현재 상태 비교',
        "const diff = await page.evaluate((id) => window.__sigma_diff__.compareWithSnapshot(id, '.component'), snapId);",
        'console.log(diff.equal ? "변경 없음" : `${diff.differences.length}개 차이 발견`);',
      ].join('\n'),
    },

    {
      name: 'storybook.standalone.js',
      description:
        'Storybook 전용 Sigma 임베드 스크립트. Story 목록 조회, story 렌더링 영역 감지, 컴포넌트 추출을 지원. ' +
        'Playwright page.addScriptTag()로 inject 후 window.__sigma_storybook__ API 사용.',
      path: storybookPath,
      exists: existsSync(storybookPath),
      api: [
        {
          method: 'window.__sigma_storybook__.getStoryRoot()',
          description: 'Story 렌더링 컨테이너 (#storybook-root) 반환',
          params: '-',
          returns: 'HTMLElement | null',
          example:
            'const root = await page.evaluate(() => window.__sigma_storybook__.getStoryRoot());',
        },
        {
          method: 'window.__sigma_storybook__.getStories(baseUrl?)',
          description: 'Storybook /index.json에서 story 목록 조회 (docs 제외)',
          params: 'baseUrl?: string (기본: 현재 origin)',
          returns: 'Promise<StoryEntry[]> (id, title, name, type, importPath, tags)',
          example:
            'const stories = await page.evaluate(() => window.__sigma_storybook__.getStories());',
        },
        {
          method: 'window.__sigma_storybook__.getCurrentStoryId()',
          description: '현재 URL에서 story ID 추출',
          params: '-',
          returns: 'string | null',
          example:
            'const id = await page.evaluate(() => window.__sigma_storybook__.getCurrentStoryId());',
        },
        {
          method: 'window.__sigma_storybook__.extractStory(selector?)',
          description: '현재 렌더링된 story를 ExtractedNode로 추출. 기본: #storybook-root의 첫 번째 자식. iframe 내부에서 호출',
          params: 'selector?: string (CSS 선택자)',
          returns: 'ExtractedNode | null',
          example:
            'const data = await frame.evaluate(() => window.__sigma_storybook__.extractStory());',
        },
        {
          method: 'window.__sigma_storybook__.extractAndSave(name, serverUrl?, selector?)',
          description: '현재 story를 추출하여 Sigma 서버에 저장. iframe 내부에서 호출',
          params: 'name: string, serverUrl?: string, selector?: string',
          returns: 'Promise<SaveResult> { success, id?, error? }',
          example:
            "const result = await frame.evaluate(() => window.__sigma_storybook__.extractAndSave('Components/Button/Primary'));",
        },
        {
          method: 'window.__sigma_storybook__.navigateToStory(storyId, options?)',
          description: 'Story 전환 - preview iframe의 src를 변경하고 렌더링 완료까지 대기. 메인 Storybook 페이지에서 호출',
          params: 'storyId: string, options?: { baseUrl?: string, timeout?: number }',
          returns: 'Promise<boolean> (true=렌더링 완료, false=타임아웃)',
          example:
            "await page.evaluate((id) => window.__sigma_storybook__.navigateToStory(id), 'components-ccbadge--default');",
        },
        {
          method: 'window.__sigma_storybook__.waitForStoryRendered(timeout?)',
          description: '#storybook-root에 자식이 나타날 때까지 대기. 메인 프레임/iframe 양쪽에서 호출 가능',
          params: 'timeout?: number (기본: 10000ms)',
          returns: 'Promise<boolean>',
          example:
            'const ready = await page.evaluate(() => window.__sigma_storybook__.waitForStoryRendered());',
        },
        {
          method: 'window.__sigma_storybook__.getStoryIframeUrl(storyId, baseUrl?)',
          description: 'Story ID로 iframe URL 생성',
          params: 'storyId: string, baseUrl?: string',
          returns: 'string',
          example:
            "const url = await page.evaluate(() => window.__sigma_storybook__.getStoryIframeUrl('button--primary'));",
        },
        {
          method: 'window.__sigma_storybook__.version',
          description: '스크립트 버전',
          params: '-',
          returns: 'string',
          example:
            'const ver = await page.evaluate(() => window.__sigma_storybook__.version);',
        },
      ],
      usage: [
        '// === SPA 방식 (권장) - 메인 프레임에서 story 전환 + iframe에서 추출 ===',
        '',
        '// 1. 메인 Storybook 페이지 로드 + 스크립트 inject (1회)',
        "await page.goto('http://localhost:6006');",
        "await page.addScriptTag({ path: '<path>' });",
        '',
        '// 2. Story 목록 조회',
        'const stories = await page.evaluate(() => window.__sigma_storybook__.getStories());',
        '',
        '// 3. Story 전환 (SPA 라우팅 - iframe만 변경, 메인 프레임 유지)',
        "await page.evaluate((id) => window.__sigma_storybook__.navigateToStory(id), story.id);",
        '',
        '// 4. iframe에서 추출 + 서버 저장',
        "const frame = page.frames().find(f => f.url().includes('iframe.html'));",
        "await frame.addScriptTag({ path: '<path>' });",
        "const result = await frame.evaluate(() => window.__sigma_storybook__.extractAndSave('Name'));",
        '',
        '// 5. 저장된 ID로 Sigma MCP로 Figma에 import',
        '// sigma_import_file({ token, id: result.id, name: ... })',
      ].join('\n'),
    },

    {
      name: 'enhancer.js',
      description:
        'CDP 보강 모듈 (ESM). Playwright CDPSession과 함께 사용하여 기본 추출 결과를 보강합니다. ' +
        '실제 렌더링 폰트 감지(CSS.getPlatformFontsForNode) 등 CDP 전용 기능을 제공.',
      path: enhancerPath,
      exists: existsSync(enhancerPath),
      api: [
        {
          method: 'enhance(cdp, data, options)',
          description: 'ExtractedNode를 CDP로 보강. platformFonts 옵션으로 실제 렌더링 폰트 감지.',
          params: 'cdp: CDPClient, data: ExtractedNode, options?: { platformFonts?: boolean }',
          returns: 'Promise<EnhanceResult> { data, fontEnhancements? }',
          example:
            "const cdp = await page.context().newCDPSession(page);\nconst { data } = await enhance(cdp, extractedData, { platformFonts: true });",
        },
        {
          method: 'enhanceFonts(cdp, rootNode)',
          description: '텍스트 노드의 실제 렌더링 폰트를 CDP로 조회하여 보강',
          params: 'cdp: CDPClient, rootNode: ExtractedNode',
          returns: 'Promise<FontEnhancement[]>',
          example:
            "const fonts = await enhanceFonts(cdp, extractedData);",
        },
      ],
      usage: [
        '// CDP 보강 모듈은 페이지 내부가 아닌 Playwright 프로세스에서 사용',
        "// import { enhance } from '<path>';  // 또는 동적 import",
        '',
        '// 1. 기본 추출 (페이지 내부)',
        "await page.addScriptTag({ path: '<extractor-path>' });",
        "const data = await page.evaluate(() => window.__sigma__.extract('.component'));",
        '',
        '// 2. CDP 세션 생성',
        'const cdp = await page.context().newCDPSession(page);',
        '',
        '// 3. CDP 보강 (Playwright 프로세스)',
        'const { data: enhanced, fontEnhancements } = await enhance(cdp, data, { platformFonts: true });',
        '',
        '// 4. 보강된 데이터로 Figma import',
        "// sigma_create_frame({ token, data: enhanced, name: 'Enhanced Component' })",
      ].join('\n'),
    },
  ];
}
