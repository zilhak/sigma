import type { ExtractedNode } from '@sigma/shared';
import * as storage from '../storage/index.js';
import type { FigmaWebSocketServer } from '../websocket/server.js';
import { tokenStore, type SigmaTokenBinding } from '../auth/token.js';
import { getPlaywrightScripts } from '../scripts/registry.js';

export interface ToolContext {
  wsServer: FigmaWebSocketServer;
}

// Tool definitions for MCP
export const toolDefinitions = [
  // === Storage Tools (토큰 불필요) ===
  {
    name: 'save_extracted',
    description: '추출된 컴포넌트 데이터를 저장합니다',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '컴포넌트 이름',
        },
        data: {
          type: 'object',
          description: 'ExtractedNode JSON 데이터',
        },
      },
      required: ['name', 'data'],
    },
  },
  {
    name: 'list_saved',
    description: '저장된 컴포넌트 목록을 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'load_extracted',
    description: '저장된 컴포넌트를 불러옵니다',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '컴포넌트 ID',
        },
        name: {
          type: 'string',
          description: '컴포넌트 이름 (ID가 없을 경우)',
        },
      },
    },
  },
  {
    name: 'delete_extracted',
    description: '저장된 컴포넌트를 삭제합니다',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '삭제할 컴포넌트 ID',
        },
      },
      required: ['id'],
    },
  },

  // === Sigma Auth Tools ===
  {
    name: 'sigma_login',
    description: `Sigma 토큰을 발급받습니다. 이 토큰은 Figma 작업공간과 바인딩하여 사용합니다.

토큰은 10분간 유효하며, 사용할 때마다 자동으로 갱신됩니다.
발급된 토큰으로 sigma_bind를 호출하여 특정 플러그인/페이지에 바인딩하세요.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sigma_logout',
    description: 'Sigma 토큰을 삭제합니다 (로그아웃)',
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_bind',
    description: `Sigma 토큰을 특정 Figma 플러그인과 페이지에 바인딩합니다.

바인딩 후에는 해당 토큰으로 프레임 생성/조회/삭제 시 자동으로 해당 플러그인과 페이지가 대상이 됩니다.
이미 바인딩된 토큰에 다시 바인딩하면 새 대상으로 덮어씁니다.

먼저 sigma_list_plugins로 연결된 플러그인 목록을 확인하고,
sigma_list_pages로 해당 플러그인의 페이지 목록을 확인한 후 바인딩하세요.`,
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        pluginId: {
          type: 'string',
          description: '대상 Figma 플러그인 ID (sigma_list_plugins로 확인)',
        },
        pageId: {
          type: 'string',
          description: '대상 페이지 ID (sigma_list_pages로 확인)',
        },
      },
      required: ['token', 'pluginId', 'pageId'],
    },
  },
  {
    name: 'sigma_status',
    description: `Sigma 토큰의 상태와 바인딩 정보를 확인합니다.

토큰이 유효한지, 어떤 플러그인/페이지에 바인딩되어 있는지 확인할 수 있습니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
      },
      required: ['token'],
    },
  },

  // === Sigma Plugin/Page Info Tools (토큰 불필요) ===
  {
    name: 'sigma_list_plugins',
    description: `연결된 모든 Figma Plugin 목록을 조회합니다.

각 플러그인의 pluginId, 파일 이름, 페이지 목록 등을 확인할 수 있습니다.
sigma_bind에서 사용할 pluginId를 여기서 확인하세요.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sigma_list_pages',
    description: `특정 Figma 플러그인의 페이지 목록을 조회합니다.

sigma_bind에서 사용할 pageId를 여기서 확인하세요.`,
    inputSchema: {
      type: 'object',
      properties: {
        pluginId: {
          type: 'string',
          description: '플러그인 ID (sigma_list_plugins로 확인)',
        },
      },
      required: ['pluginId'],
    },
  },

  // === Sigma Figma Operation Tools (토큰 필수) ===
  {
    name: 'sigma_create_frame',
    description: `Figma에 프레임을 생성합니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.
토큰이 플러그인/페이지에 바인딩되어 있으면 해당 위치에 생성됩니다.
바인딩되지 않은 토큰은 첫 번째 연결된 플러그인의 현재 페이지에 생성됩니다.

**중요: format은 반드시 'json'을 사용하세요.**
- json (기본값, 권장): ExtractedNode 구조로 정확한 스타일 보존
- html: 사람이 읽거나 타 프로그램 호환용. 스타일 손실 가능성 있음`,
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        data: {
          type: 'object',
          description: 'ExtractedNode JSON 데이터 (format이 json일 때)',
        },
        html: {
          type: 'string',
          description: 'HTML 문자열 (format이 html일 때)',
        },
        format: {
          type: 'string',
          enum: ['json', 'html'],
          default: 'json',
          description: "데이터 형식. 'json' 권장 (기본값)",
        },
        name: {
          type: 'string',
          description: '프레임 이름',
        },
        position: {
          type: 'object',
          description: '프레임 생성 위치 (x, y 좌표)',
          properties: {
            x: { type: 'number', description: 'X 좌표' },
            y: { type: 'number', description: 'Y 좌표' },
          },
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_import_file',
    description: `저장된 컴포넌트를 Figma로 가져옵니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.
토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        id: {
          type: 'string',
          description: '가져올 컴포넌트 ID',
        },
        name: {
          type: 'string',
          description: '프레임 이름 (선택사항)',
        },
        position: {
          type: 'object',
          description: '프레임 생성 위치 (x, y 좌표)',
          properties: {
            x: { type: 'number', description: 'X 좌표' },
            y: { type: 'number', description: 'Y 좌표' },
          },
        },
      },
      required: ['token', 'id'],
    },
  },
  {
    name: 'sigma_get_frames',
    description: `Figma 페이지의 모든 프레임 위치와 크기를 조회합니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.
토큰 바인딩에 따라 조회 대상 플러그인/페이지가 결정됩니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_delete_frame',
    description: `Figma에서 프레임을 삭제합니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.
토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        nodeId: {
          type: 'string',
          description: '삭제할 노드 ID (예: "123:456")',
        },
      },
      required: ['token', 'nodeId'],
    },
  },
  {
    name: 'sigma_update_frame',
    description: `Figma에서 기존 프레임의 내용을 새 데이터로 전체 교체합니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.
프레임 노드 자체는 유지하고, 자식을 모두 제거한 뒤 새 데이터로 재생성합니다.
루트 레벨 스타일(크기, 배경, 패딩, 레이아웃 등)도 새 데이터에 맞게 업데이트됩니다.

**중요: format은 반드시 'json'을 사용하세요.**`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        nodeId: {
          type: 'string',
          description: '업데이트할 프레임 노드 ID (예: "123:456")',
        },
        data: {
          type: 'object',
          description: 'ExtractedNode JSON 데이터 (format이 json일 때)',
        },
        html: {
          type: 'string',
          description: 'HTML 문자열 (format이 html일 때)',
        },
        format: {
          type: 'string',
          enum: ['json', 'html'],
          default: 'json',
          description: "데이터 형식. 'json' 권장 (기본값)",
        },
        name: {
          type: 'string',
          description: '새 프레임 이름 (선택, 지정하지 않으면 기존 이름 유지)',
        },
      },
      required: ['token', 'nodeId'],
    },
  },
  {
    name: 'sigma_modify_node',
    description: `Figma 노드에 개별 조작을 수행합니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.
허용된 메서드만 실행 가능하며, 허용되지 않은 메서드를 호출하면 사용 가능한 전체 메서드 목록이 반환됩니다.

**사용 가능한 메서드:**
- Basic: rename, resize, move, setOpacity, setVisible, setLocked, remove
- Visual: setFills, setSolidFill, setStrokes, setStrokeWeight, setCornerRadius, setCornerRadii, setEffects, setBlendMode
- Layout: setLayoutMode, setPadding, setItemSpacing, setClipsContent, setPrimaryAxisSizingMode, setCounterAxisSizingMode, setPrimaryAxisAlignItems, setCounterAxisAlignItems
- Text: setCharacters, setFontSize, setTextAlignHorizontal`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        nodeId: {
          type: 'string',
          description: '대상 노드 ID (예: "123:456")',
        },
        method: {
          type: 'string',
          description: '실행할 메서드 이름 (예: "rename", "resize", "setSolidFill")',
        },
        args: {
          type: 'object',
          description: '메서드에 전달할 인자 (메서드별 다름)',
        },
      },
      required: ['token', 'nodeId', 'method'],
    },
  },
  {
    name: 'sigma_find_node',
    description: `경로 또는 이름으로 Figma 노드를 찾습니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.

**경로 형식:**
- 문자열: "Section/Frame/Button"
- 배열: ["Section", "Frame", "Button"]

**반환값:**
- 단일 매칭: { node: { id, name, type, boundingBox, ... } }
- 다중 매칭: { matches: [...], warning: "N개의 노드가 발견되었습니다" }

**사용 예시:**
- "Button" - 최상위에서 Button 이름의 노드 찾기
- "Components/Button" - Components 안의 Button 찾기
- "Design System/Buttons/Primary" - 깊은 경로 탐색`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        path: {
          type: ['string', 'array'],
          description: '찾을 노드의 경로 ("A/B/C" 또는 ["A", "B", "C"])',
          items: { type: 'string' },
        },
        type: {
          type: 'string',
          description: '특정 타입만 필터링 (예: "FRAME", "SECTION", "GROUP")',
        },
      },
      required: ['token', 'path'],
    },
  },
  {
    name: 'sigma_get_tree',
    description: `Figma 문서의 계층 구조를 탐색합니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.

**시작점 지정 (둘 중 하나):**
- nodeId: 노드 ID로 직접 지정
- path: 경로로 찾아서 시작 ("Design System/Buttons")

**탐색 깊이:**
- 1 (기본값): 직접 자식만
- N: N단계까지
- -1 또는 "full": 전체 서브트리

**필터 옵션:**
- filter.types: 특정 타입만 (예: ["FRAME", "SECTION"])
- filter.namePattern: 이름 정규식 (예: "Button.*")

**limit:** 최대 노드 수 (기본 1000, 대용량 방지)

**사용 예시:**
- 페이지 최상위: sigma_get_tree({ token })
- 특정 섹션 내부: sigma_get_tree({ token, path: "Design System" })
- 프레임 전체 구조: sigma_get_tree({ token, nodeId: "1:234", depth: "full" })`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        nodeId: {
          type: 'string',
          description: '탐색 시작점 노드 ID (예: "123:456")',
        },
        path: {
          type: ['string', 'array'],
          description: '탐색 시작점 경로 ("A/B/C" 또는 ["A", "B", "C"])',
          items: { type: 'string' },
        },
        depth: {
          type: ['number', 'string'],
          description: '탐색 깊이 (숫자, -1, 또는 "full"). 기본값 1',
        },
        filter: {
          type: 'object',
          description: '필터 조건',
          properties: {
            types: {
              type: 'array',
              items: { type: 'string' },
              description: '허용할 노드 타입 (예: ["FRAME", "SECTION"])',
            },
            namePattern: {
              type: 'string',
              description: '이름 정규식 패턴 (예: "Button.*")',
            },
          },
        },
        limit: {
          type: 'number',
          description: '최대 노드 수 (기본 1000)',
        },
      },
      required: ['token'],
    },
  },

  {
    name: 'sigma_screenshot',
    description: `Figma 노드를 이미지로 캡처하여 로컬 파일로 저장합니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.
토큰 바인딩에 따라 대상 플러그인이 결정됩니다.

노드의 exportAsync()를 사용하여 PNG/SVG/JPG/PDF로 export한 후,
~/.sigma/screenshots/ 디렉토리에 저장하고 파일 경로를 반환합니다.

반환된 filePath를 Read 도구로 읽으면 이미지를 직접 확인할 수 있습니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        nodeId: {
          type: 'string',
          description: '캡처할 노드 ID (예: "123:456")',
        },
        format: {
          type: 'string',
          enum: ['PNG', 'SVG', 'JPG', 'PDF'],
          default: 'PNG',
          description: '이미지 형식 (기본값: PNG)',
        },
        scale: {
          type: 'number',
          default: 2,
          description: 'Export 스케일 (기본값: 2, SVG/PDF에는 미적용)',
        },
        filename: {
          type: 'string',
          description: '저장할 파일명 (선택, 미지정 시 노드 이름 + 타임스탬프로 자동 생성)',
        },
      },
      required: ['token', 'nodeId'],
    },
  },

  {
    name: 'sigma_extract_node',
    description: `Figma 노드를 ExtractedNode JSON으로 추출합니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.
토큰 바인딩에 따라 대상 플러그인이 결정됩니다.

노드 ID를 지정하면 해당 노드의 구조, 스타일, 자식 요소를 포함한 ExtractedNode JSON을 반환합니다.
반환된 JSON은 sigma_create_frame으로 다시 Figma에 생성하거나, 외부에서 분석하는 데 사용할 수 있습니다.

**주의:** 대형 노드(자식이 많은 경우)는 JSON 크기가 클 수 있습니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        nodeId: {
          type: 'string',
          description: '추출할 노드 ID (예: "123:456")',
        },
      },
      required: ['token', 'nodeId'],
    },
  },
  {
    name: 'sigma_test_roundtrip',
    description: `Figma 노드를 JSON으로 추출한 후, 그 JSON으로 새 프레임을 생성하는 라운드트립 테스트입니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.

**용도:** JSON 추출 품질을 시각적으로 검증하는 수동 테스트.
원본 노드 옆에 추출된 JSON으로 만든 복제본이 생성되므로, 둘을 나란히 비교할 수 있습니다.

**동작:**
1. nodeId로 원본 노드를 ExtractedNode JSON으로 추출
2. 추출된 JSON으로 새 프레임을 생성 (이름: "[Test] {원본이름}")
3. 원본 정보 + 생성된 프레임 정보를 반환`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        nodeId: {
          type: 'string',
          description: '테스트할 원본 노드 ID (예: "123:456")',
        },
      },
      required: ['token', 'nodeId'],
    },
  },

  // === Combined Tools (토큰 필수) ===
  {
    name: 'save_and_import',
    description: `컴포넌트를 저장하고 바로 Figma로 가져옵니다.

**토큰 필수**: sigma_login으로 발급받은 토큰이 필요합니다.
토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.

**중요: format은 반드시 'json'을 사용하세요.**`,
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        name: {
          type: 'string',
          description: '컴포넌트 이름',
        },
        data: {
          type: 'object',
          description: 'ExtractedNode JSON 데이터 (format이 json일 때)',
        },
        html: {
          type: 'string',
          description: 'HTML 문자열 (format이 html일 때)',
        },
        format: {
          type: 'string',
          enum: ['json', 'html'],
          default: 'json',
          description: "데이터 형식. 'json' 권장 (기본값)",
        },
      },
      required: ['token', 'name'],
    },
  },

  // === Playwright Scripts (토큰 불필요) ===
  {
    name: 'get_playwright_scripts',
    description: `Playwright에서 사용할 수 있는 스크립트 목록과 경로를 반환합니다.

AI Agent가 Playwright로 웹 컴포넌트를 추출할 때 사용합니다.
반환된 path를 page.addScriptTag({ path })로 inject한 후,
API 정보에 따라 window.__sigma__ 함수를 호출합니다.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // === Storage Management (토큰 불필요) ===
  {
    name: 'sigma_storage_stats',
    description: `스토리지 용량 현황을 카테고리별로 조회합니다.

extracted(추출 데이터)와 screenshots(스크린샷) 각각의 파일 수, 용량을 확인할 수 있습니다.
스토리지는 서버 시작 시 자동 정리되지만, 가끔씩 이 도구로 확인하는 것을 권장합니다.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sigma_cleanup',
    description: `스토리지를 조건부로 일괄 정리합니다.

기본적으로 7일 경과 파일을 삭제합니다. olderThanDays로 기간을 조정할 수 있습니다.
category로 extracted/screenshots/all 중 대상을 선택할 수 있습니다.

**참고:** 서버 시작 시 자동 정리가 실행되므로, 수동 정리는 급한 경우에만 사용하세요.`,
    inputSchema: {
      type: 'object',
      properties: {
        olderThanDays: {
          type: 'number',
          default: 7,
          description: '이 일수보다 오래된 파일 삭제 (기본값: 7)',
        },
        category: {
          type: 'string',
          enum: ['extracted', 'screenshots', 'all'],
          default: 'all',
          description: "정리 대상 카테고리 (기본값: 'all')",
        },
      },
    },
  },
  {
    name: 'list_screenshots',
    description: '저장된 스크린샷 목록을 조회합니다 (파일명, 경로, 크기, 생성일)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'delete_screenshot',
    description: '저장된 스크린샷을 파일명으로 삭제합니다',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: '삭제할 스크린샷 파일명 (list_screenshots로 확인)',
        },
      },
      required: ['filename'],
    },
  },

  // === Server Status (토큰 불필요) ===
  {
    name: 'server_status',
    description: '서버 전체 상태를 확인합니다 (연결된 플러그인, 스토리지, 토큰 상태 등)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * 토큰 검증 결과
 */
interface TokenValidationResult {
  valid: boolean;
  binding: SigmaTokenBinding | null;
  error?: string;
}

/**
 * 토큰 검증 헬퍼
 */
function validateToken(token: string): TokenValidationResult {
  if (!token) {
    return { valid: false, binding: null, error: '토큰이 필요합니다' };
  }

  const tokenData = tokenStore.validateToken(token);
  if (!tokenData) {
    return { valid: false, binding: null, error: '유효하지 않거나 만료된 토큰입니다' };
  }

  return { valid: true, binding: tokenData.binding };
}

/**
 * 바인딩에서 대상 플러그인/페이지 추출
 */
function getTargetFromBinding(binding: SigmaTokenBinding | null): { pluginId?: string; pageId?: string } {
  if (!binding) {
    return {};  // 바인딩 없으면 기본값 사용 (첫 번째 플러그인, 현재 페이지)
  }
  return {
    pluginId: binding.pluginId,
    pageId: binding.pageId,
  };
}

// Tool handlers
export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { wsServer } = context;

  try {
    switch (name) {
      // === Storage Tools ===
      case 'save_extracted': {
        const component = await storage.saveComponent(
          args.name as string,
          args.data as ExtractedNode
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `컴포넌트 '${component.name}'이 저장되었습니다`,
                id: component.id,
              }),
            },
          ],
        };
      }

      case 'list_saved': {
        const components = await storage.listComponents();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: components.length,
                components: components.map((c) => ({
                  id: c.id,
                  name: c.name,
                  createdAt: c.createdAt,
                })),
              }),
            },
          ],
        };
      }

      case 'load_extracted': {
        let component;
        if (args.id) {
          component = await storage.getComponent(args.id as string);
        } else if (args.name) {
          component = await storage.getComponentByName(args.name as string);
        }

        if (!component) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: '컴포넌트를 찾을 수 없습니다' }) }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: component.id,
                name: component.name,
                data: component.data,
                createdAt: component.createdAt,
              }),
            },
          ],
        };
      }

      case 'delete_extracted': {
        const deleted = await storage.deleteComponent(args.id as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: deleted,
                message: deleted ? '삭제되었습니다' : '컴포넌트를 찾을 수 없습니다',
              }),
            },
          ],
        };
      }

      // === Sigma Auth Tools ===
      case 'sigma_login': {
        const token = tokenStore.createToken();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                token,
                message: '토큰이 발급되었습니다. sigma_bind로 플러그인/페이지에 바인딩하세요.',
                expiresIn: '10분 (사용 시마다 갱신)',
              }),
            },
          ],
        };
      }

      case 'sigma_logout': {
        const logoutToken = args.token as string;
        const logoutDeleted = tokenStore.deleteToken(logoutToken);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: logoutDeleted,
                message: logoutDeleted ? '로그아웃되었습니다' : '토큰을 찾을 수 없습니다',
              }),
            },
          ],
        };
      }

      case 'sigma_bind': {
        const bindToken = args.token as string;
        const bindPluginId = args.pluginId as string;
        const bindPageId = args.pageId as string;

        // 토큰 검증
        const bindValidation = validateToken(bindToken);
        if (!bindValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: bindValidation.error }) }],
          };
        }

        // 플러그인 존재 확인
        const bindPlugin = wsServer.getPluginById(bindPluginId);
        if (!bindPlugin) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `플러그인(${bindPluginId})이 연결되어 있지 않습니다` }) }],
          };
        }

        // 페이지 정보 조회
        const pageInfo = wsServer.getPluginPageInfo(bindPluginId, bindPageId);
        if (!pageInfo) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `페이지(${bindPageId})를 찾을 수 없습니다` }) }],
          };
        }

        // 바인딩
        const bindSuccess = tokenStore.bindToken(
          bindToken,
          bindPluginId,
          bindPageId,
          pageInfo.fileName,
          pageInfo.pageName
        );

        if (!bindSuccess) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: '바인딩 실패 (토큰이 만료되었을 수 있음)' }) }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: '바인딩 완료',
                binding: {
                  pluginId: bindPluginId,
                  pageId: bindPageId,
                  fileName: pageInfo.fileName,
                  pageName: pageInfo.pageName,
                },
              }),
            },
          ],
        };
      }

      case 'sigma_status': {
        const statusToken = args.token as string;
        const statusValidation = validateToken(statusToken);

        if (!statusValidation.valid) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  valid: false,
                  error: statusValidation.error,
                }),
              },
            ],
          };
        }

        const statusBinding = statusValidation.binding;
        let bindingInfo = null;
        let pluginConnected = false;

        if (statusBinding) {
          // 바인딩된 플러그인이 아직 연결되어 있는지 확인
          const boundPlugin = wsServer.getPluginById(statusBinding.pluginId);
          pluginConnected = boundPlugin !== undefined;

          bindingInfo = {
            pluginId: statusBinding.pluginId,
            pageId: statusBinding.pageId,
            fileName: statusBinding.fileName,
            pageName: statusBinding.pageName,
            pluginConnected,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                valid: true,
                bound: statusBinding !== null,
                binding: bindingInfo,
              }),
            },
          ],
        };
      }

      // === Sigma Plugin/Page Info Tools ===
      case 'sigma_list_plugins': {
        const plugins = wsServer.getPluginsInfo();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: plugins.length,
                plugins: plugins.map((p) => ({
                  pluginId: p.pluginId,
                  fileKey: p.fileKey,
                  fileName: p.fileName,
                  currentPageId: p.currentPageId,
                  currentPageName: p.currentPageName,
                  pageCount: p.pages.length,
                  connectedAt: p.connectedAt,
                })),
              }),
            },
          ],
        };
      }

      case 'sigma_list_pages': {
        const listPagesPluginId = args.pluginId as string;
        const listPagesPlugin = wsServer.getPluginById(listPagesPluginId);

        if (!listPagesPlugin) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `플러그인(${listPagesPluginId})이 연결되어 있지 않습니다` }) }],
          };
        }

        const pluginsInfo = wsServer.getPluginsInfo();
        const targetPluginInfo = pluginsInfo.find(p => p.pluginId === listPagesPluginId);

        if (!targetPluginInfo) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: '플러그인 정보를 찾을 수 없습니다' }) }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                pluginId: listPagesPluginId,
                fileName: targetPluginInfo.fileName,
                currentPageId: targetPluginInfo.currentPageId,
                currentPageName: targetPluginInfo.currentPageName,
                pages: targetPluginInfo.pages.map(p => ({
                  pageId: p.pageId,
                  pageName: p.pageName,
                  isCurrent: p.pageId === targetPluginInfo.currentPageId,
                })),
              }),
            },
          ],
        };
      }

      // === Sigma Figma Operation Tools ===
      case 'sigma_create_frame': {
        const createToken = args.token as string;
        const createValidation = validateToken(createToken);

        if (!createValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: createValidation.error }) }],
          };
        }

        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const { pluginId: createPluginId, pageId: createPageId } = getTargetFromBinding(createValidation.binding);

        // 바인딩된 플러그인이 있으면 연결 확인
        if (createPluginId) {
          const targetPlugin = wsServer.getPluginById(createPluginId);
          if (!targetPlugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${createPluginId})이 연결되어 있지 않습니다. sigma_bind로 다시 바인딩하세요.` }) },
              ],
            };
          }
        }

        const format = (args.format as 'json' | 'html') || 'json';
        const position = args.position as { x: number; y: number } | undefined;

        if (format === 'html') {
          if (!args.html) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'html 필드가 필요합니다' }) }],
            };
          }
          await wsServer.createFrame(null, args.name as string | undefined, position, 'html', args.html as string, createPluginId, createPageId);
        } else {
          if (!args.data) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'data 필드가 필요합니다' }) }],
            };
          }
          await wsServer.createFrame(args.data as ExtractedNode, args.name as string | undefined, position, 'json', undefined, createPluginId, createPageId);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Figma에 프레임이 생성되었습니다',
                target: {
                  pluginId: createPluginId || '(default)',
                  pageId: createPageId || '(current)',
                },
                format,
                position: position || 'auto',
              }),
            },
          ],
        };
      }

      case 'sigma_import_file': {
        const importToken = args.token as string;
        const importValidation = validateToken(importToken);

        if (!importValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: importValidation.error }) }],
          };
        }

        const component = await storage.getComponent(args.id as string);
        if (!component) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: '컴포넌트를 찾을 수 없습니다' }) }],
          };
        }

        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const { pluginId: importPluginId, pageId: importPageId } = getTargetFromBinding(importValidation.binding);

        // 바인딩된 플러그인 연결 확인
        if (importPluginId) {
          const targetPlugin = wsServer.getPluginById(importPluginId);
          if (!targetPlugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${importPluginId})이 연결되어 있지 않습니다. sigma_bind로 다시 바인딩하세요.` }) },
              ],
            };
          }
        }

        const importPosition = args.position as { x: number; y: number } | undefined;
        await wsServer.createFrame(component.data, (args.name as string) || component.name, importPosition, 'json', undefined, importPluginId, importPageId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `'${component.name}'이 Figma로 가져와졌습니다`,
                target: {
                  pluginId: importPluginId || '(default)',
                  pageId: importPageId || '(current)',
                },
                format: 'json',
                position: importPosition || 'auto',
              }),
            },
          ],
        };
      }

      case 'sigma_get_frames': {
        const getFramesToken = args.token as string;
        const getFramesValidation = validateToken(getFramesToken);

        if (!getFramesValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: getFramesValidation.error }) }],
          };
        }

        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const { pluginId: getFramesPluginId, pageId: getFramesPageId } = getTargetFromBinding(getFramesValidation.binding);

        // 바인딩된 플러그인 연결 확인
        if (getFramesPluginId) {
          const targetPlugin = wsServer.getPluginById(getFramesPluginId);
          if (!targetPlugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${getFramesPluginId})이 연결되어 있지 않습니다. sigma_bind로 다시 바인딩하세요.` }) },
              ],
            };
          }
        }

        const frames = await wsServer.getFrames(getFramesPluginId, getFramesPageId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                target: {
                  pluginId: getFramesPluginId || '(default)',
                  pageId: getFramesPageId || '(current)',
                },
                count: frames.length,
                frames: frames,
              }),
            },
          ],
        };
      }

      case 'sigma_delete_frame': {
        const deleteToken = args.token as string;
        const deleteValidation = validateToken(deleteToken);

        if (!deleteValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: deleteValidation.error }) }],
          };
        }

        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const { pluginId: deletePluginId, pageId: deletePageId } = getTargetFromBinding(deleteValidation.binding);

        // 바인딩된 플러그인 연결 확인
        if (deletePluginId) {
          const targetPlugin = wsServer.getPluginById(deletePluginId);
          if (!targetPlugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${deletePluginId})이 연결되어 있지 않습니다. sigma_bind로 다시 바인딩하세요.` }) },
              ],
            };
          }
        }

        const deleteResult = await wsServer.deleteFrame(args.nodeId as string, deletePluginId, deletePageId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: deleteResult.deleted,
                message: deleteResult.deleted
                  ? `프레임 '${deleteResult.name}'이 삭제되었습니다`
                  : '삭제 실패',
                target: {
                  pluginId: deletePluginId || '(default)',
                  pageId: deletePageId || '(current)',
                },
                nodeId: args.nodeId,
                deletedName: deleteResult.name,
              }),
            },
          ],
        };
      }

      case 'sigma_update_frame': {
        const updateToken = args.token as string;
        const updateValidation = validateToken(updateToken);

        if (!updateValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: updateValidation.error }) }],
          };
        }

        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const { pluginId: updatePluginId, pageId: updatePageId } = getTargetFromBinding(updateValidation.binding);

        if (updatePluginId) {
          const targetPlugin = wsServer.getPluginById(updatePluginId);
          if (!targetPlugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${updatePluginId})이 연결되어 있지 않습니다. sigma_bind로 다시 바인딩하세요.` }) },
              ],
            };
          }
        }

        const updateFormat = (args.format as 'json' | 'html') || 'json';
        const updateNodeId = args.nodeId as string;

        if (updateFormat === 'html') {
          if (!args.html) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'html 필드가 필요합니다' }) }],
            };
          }
          const result = await wsServer.updateFrame(
            updateNodeId, 'html', null, args.html as string,
            args.name as string | undefined, updatePluginId, updatePageId
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: '프레임 내용이 업데이트되었습니다',
                  ...result,
                  target: {
                    pluginId: updatePluginId || '(default)',
                    pageId: updatePageId || '(current)',
                  },
                  format: 'html',
                }),
              },
            ],
          };
        } else {
          if (!args.data) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'data 필드가 필요합니다' }) }],
            };
          }
          const result = await wsServer.updateFrame(
            updateNodeId, 'json', args.data as any, undefined,
            args.name as string | undefined, updatePluginId, updatePageId
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: '프레임 내용이 업데이트되었습니다',
                  ...result,
                  target: {
                    pluginId: updatePluginId || '(default)',
                    pageId: updatePageId || '(current)',
                  },
                  format: 'json',
                }),
              },
            ],
          };
        }
      }

      case 'sigma_modify_node': {
        const modifyToken = args.token as string;
        const modifyValidation = validateToken(modifyToken);

        if (!modifyValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: modifyValidation.error }) }],
          };
        }

        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const { pluginId: modifyPluginId } = getTargetFromBinding(modifyValidation.binding);

        if (modifyPluginId) {
          const targetPlugin = wsServer.getPluginById(modifyPluginId);
          if (!targetPlugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${modifyPluginId})이 연결되어 있지 않습니다. sigma_bind로 다시 바인딩하세요.` }) },
              ],
            };
          }
        }

        const modifyNodeId = args.nodeId as string;
        const modifyMethod = args.method as string;
        const modifyArgs = (args.args as Record<string, unknown>) || {};

        try {
          const modifyResult = await wsServer.modifyNode(modifyNodeId, modifyMethod, modifyArgs, modifyPluginId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `${modifyMethod} 실행 완료`,
                  nodeId: modifyNodeId,
                  method: modifyMethod,
                  result: modifyResult,
                }),
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // Check if the error contains the JSON-formatted available methods list
          try {
            const parsedError = JSON.parse(errorMessage);
            if (parsedError.availableMethods) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      error: parsedError.error,
                      availableMethods: parsedError.availableMethods,
                    }),
                  },
                ],
              };
            }
          } catch {
            // Not a JSON error, return as-is
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: errorMessage,
                  nodeId: modifyNodeId,
                  method: modifyMethod,
                }),
              },
            ],
          };
        }
      }

      case 'sigma_find_node': {
        const token = args.token as string;
        const path = args.path as string | string[];
        const typeFilter = args.type as string | undefined;

        // Validate token (also refreshes expiry)
        const tokenEntry = tokenStore.validateToken(token);
        if (!tokenEntry) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: '유효하지 않은 토큰입니다. sigma_login으로 새 토큰을 발급받으세요.' }) }],
          };
        }

        // Check Figma connection
        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다.' }) },
            ],
          };
        }

        // Resolve binding
        const binding = tokenEntry.binding;
        const pluginId = binding?.pluginId;

        if (binding) {
          const plugin = wsServer.getPluginById(pluginId!);
          if (!plugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${pluginId})이 연결되어 있지 않습니다.` }) },
              ],
            };
          }
        }

        try {
          const result = await wsServer.findNode(path, typeFilter, pluginId);
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: errMsg }) }],
          };
        }
      }

      case 'sigma_get_tree': {
        const token = args.token as string;
        const nodeId = args.nodeId as string | undefined;
        const path = args.path as string | string[] | undefined;
        const depth = args.depth as number | string | undefined;
        const filter = args.filter as { types?: string[]; namePattern?: string } | undefined;
        const limit = args.limit as number | undefined;

        // Validate token (also refreshes expiry)
        const tokenEntry = tokenStore.validateToken(token);
        if (!tokenEntry) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: '유효하지 않은 토큰입니다. sigma_login으로 새 토큰을 발급받으세요.' }) }],
          };
        }

        // Check Figma connection
        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다.' }) },
            ],
          };
        }

        // Resolve binding
        const binding = tokenEntry.binding;
        const pluginId = binding?.pluginId;
        const pageId = binding?.pageId;

        if (binding) {
          const plugin = wsServer.getPluginById(pluginId!);
          if (!plugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${pluginId})이 연결되어 있지 않습니다.` }) },
              ],
            };
          }
        }

        try {
          const result = await wsServer.getTree(
            { nodeId, path, depth, filter, limit, pageId },
            pluginId
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: errMsg }) }],
          };
        }
      }

      case 'sigma_screenshot': {
        const screenshotToken = args.token as string;
        const screenshotValidation = validateToken(screenshotToken);

        if (!screenshotValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: screenshotValidation.error }) }],
          };
        }

        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const { pluginId: screenshotPluginId } = getTargetFromBinding(screenshotValidation.binding);

        if (screenshotPluginId) {
          const targetPlugin = wsServer.getPluginById(screenshotPluginId);
          if (!targetPlugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${screenshotPluginId})이 연결되어 있지 않습니다. sigma_bind로 다시 바인딩하세요.` }) },
              ],
            };
          }
        }

        const screenshotNodeId = args.nodeId as string;
        const screenshotFormat = (args.format as 'PNG' | 'SVG' | 'JPG' | 'PDF') || 'PNG';
        const screenshotScale = (args.scale as number) || 2;

        try {
          const exportResult = await wsServer.exportImage(
            screenshotNodeId,
            { format: screenshotFormat, scale: screenshotScale },
            screenshotPluginId
          );

          // Generate filename
          const ext = screenshotFormat.toLowerCase();
          const safeName = (exportResult.nodeName || 'node')
            .toLowerCase()
            .replace(/[^a-z0-9가-힣-_]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
          const timestamp = Date.now();
          const filename = (args.filename as string) || `${safeName}-${timestamp}.${ext}`;

          // Save to file
          const filePath = await storage.saveScreenshot(exportResult.base64, filename);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  filePath,
                  filename,
                  nodeId: exportResult.nodeId,
                  nodeName: exportResult.nodeName,
                  width: exportResult.width,
                  height: exportResult.height,
                  format: screenshotFormat,
                  scale: screenshotScale,
                }),
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: errorMessage,
                  nodeId: screenshotNodeId,
                }),
              },
            ],
          };
        }
      }

      case 'sigma_extract_node': {
        const extractToken = args.token as string;
        const extractValidation = validateToken(extractToken);

        if (!extractValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: extractValidation.error }) }],
          };
        }

        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const { pluginId: extractPluginId } = getTargetFromBinding(extractValidation.binding);

        if (extractPluginId) {
          const targetPlugin = wsServer.getPluginById(extractPluginId);
          if (!targetPlugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${extractPluginId})이 연결되어 있지 않습니다. sigma_bind로 다시 바인딩하세요.` }) },
              ],
            };
          }
        }

        const extractNodeId = args.nodeId as string;

        try {
          const extractResult = await wsServer.extractNode(extractNodeId, extractPluginId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  nodeId: extractResult.nodeId,
                  nodeName: extractResult.nodeName,
                  nodeType: extractResult.nodeType,
                  data: extractResult.data,
                }),
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: errorMessage, nodeId: extractNodeId }),
              },
            ],
          };
        }
      }

      case 'sigma_test_roundtrip': {
        const rtToken = args.token as string;
        const rtValidation = validateToken(rtToken);

        if (!rtValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: rtValidation.error }) }],
          };
        }

        if (!wsServer.isFigmaConnected()) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
            ],
          };
        }

        const { pluginId: rtPluginId, pageId: rtPageId } = getTargetFromBinding(rtValidation.binding);

        if (rtPluginId) {
          const targetPlugin = wsServer.getPluginById(rtPluginId);
          if (!targetPlugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${rtPluginId})이 연결되어 있지 않습니다. sigma_bind로 다시 바인딩하세요.` }) },
              ],
            };
          }
        }

        const rtNodeId = args.nodeId as string;

        try {
          // 1. Extract node to JSON
          const extractResult = await wsServer.extractNode(rtNodeId, rtPluginId);

          // 2. Create frame from extracted JSON
          const frameName = `[Test] ${extractResult.nodeName}`;
          await wsServer.createFrame(
            extractResult.data as ExtractedNode,
            frameName,
            undefined,
            'json',
            undefined,
            rtPluginId,
            rtPageId
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `라운드트립 테스트 완료: "${extractResult.nodeName}" → "${frameName}" 생성됨`,
                  original: {
                    nodeId: extractResult.nodeId,
                    nodeName: extractResult.nodeName,
                    nodeType: extractResult.nodeType,
                  },
                  created: {
                    name: frameName,
                    format: 'json',
                  },
                  target: {
                    pluginId: rtPluginId || '(default)',
                    pageId: rtPageId || '(current)',
                  },
                }),
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: errorMessage, nodeId: rtNodeId }),
              },
            ],
          };
        }
      }

      // === Combined Tools ===
      case 'save_and_import': {
        const saveImportToken = args.token as string;
        const saveImportValidation = validateToken(saveImportToken);

        if (!saveImportValidation.valid) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: saveImportValidation.error }) }],
          };
        }

        const saveFormat = (args.format as 'json' | 'html') || 'json';
        const { pluginId: saveImportPluginId, pageId: saveImportPageId } = getTargetFromBinding(saveImportValidation.binding);

        // 바인딩된 플러그인 연결 확인
        if (saveImportPluginId) {
          const targetPlugin = wsServer.getPluginById(saveImportPluginId);
          if (!targetPlugin) {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: `바인딩된 플러그인(${saveImportPluginId})이 연결되어 있지 않습니다. sigma_bind로 다시 바인딩하세요.` }) },
              ],
            };
          }
        }

        // HTML인 경우 저장은 하지 않고 바로 Figma로 전송 (HTML은 스토리지에 저장하지 않음)
        if (saveFormat === 'html') {
          if (!args.html) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'html 필드가 필요합니다' }) }],
            };
          }

          if (wsServer.isFigmaConnected()) {
            await wsServer.createFrame(null, args.name as string, undefined, 'html', args.html as string, saveImportPluginId, saveImportPageId);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: `'${args.name}'이 Figma로 가져와졌습니다 (HTML, 저장 안 함)`,
                    target: {
                      pluginId: saveImportPluginId || '(default)',
                      pageId: saveImportPageId || '(current)',
                    },
                    format: 'html',
                  }),
                },
              ],
            };
          } else {
            return {
              content: [
                { type: 'text', text: JSON.stringify({ error: 'Figma Plugin이 연결되어 있지 않습니다' }) },
              ],
            };
          }
        }

        // JSON인 경우 기존 로직
        if (!args.data) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'data 필드가 필요합니다' }) }],
          };
        }

        // Save first
        const savedComponent = await storage.saveComponent(
          args.name as string,
          args.data as ExtractedNode
        );

        // Then import to Figma if connected
        if (wsServer.isFigmaConnected()) {
          await wsServer.createFrame(savedComponent.data, savedComponent.name, undefined, 'json', undefined, saveImportPluginId, saveImportPageId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `'${savedComponent.name}'이 저장되고 Figma로 가져와졌습니다`,
                  id: savedComponent.id,
                  target: {
                    pluginId: saveImportPluginId || '(default)',
                    pageId: saveImportPageId || '(current)',
                  },
                  format: 'json',
                }),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `'${savedComponent.name}'이 저장되었습니다 (Figma 연결 없음)`,
                  id: savedComponent.id,
                  format: 'json',
                }),
              },
            ],
          };
        }
      }

      // === Playwright Scripts ===
      case 'get_playwright_scripts': {
        const scripts = getPlaywrightScripts();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                scripts: scripts.map((s) => ({
                  name: s.name,
                  description: s.description,
                  path: s.path,
                  exists: s.exists,
                  api: s.api,
                  usage: s.usage,
                })),
              }),
            },
          ],
        };
      }

      // === Storage Management ===
      case 'sigma_storage_stats': {
        const fullStats = await storage.getFullStorageStats();

        const formatSize = (bytes: number) => {
          if (bytes < 1024) return `${bytes}B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
          return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                extracted: {
                  count: fullStats.extracted.count,
                  size: formatSize(fullStats.extracted.totalSize),
                  sizeBytes: fullStats.extracted.totalSize,
                },
                screenshots: {
                  count: fullStats.screenshots.count,
                  size: formatSize(fullStats.screenshots.totalSize),
                  sizeBytes: fullStats.screenshots.totalSize,
                },
                total: {
                  count: fullStats.total.count,
                  size: formatSize(fullStats.total.totalSize),
                  sizeBytes: fullStats.total.totalSize,
                },
                autoCleanup: {
                  ttlDays: 7,
                  startupThreshold: '100MB',
                  startupTarget: '50MB',
                },
              }),
            },
          ],
        };
      }

      case 'sigma_cleanup': {
        const olderThanDays = (args.olderThanDays as number) || 7;
        const category = (args.category as 'extracted' | 'screenshots' | 'all') || 'all';

        const result = await storage.cleanup({ olderThanDays, category });

        const formatSize = (bytes: number) => {
          if (bytes < 1024) return `${bytes}B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
          return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                deleted: result.deleted,
                freedSize: formatSize(result.freedBytes),
                freedBytes: result.freedBytes,
                criteria: {
                  olderThanDays,
                  category,
                },
                message: result.deleted > 0
                  ? `${result.deleted}개 파일 삭제됨 (${formatSize(result.freedBytes)} 확보)`
                  : '삭제할 파일이 없습니다',
              }),
            },
          ],
        };
      }

      case 'list_screenshots': {
        const screenshots = await storage.listScreenshots();

        const formatSize = (bytes: number) => {
          if (bytes < 1024) return `${bytes}B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
          return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: screenshots.length,
                screenshots: screenshots.map(s => ({
                  filename: s.filename,
                  path: s.path,
                  size: formatSize(s.size),
                  sizeBytes: s.size,
                  createdAt: s.createdAt,
                })),
              }),
            },
          ],
        };
      }

      case 'delete_screenshot': {
        const filename = args.filename as string;
        const deleted = await storage.deleteScreenshot(filename);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: deleted,
                message: deleted ? `'${filename}' 삭제됨` : `'${filename}'을 찾을 수 없습니다`,
              }),
            },
          ],
        };
      }

      // === Server Status ===
      case 'server_status': {
        const figmaStatus = wsServer.getStatus();
        const storageStats = await storage.getFullStorageStats();
        const tokenStatus = tokenStore.getStatus();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                server: 'running',
                figma: figmaStatus,
                storage: storageStats,
                tokens: tokenStatus,
                timestamp: new Date().toISOString(),
              }),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    };
  }
}
