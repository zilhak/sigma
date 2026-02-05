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
 * Playwright에서 사용할 수 있는 스크립트 목록 반환
 */
export function getPlaywrightScripts(): PlaywrightScript[] {
  const scriptsDir = getScriptsDir();
  const extractorPath = resolve(scriptsDir, 'extractor.standalone.js');

  return [
    {
      name: 'extractor.standalone.js',
      description:
        '웹 컴포넌트를 ExtractedNode JSON으로 추출하는 standalone 스크립트. ' +
        'Playwright page.addScriptTag()로 inject 후 window.__sigma__ API 사용.',
      path: extractorPath,
      exists: existsSync(extractorPath),
      api: [
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
        '// 2. 컴포넌트 추출',
        "const data = await page.evaluate(() => window.__sigma__.extract('.my-component'));",
        '',
        '// 3. (선택) Sigma 서버로 전송',
        "// sigma_create_frame({ token, data, name: 'MyComponent' })",
      ].join('\n'),
    },
  ];
}
