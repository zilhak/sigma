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
    description: `Sigma 토큰을 발급합니다. 토큰 자체는 아직 아무 대상에도 연결되지 않은 상태입니다.

**Figma 작업을 하려면 반드시 바인딩이 필요합니다:**
1. sigma_login → 토큰 발급
2. sigma_list_plugins → pluginId 확인
3. sigma_list_pages(pluginId) → pageId 확인
4. sigma_bind(token, pluginId, pageId) → 토큰을 특정 플러그인+페이지에 바인딩

바인딩 후에는 같은 token으로 호출하는 모든 Figma 도구가 해당 플러그인/페이지를 대상으로 동작합니다.
토큰은 10분간 유효하며, 사용할 때마다 자동 갱신됩니다.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sigma_logout',
    description: 'Sigma 토큰을 삭제합니다. 해당 토큰의 바인딩도 함께 해제됩니다.',
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

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
바인딩된 페이지에 프레임이 생성됩니다.

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

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
바인딩된 페이지에 프레임이 생성됩니다.`,
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

**바인딩 필수**: 토큰이 바인딩된 페이지의 프레임 목록을 반환합니다.`,
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

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.`,
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

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
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

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다. nodeId로 노드를 직접 지정합니다.
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

**바인딩 필수**: 토큰이 바인딩된 페이지 내에서 검색합니다.
바인딩되지 않은 토큰으로는 사용할 수 없습니다. 먼저 sigma_bind로 대상 페이지를 지정하세요.

**경로 형식:**
- 문자열: "Section/Frame/Button"
- 배열: ["Section", "Frame", "Button"]

**반환값:**
- 단일 매칭: { node: { id, name, type, boundingBox, ... } }
- 다중 매칭: { matches: [...], warning: "N개의 노드가 발견되었습니다" }

**사용 예시:**
- "Button" — 바인딩된 페이지 최상위에서 Button 이름의 노드 찾기
- "Components/Button" — Components 안의 Button 찾기
- "Design System/Buttons/Primary" — 깊은 경로 탐색`,
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

**바인딩 필수**: 토큰이 바인딩된 페이지를 대상으로 탐색합니다.
시작점을 지정하지 않으면 바인딩된 페이지의 최상위 자식부터 탐색합니다.

**시작점 지정 (둘 중 하나, 선택):**
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
- 바인딩된 페이지 최상위: sigma_get_tree({ token })
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
    name: 'sigma_create_section',
    description: `Figma에 Section을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
바인딩된 페이지에 Section이 생성됩니다.

Section은 Figma의 조직화 컨테이너입니다. Frame과 달리 Auto Layout을 지원하지 않지만,
페이지의 콘텐츠를 논리적으로 그룹화하는 데 사용됩니다.

**children**: 기존 노드의 ID 배열을 전달하면, 해당 노드들이 Section 안으로 이동합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        name: {
          type: 'string',
          description: 'Section 이름',
        },
        position: {
          type: 'object',
          description: 'Section 생성 위치 (x, y 좌표)',
          properties: {
            x: { type: 'number', description: 'X 좌표' },
            y: { type: 'number', description: 'Y 좌표' },
          },
        },
        size: {
          type: 'object',
          description: 'Section 크기 (width, height)',
          properties: {
            width: { type: 'number', description: '너비' },
            height: { type: 'number', description: '높이' },
          },
        },
        children: {
          type: 'array',
          items: { type: 'string' },
          description: 'Section에 포함시킬 기존 노드 ID 배열 (선택사항)',
        },
        fills: {
          type: 'array',
          description: 'Section 배경 채우기 (Figma Paint 배열, 선택사항)',
        },
      },
      required: ['token', 'name'],
    },
  },
  {
    name: 'sigma_move_node',
    description: `Figma 노드를 다른 부모 노드로 이동(reparent)합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다. nodeId로 노드를 직접 지정합니다.

노드를 Section, Frame, Group, 또는 Page의 자식으로 이동시킵니다.
기존 부모에서 자동으로 제거되고 새 부모에 추가됩니다.

**사용 예시:**
- 프레임을 Section으로 이동: sigma_move_node({ nodeId: "1:234", parentId: "5:678" })
- 특정 위치에 삽입: sigma_move_node({ nodeId: "1:234", parentId: "5:678", index: 0 })`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        nodeId: {
          type: 'string',
          description: '이동할 노드 ID (예: "123:456")',
        },
        parentId: {
          type: 'string',
          description: '대상 부모 노드 ID (Section, Frame, Group, Page 등)',
        },
        index: {
          type: 'number',
          description: '삽입 위치 인덱스 (선택, 미지정 시 맨 뒤에 추가)',
        },
      },
      required: ['token', 'nodeId', 'parentId'],
    },
  },
  {
    name: 'sigma_clone_node',
    description: `Figma 노드를 복제합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다. nodeId로 노드를 직접 지정합니다.

모든 SceneNode 타입(Frame, Section, Group, Text, Rectangle 등)을 복제할 수 있습니다.
복제된 노드는 기본적으로 원본과 같은 부모에 생성됩니다.
parentId를 지정하면 다른 부모로 복제할 수 있고, position으로 좌표를 지정할 수 있습니다.

**사용 예시:**
- 같은 위치에 복제: sigma_clone_node({ nodeId: "1:234" })
- 다른 부모로 복제: sigma_clone_node({ nodeId: "1:234", parentId: "5:678" })
- 좌표 지정: sigma_clone_node({ nodeId: "1:234", position: { x: 100, y: 200 } })
- 이름 변경: sigma_clone_node({ nodeId: "1:234", name: "Button Copy" })`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        nodeId: {
          type: 'string',
          description: '복제할 원본 노드 ID (예: "123:456")',
        },
        parentId: {
          type: 'string',
          description: '복제된 노드의 부모 ID (선택, 미지정 시 원본과 같은 부모)',
        },
        position: {
          type: 'object',
          description: '복제된 노드의 좌표 (선택)',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['x', 'y'],
        },
        name: {
          type: 'string',
          description: '복제된 노드의 이름 (선택, 미지정 시 원본 이름 유지)',
        },
      },
      required: ['token', 'nodeId'],
    },
  },

  {
    name: 'sigma_screenshot',
    description: `Figma 노드를 이미지로 캡처하여 로컬 파일로 저장합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다. nodeId로 노드를 직접 지정합니다.

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

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다. nodeId로 노드를 직접 지정합니다.

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

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다. nodeId로 노드를 직접 지정합니다.

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

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
바인딩된 페이지에 프레임이 생성됩니다.

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
