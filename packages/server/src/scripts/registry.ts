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
  ];
}
