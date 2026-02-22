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

- json (기본값): ExtractedNode 구조로 정확한 스타일 보존
- html: 인라인 스타일 HTML. 스타일 손실 가능성 있음`,
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        data: {
          type: ['object', 'string'],
          description: '프레임 데이터. format=json이면 ExtractedNode 객체, format=html이면 HTML 문자열',
        },
        format: {
          type: 'string',
          enum: ['json', 'html'],
          default: 'json',
          description: "데이터 형식 (기본값: 'json')",
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

- json (기본값): ExtractedNode 구조로 정확한 스타일 보존
- html: 인라인 스타일 HTML`,
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
          type: ['object', 'string'],
          description: '프레임 데이터. format=json이면 ExtractedNode 객체, format=html이면 HTML 문자열',
        },
        format: {
          type: 'string',
          enum: ['json', 'html'],
          default: 'json',
          description: "데이터 형식 (기본값: 'json')",
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
- Visual: setFills, setSolidFill, setStrokes, setStrokeWeight, setCornerRadius, setCornerRadii, setEffects, setBlendMode, setCornerSmoothing, setDashPattern, setMask
- Transform: setRotation
- Layout (Frame): setLayoutMode, setPadding, setItemSpacing, setClipsContent, setPrimaryAxisSizingMode, setCounterAxisSizingMode, setPrimaryAxisAlignItems, setCounterAxisAlignItems, setLayoutWrap, setCounterAxisSpacing, setLayoutSizing
- Layout (Child): setLayoutAlign, setLayoutGrow, setLayoutPositioning
- Constraints: setConstraints, setMinWidth, setMaxWidth, setMinHeight, setMaxHeight
- Text: setCharacters, setFontSize, setTextAlignHorizontal, setTextAlignVertical, setFontFamily, setFontWeight, setTextAutoResize, setLineHeight, setLetterSpacing
- Rich Text (Range): setRangeFontSize, setRangeFontName, setRangeFills, setRangeTextDecoration, setRangeLineHeight, setRangeLetterSpacing
- Rich Text (Advanced): setRangeHyperlink, setRangeListOptions, setRangeIndentation
- Plugin Data: setPluginData, getPluginData, getPluginDataKeys, setSharedPluginData, getSharedPluginData`,
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
    description: `Figma 노드를 지정된 포맷(JSON 또는 HTML)으로 추출합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다. nodeId로 노드를 직접 지정합니다.

- json (기본값): ExtractedNode 구조. sigma_create_frame으로 재생성 가능
- html: 인라인 스타일이 포함된 HTML 문자열. sigma_create_frame(format='html')로 재생성 가능

**주의:** 대형 노드(자식이 많은 경우)는 데이터 크기가 클 수 있습니다.`,
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
        format: {
          type: 'string',
          enum: ['json', 'html'],
          default: 'json',
          description: "추출 포맷. 'json' (기본값) 또는 'html'",
        },
      },
      required: ['token', 'nodeId'],
    },
  },
  {
    name: 'sigma_test_roundtrip',
    description: `Figma 노드를 지정된 포맷으로 추출한 후, 같은 포맷으로 새 프레임을 생성하는 라운드트립 테스트입니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다. nodeId로 노드를 직접 지정합니다.

**용도:** 추출 품질을 시각적으로 검증하는 수동 테스트.
원본 노드 옆에 추출된 데이터로 만든 복제본이 생성되므로, 둘을 나란히 비교할 수 있습니다.

**동작:**
1. nodeId로 원본 노드를 지정된 포맷(JSON/HTML)으로 추출
2. 추출된 데이터로 새 프레임을 생성 (이름: "[Test-FORMAT] {원본이름}")
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
        format: {
          type: 'string',
          enum: ['json', 'html'],
          default: 'json',
          description: "라운드트립 포맷 (기본값: 'json')",
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

JSON은 저장 후 가져오기, HTML은 저장 없이 바로 가져오기.`,
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
          type: ['object', 'string'],
          description: '프레임 데이터. format=json이면 ExtractedNode 객체, format=html이면 HTML 문자열',
        },
        format: {
          type: 'string',
          enum: ['json', 'html'],
          default: 'json',
          description: "데이터 형식 (기본값: 'json')",
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

  // === Create Nodes (토큰 필수) ===
  {
    name: 'sigma_create_rectangle',
    description: `Figma에 사각형(Rectangle)을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        width: { type: 'number', description: '너비' },
        height: { type: 'number', description: '높이' },
        name: { type: 'string', description: '노드 이름 (선택)' },
        parentId: { type: 'string', description: '부모 노드 ID (선택, 미지정 시 현재 페이지)' },
        fillColor: {
          type: 'object',
          description: '채우기 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        strokeColor: {
          type: 'object',
          description: '테두리 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        strokeWeight: { type: 'number', description: '테두리 두께' },
        cornerRadius: { type: 'number', description: '모서리 라운드' },
      },
      required: ['token', 'x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'sigma_create_text',
    description: `Figma에 텍스트 노드를 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
폰트 로딩이 필요하므로 비동기로 동작합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        text: { type: 'string', description: '텍스트 내용' },
        name: { type: 'string', description: '노드 이름 (선택)' },
        parentId: { type: 'string', description: '부모 노드 ID (선택)' },
        fontSize: { type: 'number', description: '폰트 크기 (기본 14)' },
        fontFamily: { type: 'string', description: '폰트 패밀리 (기본 "Inter")' },
        fontWeight: { type: 'number', description: '폰트 굵기 (100~900, 기본 400)' },
        fontColor: {
          type: 'object',
          description: '폰트 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        textAlignHorizontal: { type: 'string', enum: ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'], description: '텍스트 수평 정렬' },
      },
      required: ['token', 'x', 'y', 'text'],
    },
  },
  {
    name: 'sigma_create_empty_frame',
    description: `Figma에 빈 프레임(Frame)을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
Auto Layout, 패딩, 정렬 등 모든 프레임 옵션을 지원합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        width: { type: 'number', description: '너비' },
        height: { type: 'number', description: '높이' },
        name: { type: 'string', description: '프레임 이름 (선택)' },
        parentId: { type: 'string', description: '부모 노드 ID (선택)' },
        fillColor: {
          type: 'object',
          description: '배경 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: { r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' } },
        },
        layoutMode: { type: 'string', enum: ['NONE', 'HORIZONTAL', 'VERTICAL'], description: 'Auto Layout 모드' },
        layoutWrap: { type: 'string', enum: ['NO_WRAP', 'WRAP'], description: '줄바꿈 모드' },
        paddingTop: { type: 'number' }, paddingRight: { type: 'number' },
        paddingBottom: { type: 'number' }, paddingLeft: { type: 'number' },
        primaryAxisAlignItems: { type: 'string', enum: ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'] },
        counterAxisAlignItems: { type: 'string', enum: ['MIN', 'CENTER', 'MAX'] },
        layoutSizingHorizontal: { type: 'string', enum: ['FIXED', 'HUG', 'FILL'] },
        layoutSizingVertical: { type: 'string', enum: ['FIXED', 'HUG', 'FILL'] },
        itemSpacing: { type: 'number', description: '아이템 간격' },
        counterAxisSpacing: { type: 'number', description: '줄바꿈 시 행/열 간격' },
        cornerRadius: { type: 'number', description: '모서리 라운드' },
      },
      required: ['token', 'x', 'y', 'width', 'height'],
    },
  },

  // === Viewport (토큰 필수) ===
  {
    name: 'sigma_get_viewport',
    description: `현재 Figma 뷰포트 상태(중심점, 줌, 범위)를 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_set_viewport',
    description: `Figma 뷰포트 위치와 줌을 변경합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.

**사용 방법 (택 1):**
- center + zoom: 직접 위치/줌 설정
- nodeIds: 지정된 노드들이 보이도록 자동 조정 (scrollAndZoomIntoView)

nodeIds를 지정하면 center/zoom은 무시됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        center: {
          type: 'object',
          description: '뷰포트 중심점',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
        zoom: { type: 'number', description: '줌 레벨 (0.01~256, 1=100%)' },
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: '이 노드들이 보이도록 자동 조정 (center/zoom 대신 사용)',
        },
      },
      required: ['token'],
    },
  },

  // === Page Management (토큰 필수) ===
  {
    name: 'sigma_create_page',
    description: `새 페이지를 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        name: { type: 'string', description: '페이지 이름 (선택, 미지정 시 기본 이름)' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_rename_page',
    description: `페이지 이름을 변경합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
sigma_list_pages로 pageId를 먼저 확인하세요.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        pageId: { type: 'string', description: '대상 페이지 ID' },
        name: { type: 'string', description: '새 페이지 이름' },
      },
      required: ['token', 'pageId', 'name'],
    },
  },
  {
    name: 'sigma_switch_page',
    description: `현재 활성 페이지를 전환합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
sigma_list_pages로 pageId를 먼저 확인하세요.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        pageId: { type: 'string', description: '전환할 페이지 ID' },
      },
      required: ['token', 'pageId'],
    },
  },
  {
    name: 'sigma_delete_page',
    description: `페이지를 삭제합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
마지막 남은 페이지는 삭제할 수 없습니다.
현재 활성 페이지를 삭제하면 자동으로 다른 페이지로 전환됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        pageId: { type: 'string', description: '삭제할 페이지 ID' },
      },
      required: ['token', 'pageId'],
    },
  },

  // === Group / Ungroup / Flatten (토큰 필수) ===
  {
    name: 'sigma_group_nodes',
    description: `여러 노드를 Group으로 묶습니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
선택한 노드들이 하나의 Group 노드 아래로 묶입니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: '그룹화할 노드 ID 배열 (최소 1개)',
        },
        name: { type: 'string', description: 'Group 이름 (선택)' },
      },
      required: ['token', 'nodeIds'],
    },
  },
  {
    name: 'sigma_ungroup',
    description: `Group을 해제하여 자식 노드들을 부모로 이동시킵니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
대상 노드는 반드시 GROUP 타입이어야 합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '해제할 Group 노드 ID' },
      },
      required: ['token', 'nodeId'],
    },
  },
  {
    name: 'sigma_flatten',
    description: `여러 노드를 하나의 Vector 노드로 병합(Flatten)합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
원본 노드들은 삭제되고, 병합된 단일 Vector 노드가 생성됩니다.
복잡한 도형을 단순화하거나 Boolean 연산 결과를 확정할 때 사용합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Flatten할 노드 ID 배열 (최소 1개)',
        },
        name: { type: 'string', description: '결과 Vector 노드 이름 (선택)' },
      },
      required: ['token', 'nodeIds'],
    },
  },

  // === Boolean Operations (토큰 필수) ===
  {
    name: 'sigma_boolean_operation',
    description: `여러 노드에 Boolean 연산(합집합/차집합/교집합/배타적 합집합)을 수행합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
최소 2개의 노드가 필요합니다. 원본 노드들은 BooleanOperationNode로 대체됩니다.

**operation 종류:**
- UNION: 합집합 (모든 도형을 합침)
- SUBTRACT: 차집합 (첫 번째 도형에서 나머지를 뺌)
- INTERSECT: 교집합 (겹치는 영역만 남김)
- EXCLUDE: 배타적 합집합 (겹치는 영역을 제외)`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: '연산 대상 노드 ID 배열 (최소 2개)',
        },
        operation: {
          type: 'string',
          enum: ['UNION', 'SUBTRACT', 'INTERSECT', 'EXCLUDE'],
          description: 'Boolean 연산 종류',
        },
        name: { type: 'string', description: '결과 노드 이름 (선택)' },
      },
      required: ['token', 'nodeIds', 'operation'],
    },
  },

  // === Create Shapes (토큰 필수) ===
  {
    name: 'sigma_create_ellipse',
    description: `Figma에 타원(Ellipse)을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
arcData를 지정하면 반원, 부채꼴, 도넛 등의 호(arc) 형태를 만들 수 있습니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        width: { type: 'number', description: '너비' },
        height: { type: 'number', description: '높이' },
        name: { type: 'string', description: '노드 이름 (선택)' },
        parentId: { type: 'string', description: '부모 노드 ID (선택)' },
        fillColor: {
          type: 'object',
          description: '채우기 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        strokeColor: {
          type: 'object',
          description: '테두리 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        strokeWeight: { type: 'number', description: '테두리 두께' },
        arcData: {
          type: 'object',
          description: '호(arc) 데이터 (선택). 반원, 부채꼴, 도넛 등',
          properties: {
            startingAngle: { type: 'number', description: '시작 각도 (라디안, 기본 0)' },
            endingAngle: { type: 'number', description: '끝 각도 (라디안, 기본 2π)' },
            innerRadius: { type: 'number', description: '내부 반지름 비율 (0~0.9, 도넛 형태)' },
          },
        },
      },
      required: ['token', 'x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'sigma_create_polygon',
    description: `Figma에 다각형(Polygon)을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
pointCount로 꼭짓점 수를 지정합니다 (3=삼각형, 5=오각형, 6=육각형 등).`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        width: { type: 'number', description: '너비' },
        height: { type: 'number', description: '높이' },
        name: { type: 'string', description: '노드 이름 (선택)' },
        parentId: { type: 'string', description: '부모 노드 ID (선택)' },
        fillColor: {
          type: 'object',
          description: '채우기 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        strokeColor: {
          type: 'object',
          description: '테두리 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        strokeWeight: { type: 'number', description: '테두리 두께' },
        pointCount: { type: 'number', description: '꼭짓점 수 (기본 3, 삼각형)' },
      },
      required: ['token', 'x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'sigma_create_star',
    description: `Figma에 별(Star)을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
pointCount로 꼭짓점 수, innerRadius로 내부 반지름 비율을 조절합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        width: { type: 'number', description: '너비' },
        height: { type: 'number', description: '높이' },
        name: { type: 'string', description: '노드 이름 (선택)' },
        parentId: { type: 'string', description: '부모 노드 ID (선택)' },
        fillColor: {
          type: 'object',
          description: '채우기 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        strokeColor: {
          type: 'object',
          description: '테두리 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        strokeWeight: { type: 'number', description: '테두리 두께' },
        pointCount: { type: 'number', description: '꼭짓점 수 (기본 5)' },
        innerRadius: { type: 'number', description: '내부 반지름 비율 (0~1, 기본 0.382)' },
      },
      required: ['token', 'x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'sigma_create_line',
    description: `Figma에 선(Line)을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
기본적으로 수평선이 생성되며, rotation으로 각도를 조절할 수 있습니다.
strokeColor 미지정 시 검은색(#000) 선이 생성됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        length: { type: 'number', description: '선 길이' },
        name: { type: 'string', description: '노드 이름 (선택)' },
        parentId: { type: 'string', description: '부모 노드 ID (선택)' },
        strokeColor: {
          type: 'object',
          description: '선 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 } (기본 검은색)',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        strokeWeight: { type: 'number', description: '선 두께 (기본 1)' },
        rotation: { type: 'number', description: '회전 각도 (도, 기본 0 = 수평)' },
      },
      required: ['token', 'x', 'y', 'length'],
    },
  },
  {
    name: 'sigma_create_vector',
    description: `Figma에 벡터(Vector) 노드를 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
SVG 경로 데이터(vectorPaths)로 자유 형태의 도형을 만들 수 있습니다.

**vectorPaths 형식:**
\`[{ data: "M 0 0 L 100 0 L 50 100 Z", windingRule: "NONZERO" }]\`
data는 SVG path의 d 속성과 동일한 형식입니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        width: { type: 'number', description: '너비' },
        height: { type: 'number', description: '높이' },
        name: { type: 'string', description: '노드 이름 (선택)' },
        parentId: { type: 'string', description: '부모 노드 ID (선택)' },
        fillColor: {
          type: 'object',
          description: '채우기 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        strokeColor: {
          type: 'object',
          description: '테두리 색상 { r: 0~1, g: 0~1, b: 0~1, a?: 0~1 }',
          properties: {
            r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' },
          },
        },
        strokeWeight: { type: 'number', description: '테두리 두께' },
        vectorPaths: {
          type: 'array',
          description: 'SVG 경로 데이터 배열',
          items: {
            type: 'object',
            properties: {
              data: { type: 'string', description: 'SVG path d 속성 (예: "M 0 0 L 100 0 L 50 100 Z")' },
              windingRule: { type: 'string', enum: ['NONZERO', 'EVENODD'], description: '채우기 규칙 (기본 NONZERO)' },
            },
            required: ['data'],
          },
        },
      },
      required: ['token', 'x', 'y', 'width', 'height'],
    },
  },

  // === Variables (토큰 필수) ===
  {
    name: 'sigma_create_variable_collection',
    description: `변수 컬렉션(Variable Collection)을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
컬렉션은 변수를 그룹으로 묶는 컨테이너입니다. 기본 모드가 하나 자동 생성됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        name: { type: 'string', description: '컬렉션 이름 (예: "Colors", "Spacing")' },
      },
      required: ['token', 'name'],
    },
  },
  {
    name: 'sigma_create_variable',
    description: `변수(Variable)를 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
변수는 컬렉션에 속해야 합니다. sigma_create_variable_collection으로 먼저 컬렉션을 생성하세요.

**resolvedType:**
- COLOR: RGBA 색상 값
- FLOAT: 숫자 값 (크기, 간격 등)
- STRING: 문자열 값
- BOOLEAN: true/false`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        name: { type: 'string', description: '변수 이름 (예: "primary-color", "spacing-sm")' },
        collectionId: { type: 'string', description: '컬렉션 ID' },
        resolvedType: {
          type: 'string',
          description: '변수 타입',
          enum: ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'],
        },
      },
      required: ['token', 'name', 'collectionId', 'resolvedType'],
    },
  },
  {
    name: 'sigma_get_variables',
    description: `로컬 변수 컬렉션과 변수 목록을 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
각 변수의 모드별 값(valuesByMode)도 함께 반환합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        type: {
          type: 'string',
          description: '조회할 변수 타입 필터 (선택)',
          enum: ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'],
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_set_variable_value',
    description: `변수의 특정 모드에 값을 설정합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.

**값 형식 (resolvedType별):**
- COLOR: { r: 0~1, g: 0~1, b: 0~1, a: 0~1 }
- FLOAT: number
- STRING: "text"
- BOOLEAN: true/false`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        variableId: { type: 'string', description: '변수 ID' },
        modeId: { type: 'string', description: '모드 ID (sigma_get_variables에서 확인)' },
        value: { description: '설정할 값 (타입에 맞게)' },
      },
      required: ['token', 'variableId', 'modeId', 'value'],
    },
  },
  {
    name: 'sigma_bind_variable',
    description: `노드 속성에 변수를 바인딩합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
바인딩하면 변수 값이 변경될 때 노드 속성도 자동으로 업데이트됩니다.

**field 예시:** fills, strokes, opacity, width, height, itemSpacing, paddingLeft 등`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '대상 노드 ID' },
        field: { type: 'string', description: '바인딩할 노드 속성 필드명' },
        variableId: { type: 'string', description: '바인딩할 변수 ID' },
      },
      required: ['token', 'nodeId', 'field', 'variableId'],
    },
  },
  {
    name: 'sigma_add_variable_mode',
    description: `변수 컬렉션에 새 모드를 추가합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
모드는 Light/Dark 테마, 디바이스 크기 등을 표현합니다.
Figma 무료 플랜에서는 최대 1개의 모드만 지원합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        collectionId: { type: 'string', description: '컬렉션 ID' },
        name: { type: 'string', description: '모드 이름 (예: "Dark", "Mobile")' },
      },
      required: ['token', 'collectionId', 'name'],
    },
  },

  // === Styles (토큰 필수) ===
  {
    name: 'sigma_create_paint_style',
    description: `Paint(색상) 스타일을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
생성된 스타일은 sigma_apply_style로 노드에 적용할 수 있습니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        name: { type: 'string', description: '스타일 이름 (예: "Primary/Blue")' },
        paints: {
          type: 'array',
          description: '페인트 배열',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['SOLID'], description: '페인트 타입' },
              color: {
                type: 'object',
                description: '색상 { r: 0~1, g: 0~1, b: 0~1 }',
                properties: { r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' } },
                required: ['r', 'g', 'b'],
              },
              opacity: { type: 'number', description: '불투명도 0~1 (기본 1)' },
            },
            required: ['type', 'color'],
          },
        },
        description: { type: 'string', description: '스타일 설명 (선택)' },
      },
      required: ['token', 'name', 'paints'],
    },
  },
  {
    name: 'sigma_create_text_style',
    description: `Text 스타일을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
폰트 자동 로드 후 스타일을 생성합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        name: { type: 'string', description: '스타일 이름 (예: "Heading/H1")' },
        fontSize: { type: 'number', description: '폰트 크기 (선택)' },
        fontFamily: { type: 'string', description: '폰트 패밀리 (기본 Inter)' },
        fontWeight: { type: 'string', description: '폰트 두께 (기본 Regular)' },
        lineHeight: {
          description: '줄 높이 — "AUTO" 또는 { value, unit: "PIXELS"|"PERCENT" }',
        },
        letterSpacing: {
          type: 'object',
          description: '자간 { value, unit: "PIXELS"|"PERCENT" }',
          properties: {
            value: { type: 'number' },
            unit: { type: 'string', enum: ['PIXELS', 'PERCENT'] },
          },
        },
        textCase: { type: 'string', enum: ['ORIGINAL', 'UPPER', 'LOWER', 'TITLE'], description: '텍스트 대소문자' },
        textDecoration: { type: 'string', enum: ['NONE', 'UNDERLINE', 'STRIKETHROUGH'], description: '텍스트 장식' },
        description: { type: 'string', description: '스타일 설명 (선택)' },
      },
      required: ['token', 'name'],
    },
  },
  {
    name: 'sigma_create_effect_style',
    description: `Effect(그림자/블러) 스타일을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.

**effect type:**
- DROP_SHADOW: 외부 그림자
- INNER_SHADOW: 내부 그림자
- LAYER_BLUR: 레이어 블러
- BACKGROUND_BLUR: 배경 블러`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        name: { type: 'string', description: '스타일 이름 (예: "Shadow/Large")' },
        effects: {
          type: 'array',
          description: '효과 배열',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR'] },
              radius: { type: 'number', description: '블러 반경' },
              color: {
                type: 'object',
                description: '색상 { r, g, b, a } (그림자용)',
                properties: { r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' } },
              },
              offset: {
                type: 'object',
                description: '오프셋 { x, y } (그림자용)',
                properties: { x: { type: 'number' }, y: { type: 'number' } },
              },
              spread: { type: 'number', description: '퍼짐 (그림자용)' },
              visible: { type: 'boolean', description: '표시 여부 (기본 true)' },
            },
            required: ['type', 'radius'],
          },
        },
        description: { type: 'string', description: '스타일 설명 (선택)' },
      },
      required: ['token', 'name', 'effects'],
    },
  },
  {
    name: 'sigma_create_grid_style',
    description: `Grid(그리드) 스타일을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.

**pattern:** COLUMNS, ROWS, GRID
**alignment (COLUMNS/ROWS):** MIN, MAX, CENTER, STRETCH`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        name: { type: 'string', description: '스타일 이름 (예: "Grid/12col")' },
        grids: {
          type: 'array',
          description: '그리드 배열',
          items: {
            type: 'object',
            properties: {
              pattern: { type: 'string', enum: ['COLUMNS', 'ROWS', 'GRID'], description: '그리드 패턴' },
              sectionSize: { type: 'number', description: '셀 크기 (GRID: 기본 10, COLUMNS/ROWS: 기본 60)' },
              count: { type: 'number', description: '컬럼/로우 수 (기본 12, COLUMNS/ROWS만)' },
              gutterSize: { type: 'number', description: '거터 크기 (기본 20, COLUMNS/ROWS만)' },
              offset: { type: 'number', description: '오프셋 (기본 0, COLUMNS/ROWS만)' },
              alignment: { type: 'string', enum: ['MIN', 'MAX', 'CENTER', 'STRETCH'], description: '정렬 (COLUMNS/ROWS만)' },
              visible: { type: 'boolean', description: '표시 여부 (기본 true)' },
            },
            required: ['pattern'],
          },
        },
        description: { type: 'string', description: '스타일 설명 (선택)' },
      },
      required: ['token', 'name', 'grids'],
    },
  },
  {
    name: 'sigma_apply_style',
    description: `노드에 스타일을 적용합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
sigma_get_styles로 스타일 ID를 먼저 확인하세요.

**styleType:**
- fill: Paint 스타일을 fills에 적용
- stroke: Paint 스타일을 strokes에 적용
- text: Text 스타일 적용 (TEXT 노드만)
- effect: Effect 스타일 적용
- grid: Grid 스타일 적용 (FRAME/COMPONENT만)`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '대상 노드 ID' },
        styleType: {
          type: 'string',
          description: '스타일 타입',
          enum: ['fill', 'stroke', 'text', 'effect', 'grid'],
        },
        styleId: { type: 'string', description: '적용할 스타일 ID' },
      },
      required: ['token', 'nodeId', 'styleType', 'styleId'],
    },
  },
  {
    name: 'sigma_delete_style',
    description: `스타일을 삭제합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
sigma_get_styles로 스타일 ID를 먼저 확인하세요.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        styleId: { type: 'string', description: '삭제할 스타일 ID' },
      },
      required: ['token', 'styleId'],
    },
  },

  // === Image (토큰 필수) ===
  {
    name: 'sigma_create_image',
    description: `Figma에 이미지 노드를 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
base64 인코딩된 이미지 데이터를 받아 Rectangle에 IMAGE fill로 적용합니다.

**scaleMode:**
- FILL (기본): 프레임에 맞게 이미지를 채움 (잘릴 수 있음)
- FIT: 프레임 안에 이미지를 맞춤 (여백 가능)
- CROP: 원본 크기 유지, 잘림
- TILE: 타일 반복`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        width: { type: 'number', description: '너비' },
        height: { type: 'number', description: '높이' },
        imageData: { type: 'string', description: 'base64 인코딩된 이미지 데이터' },
        name: { type: 'string', description: '노드 이름 (선택)' },
        parentId: { type: 'string', description: '부모 노드 ID (선택)' },
        scaleMode: {
          type: 'string',
          description: '이미지 스케일 모드 (기본 FILL)',
          enum: ['FILL', 'FIT', 'CROP', 'TILE'],
        },
        cornerRadius: { type: 'number', description: '모서리 둥글기 (선택)' },
      },
      required: ['token', 'x', 'y', 'width', 'height', 'imageData'],
    },
  },

  // === Selection (토큰 필수) ===
  {
    name: 'sigma_get_selection',
    description: `Figma에서 현재 선택된 노드 목록을 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_set_selection',
    description: `Figma에서 특정 노드들을 선택하고, 뷰포트를 해당 노드로 이동합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: '선택할 노드 ID 배열',
        },
        zoomToFit: { type: 'boolean', description: '선택 후 뷰포트 이동 여부 (기본 true)' },
      },
      required: ['token', 'nodeIds'],
    },
  },

  // === Components (토큰 필수) ===
  {
    name: 'sigma_get_local_components',
    description: `Figma 파일의 로컬 컴포넌트 목록을 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
각 컴포넌트의 key, name, description, 크기 등을 반환합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_create_component_instance',
    description: `컴포넌트 키로 인스턴스를 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
sigma_get_local_components에서 얻은 key를 사용하세요.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        componentKey: { type: 'string', description: '컴포넌트 key (sigma_get_local_components에서 확인)' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        parentId: { type: 'string', description: '부모 노드 ID (선택)' },
      },
      required: ['token', 'componentKey', 'x', 'y'],
    },
  },
  {
    name: 'sigma_get_instance_overrides',
    description: `컴포넌트 인스턴스의 오버라이드 가능한 속성을 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
nodeId를 지정하지 않으면 현재 선택된 인스턴스를 사용합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '인스턴스 노드 ID (선택, 미지정 시 현재 선택)' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_set_instance_overrides',
    description: `컴포넌트 인스턴스의 오버라이드 속성을 설정합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
sigma_get_instance_overrides로 속성 이름을 먼저 확인하세요.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '인스턴스 노드 ID' },
        overrides: {
          type: 'object',
          description: '설정할 오버라이드 속성 (키: 속성명, 값: 새 값)',
        },
      },
      required: ['token', 'nodeId', 'overrides'],
    },
  },

  // === Query (토큰 필수) ===
  {
    name: 'sigma_get_node_info',
    description: `Figma 노드의 상세 정보를 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
노드 타입에 따라 fills, strokes, text, layout 등의 추가 정보가 포함됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '조회할 노드 ID' },
      },
      required: ['token', 'nodeId'],
    },
  },
  {
    name: 'sigma_get_document_info',
    description: `Figma 문서 정보(파일명, 페이지 목록, 현재 페이지)를 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_get_styles',
    description: `Figma 파일의 로컬 스타일(Paint, Text, Effect, Grid)을 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
      },
      required: ['token'],
    },
  },

  // === Batch (토큰 필수) ===
  {
    name: 'sigma_scan_text_nodes',
    description: `특정 노드 하위의 모든 텍스트 노드를 스캔합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
텍스트 내용, 폰트 정보, 경로를 함께 반환합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '스캔 시작점 노드 ID' },
      },
      required: ['token', 'nodeId'],
    },
  },
  {
    name: 'sigma_scan_nodes_by_types',
    description: `특정 노드 하위에서 지정한 타입의 노드를 스캔합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.

**사용 예시:**
- 모든 프레임: sigma_scan_nodes_by_types({ nodeId: "1:234", types: ["FRAME"] })
- 프레임+텍스트: sigma_scan_nodes_by_types({ nodeId: "1:234", types: ["FRAME", "TEXT"] })`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '스캔 시작점 노드 ID' },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: '스캔할 노드 타입 배열 (예: ["FRAME", "TEXT", "RECTANGLE"])',
        },
      },
      required: ['token', 'nodeId', 'types'],
    },
  },
  {
    name: 'sigma_batch_modify',
    description: `여러 노드에 대한 modify 작업을 일괄 실행합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
각 작업은 sigma_modify_node와 동일한 메서드/인자를 사용합니다.
개별 작업이 실패해도 나머지는 계속 실행됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '대상 노드 ID' },
              method: { type: 'string', description: '실행할 메서드' },
              args: { type: 'object', description: '메서드 인자 (선택)' },
            },
            required: ['nodeId', 'method'],
          },
          description: '실행할 작업 배열',
        },
      },
      required: ['token', 'operations'],
    },
  },
  {
    name: 'sigma_batch_delete',
    description: `여러 노드를 일괄 삭제합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
Document/Page 노드는 삭제할 수 없습니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: '삭제할 노드 ID 배열',
        },
      },
      required: ['token', 'nodeIds'],
    },
  },

  // === Batch Text (토큰 필수) ===
  {
    name: 'sigma_set_multiple_text_contents',
    description: `여러 텍스트 노드의 내용을 일괄 변경합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
폰트를 일괄 로드한 후 텍스트를 변경하므로 개별 호출보다 효율적입니다.
sigma_scan_text_nodes로 텍스트 노드 목록을 먼저 조회한 후 사용하세요.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '텍스트 노드 ID' },
              text: { type: 'string', description: '새 텍스트 내용' },
            },
            required: ['nodeId', 'text'],
          },
          description: '변경할 텍스트 항목 배열',
        },
      },
      required: ['token', 'items'],
    },
  },

  // === Query Batch (토큰 필수) ===
  {
    name: 'sigma_get_nodes_info',
    description: `여러 노드의 상세 정보를 일괄 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
sigma_get_node_info의 배치 버전으로, 여러 nodeId를 한 번에 조회할 수 있습니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: '조회할 노드 ID 배열',
        },
      },
      required: ['token', 'nodeIds'],
    },
  },
  {
    name: 'sigma_read_my_design',
    description: `현재 Figma에서 선택된 노드들의 상세 정보를 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
sigma_get_selection + sigma_get_node_info를 합친 편의 도구입니다.
각 노드의 fills, strokes, 텍스트 속성, 레이아웃 정보 등을 포함합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
      },
      required: ['token'],
    },
  },

  // === Batch Annotations (토큰 필수) ===
  {
    name: 'sigma_set_multiple_annotations',
    description: `여러 노드에 주석(Annotation)을 일괄 추가합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
개별 작업이 실패해도 나머지는 계속 실행됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: '대상 노드 ID' },
              label: { type: 'string', description: '주석 라벨 텍스트' },
              labelType: { type: 'string', description: '주석 라벨 타입 (선택)' },
            },
            required: ['nodeId', 'label'],
          },
          description: '추가할 주석 항목 배열',
        },
      },
      required: ['token', 'items'],
    },
  },

  // === Annotations (토큰 필수) ===
  {
    name: 'sigma_get_annotations',
    description: `노드의 주석(Annotation) 목록을 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
nodeId를 지정하지 않으면 현재 선택된 노드를 사용합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '조회할 노드 ID (선택, 미지정 시 현재 선택)' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_set_annotation',
    description: `노드에 주석(Annotation)을 추가합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '대상 노드 ID' },
        label: { type: 'string', description: '주석 라벨 텍스트' },
        labelType: { type: 'string', description: '주석 라벨 타입 (선택)' },
      },
      required: ['token', 'nodeId', 'label'],
    },
  },

  // === Prototyping (토큰 필수) ===
  {
    name: 'sigma_get_reactions',
    description: `노드의 프로토타이핑 인터랙션(Reaction) 목록을 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
nodeId를 지정하지 않으면 현재 선택된 노드를 사용합니다.
각 Reaction은 trigger(트리거)와 actions(액션) 배열로 구성됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '조회할 노드 ID (선택, 미지정 시 현재 선택)' },
      },
      required: ['token'],
    },
  },

  {
    name: 'sigma_add_reaction',
    description: `노드에 프로토타이핑 인터랙션(Reaction)을 추가합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.

**trigger 종류:** ON_CLICK, ON_HOVER, ON_PRESS, ON_DRAG, MOUSE_ENTER, MOUSE_LEAVE, AFTER_TIMEOUT
**action 종류:** NAVIGATE(페이지 이동), OVERLAY(팝업), BACK(뒤로가기), CLOSE(닫기), OPEN_URL(외부 링크), SCROLL_TO(스크롤), SWAP(교체)

**사용 예시:**
- 클릭 시 다른 프레임으로 이동: sigma_add_reaction({ nodeId, trigger: "ON_CLICK", action: "NAVIGATE", destinationId: "123:456" })
- 호버 시 팝업 표시: sigma_add_reaction({ nodeId, trigger: "ON_HOVER", action: "OVERLAY", destinationId: "789:012" })
- 클릭 시 외부 링크: sigma_add_reaction({ nodeId, trigger: "ON_CLICK", action: "OPEN_URL", url: "https://..." })`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '대상 노드 ID' },
        trigger: {
          type: 'string',
          description: '트리거 종류',
          enum: ['ON_CLICK', 'ON_HOVER', 'ON_PRESS', 'ON_DRAG', 'MOUSE_ENTER', 'MOUSE_LEAVE', 'AFTER_TIMEOUT'],
        },
        action: {
          type: 'string',
          description: '액션 종류',
          enum: ['NAVIGATE', 'OVERLAY', 'BACK', 'CLOSE', 'OPEN_URL', 'SCROLL_TO', 'SWAP'],
        },
        destinationId: { type: 'string', description: '대상 프레임/페이지 노드 ID (NAVIGATE, OVERLAY, SCROLL_TO, SWAP에 필요)' },
        url: { type: 'string', description: '외부 URL (OPEN_URL에 필요)' },
        transition: {
          type: 'object',
          description: '전환 효과 (선택)',
          properties: {
            type: {
              type: 'string',
              description: '전환 타입',
              enum: ['DISSOLVE', 'SMART_ANIMATE', 'MOVE_IN', 'MOVE_OUT', 'PUSH', 'SLIDE_IN', 'SLIDE_OUT'],
            },
            duration: { type: 'number', description: '전환 시간(초, 기본 0.3)' },
            direction: { type: 'string', description: '전환 방향', enum: ['LEFT', 'RIGHT', 'TOP', 'BOTTOM'] },
          },
        },
        preserveScrollPosition: { type: 'boolean', description: '스크롤 위치 유지 여부' },
      },
      required: ['token', 'nodeId', 'trigger', 'action'],
    },
  },
  {
    name: 'sigma_remove_reactions',
    description: `노드의 프로토타이핑 인터랙션(Reaction)을 제거합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.

triggerType을 지정하면 해당 트리거의 리액션만 제거하고, 미지정 시 모든 리액션을 제거합니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '대상 노드 ID' },
        triggerType: {
          type: 'string',
          description: '제거할 트리거 종류 (선택, 미지정 시 전체 제거)',
          enum: ['ON_CLICK', 'ON_HOVER', 'ON_PRESS', 'ON_DRAG', 'MOUSE_ENTER', 'MOUSE_LEAVE', 'AFTER_TIMEOUT'],
        },
      },
      required: ['token', 'nodeId'],
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
