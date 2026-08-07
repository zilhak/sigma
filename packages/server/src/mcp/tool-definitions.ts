// Tool definitions for MCP
export const toolDefinitions = [
  // === Storage Tools (토큰 불필요) ===
  {
    name: 'sigma_save_extracted',
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
    name: 'sigma_list_saved',
    description: '저장된 컴포넌트 목록을 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sigma_load_extracted',
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
    name: 'sigma_delete_extracted',
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
- html: 인라인 스타일 HTML. 스타일 손실 가능성 있음

**position 안내:**
position을 생략하면 자동 배치됩니다 (바인딩된 페이지의 기존 내용 맨 아래에서 200px 아래, x는 항상 0. 빈 페이지면 (0, 0)).
가로로 나란히 놓거나 좌표를 확정해야 하면 position을 명시하세요 — 자동 배치는 호출 시점의 페이지 내용을 기준으로 계산하므로 동시 작업 중에는 값이 달라질 수 있습니다.`,
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
        html: {
          type: 'string',
          description: "(선택) data 의 별칭 — HTML 문자열을 바로 전달. 이걸 쓰면 format 은 자동으로 'html'",
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
        layoutMode: {
          type: 'string',
          enum: ['auto', 'absolute'],
          default: 'auto',
          description: "레이아웃 모드. 'auto': Auto Layout 사용 (기본값), 'absolute': 모든 노드를 boundingRect 기반 절대 배치 (형상 정확도 우선)",
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_import_saved',
    description: `저장된 컴포넌트를 Figma로 가져옵니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
바인딩된 페이지에 프레임이 생성됩니다.

**position 안내:**
position을 생략하면 자동 배치됩니다 (바인딩된 페이지의 기존 내용 맨 아래에서 200px 아래, x는 항상 0. 빈 페이지면 (0, 0)).
가로로 나란히 놓거나 좌표를 확정해야 하면 position을 명시하세요 — 자동 배치는 호출 시점의 페이지 내용을 기준으로 계산하므로 동시 작업 중에는 값이 달라질 수 있습니다.`,
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
        layoutMode: {
          type: 'string',
          enum: ['auto', 'absolute'],
          default: 'auto',
          description: "레이아웃 모드. 'auto': Auto Layout 사용 (기본값), 'absolute': 모든 노드를 boundingRect 기반 절대 배치 (형상 정확도 우선)",
        },
      },
      required: ['token', 'id'],
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

⚠️ **resize/move 주의**: 프레임/섹션을 아래·옆으로 키우면 그쪽에 있던 **형제 노드를 덮을 수 있습니다**(로스 노드는 자유 배치라 겹쳐도 육안으로 안 보임). 큰 변형 전엔 sigma_get_tree(depth:1)로 형제 bbox를 확인하고, 변형 후엔 sigma_lint로 회귀 검사하세요.

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
- Plugin Data: setPluginData, getPluginData, getPluginDataKeys, setSharedPluginData, getSharedPluginData
- Advanced Visual: setStrokeAlign, setStrokeCap, setStrokeJoin, setIndividualStrokeWeights, setParagraphSpacing, setParagraphIndent, setTextCase, setTextTruncation, setMaxLines, setOverflowDirection, setGradientFill, setImageFill`,
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
    description: `Figma 노드를 찾습니다. **두 가지 방식** 중 하나를 씁니다 (상호배타).
- \`path\`: 경로/이름으로 특정 노드 하나를 찾음
- \`where\`: **속성 조건**으로 맞는 노드를 전부 찾음 (예: width 가 1000 넘는 노드 전부)

**바인딩 필수**: 토큰이 바인딩된 페이지 내에서 검색합니다.
바인딩되지 않은 토큰으로는 사용할 수 없습니다. 먼저 sigma_bind로 대상 페이지를 지정하세요.

**경로 형식:**
- 문자열: "Section/Frame/Button" — '/'를 계층 구분자로 해석해 쪼갭니다
- 배열: ["Section", "Frame", "Button"] — 각 원소를 리터럴 이름으로 매칭 (쪼개지 않음)

**이름에 '/'가 포함된 노드**(예: Assets 그룹핑용 "icon/arrow/left")는 반드시 배열 형태로 찾으세요:
path: ["icon/arrow/left"] (원소 1개짜리 배열)

**반환값:**
- 단일 매칭: { node: { id, name, type, boundingBox, ... } }
- 다중 매칭: { matches: [...], warning: "N개의 노드가 발견되었습니다" }

**사용 예시:**
- "Button" — 바인딩된 페이지 최상위에서 Button 이름의 노드 찾기
- "Components/Button" — Components 안의 Button 찾기
- "Design System/Buttons/Primary" — 깊은 경로 탐색

## where — 속성 조건 검색

\`select\`(대상 좁히기) + \`checks\`(조건들, **모두 만족해야 하는 AND**) 형태입니다.
OR 이 필요하면 조건을 나눠 여러 번 호출하세요(쿼리 언어를 늘리지 않습니다).
연산자는 sigma_lint 의 커스텀 규칙과 **완전히 동일한 5개**뿐입니다:
\`equals\` · \`range\`(min/max) · \`regex\`(pattern) · \`oneOf\`(values) · \`exists\`

\`\`\`jsonc
// width 가 1000 넘는 노드 전부
{ "where": { "checks": [{ "op": "range", "field": "width", "min": 1000 }] } }

// 이름이 Card 로 시작하는 FRAME 중 높이 200~400
{ "where": {
    "select": { "type": "FRAME", "namePattern": "^Card" },
    "checks": [{ "op": "range", "field": "height", "min": 200, "max": 400 }]
} }

// 오토레이아웃이 아닌 프레임 (상세 필드 → 왕복 1회 추가)
{ "where": { "select": { "type": "FRAME" }, "checks": [{ "op": "equals", "field": "layoutMode", "value": "NONE" }] } }
\`\`\`

**비용**: \`id·name·type·x·y·width·height·childCount·visible·locked\` 만 쓰면 트리 조회 1회로 끝납니다.
그 밖의 필드(\`fills\`·\`opacity\`·\`cornerRadius\`·\`characters\`·\`fontSize\`·\`layoutMode\`·
\`layoutSizing*\`·\`strokes\`·\`strokeWeight\`·\`description\`)를 조건에 쓰면 상세 조회 왕복이
한 번 추가됩니다(응답의 \`enriched: true\`로 확인). \`fills[0].color.r\` 처럼 중첩 경로도 됩니다.

**범위**: 바인딩된 페이지 전체가 기본이며, \`nodeId\`로 특정 노드 하위로 좁힐 수 있습니다.
결과가 \`limit\`(기본 200)을 넘으면 \`truncated: true\`와 함께 앞부분만 반환합니다.
**검사 범위는 페이지 전체**입니다 — 트리를 20만 노드까지 뜨므로 "앞부분만 보고 0건"은 나지 않습니다.
그래도 상한에 걸리면 \`scanTruncated: true\`·\`scannedNodes\`·\`scanWarning\`이 실립니다. **이 필드가 있으면
결과를 "전부"로 읽지 말고** \`nodeId\`로 범위를 나눠 다시 검색하세요(예: 스펙 삭제 전 인스턴스 0 확인).

**반환**: \`{ matchCount, returned, truncated, enriched, nodes: [{ nodeId, name, type, x, y, width, height }] }\`
찾은 \`nodeId\` 들을 sigma_batch_modify / sigma_batch_delete 에 그대로 넘겨 일괄 처리할 수 있습니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Sigma 토큰 (stk-...)',
        },
        path: {
          type: ['string', 'array'],
          description: '찾을 노드의 경로 ("A/B/C" 또는 ["A", "B", "C"]). where 와 상호배타',
          items: { type: 'string' },
        },
        type: {
          type: 'string',
          description: '(path 모드) 특정 타입만 필터링 (예: "FRAME", "SECTION", "GROUP")',
        },
        where: {
          type: 'object',
          description: '속성 조건 검색. path 와 상호배타',
          properties: {
            select: {
              type: 'object',
              description: '대상 좁히기 (생략 시 전체 노드)',
              properties: {
                type: { type: 'string', description: '노드 타입 (예: "FRAME")' },
                namePattern: { type: 'string', description: '이름 정규식 (예: "^Card")' },
              },
            },
            checks: {
              type: 'array',
              description: '조건 배열 — 모두 만족해야 함(AND). OR 은 호출을 나눈다',
              items: {
                type: 'object',
                properties: {
                  op: {
                    type: 'string',
                    enum: ['equals', 'range', 'regex', 'oneOf', 'exists'],
                    description: '연산자 (sigma_lint 커스텀 규칙과 동일)',
                  },
                  field: { type: 'string', description: '노드 필드 경로 (예: "width", "fills[0].opacity")' },
                  value: { description: 'equals 비교값' },
                  min: { type: 'number', description: 'range 최소' },
                  max: { type: 'number', description: 'range 최대' },
                  pattern: { type: 'string', description: 'regex 패턴' },
                  values: { type: 'array', description: 'oneOf 허용값 목록' },
                },
                required: ['op', 'field'],
              },
            },
          },
        },
        nodeId: {
          type: 'string',
          description: '(where 모드) 검색 시작 노드 — 이 노드 하위만 검색. 미지정 시 바인딩 페이지 전체',
        },
        limit: {
          type: 'number',
          description: '(where 모드) 반환 상한 (기본 200). 초과 시 truncated: true',
        },
      },
      required: ['token'],
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

**fields — 응답에 실을 필드 (기본 "all"):**
- \`all\`: 노드마다 id/name/type/boundingBox/childCount/children + \`fullPath\` + \`meta\`(visible·locked·layoutMode·characters(최대 100자)·layoutSizing·description)
- \`geometry\`: **좌표 작업 전용 축약** — id/name/type/boundingBox/childCount/children + \`absolute\` 만. fullPath·meta 를 통째로 뺀다.
  위치 보정처럼 좌표만 필요한 작업에서 meta.characters·fullPath 가 페이로드를 지배하는 걸 막는다.

⚠️ **좌표계**: \`boundingBox\` 는 **직속 부모 로컬좌표**다(Figma 의 모든 컨테이너가 자식 원점을 새로 잡는다 — 섹션도 동일).
\`fields:"geometry"\` 는 여기에 페이지 **절대좌표** \`absolute: {x, y}\` 를 같이 준다. 서로 다른 섹션에 든 노드끼리
겹침·거리를 판단하려면 \`absolute\` 를, 실제로 위치를 고칠 땐(sigma_modify_node 의 move/resize) 로컬 \`boundingBox\` 를 쓴다.

**사용 예시:**
- 바인딩된 페이지 최상위: sigma_get_tree({ token })
- 특정 섹션 내부: sigma_get_tree({ token, path: "Design System" })
- 프레임 전체 구조: sigma_get_tree({ token, nodeId: "1:234", depth: "full" })
- 페이지 전체 좌표만: sigma_get_tree({ token, depth: "full", fields: "geometry" })`,
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
        includeAbsolute: {
          type: 'boolean',
          description: "(선택) true 면 'all' 응답에도 페이지 절대좌표 absolute:{x,y} 를 함께 싣습니다. boundingBox 는 직속 부모 로컬좌표라 컨테이너가 다른 노드끼리는 비교가 안 되는데, fields:'geometry' 로 바꾸면 meta·fullPath 를 잃습니다. 노드 수만큼 payload 가 늘어나니 좌표 비교가 필요할 때만 켜세요",
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
        fields: {
          type: 'string',
          enum: ['all', 'geometry'],
          description: '응답 필드 집합. "all"(기본)=fullPath+meta 포함 / "geometry"=좌표 전용 축약(fullPath·meta 생략, 절대좌표 absolute 추가)',
        },
      },
      required: ['token'],
    },
  },

  {
    name: 'sigma_set_page_data',
    description: `Figma **페이지(또는 문서 루트) 노드**에 sigma 전용 메타데이터를 저장합니다.

일반 노드는 sigma_modify_node로 다루지만 PAGE/DOCUMENT 노드는 가드로 막혀 있어,
이 전용 도구로만 페이지/문서 레벨 데이터를 붙일 수 있습니다.
저장 위치는 해당 노드의 sharedPluginData(namespace 고정 **"sigma"**)이며 .fig 파일에 영속됩니다.

**형식 강제:**
- namespace는 항상 "sigma" (호출자가 못 바꿈).
- \`key\`는 \`^[a-zA-Z0-9_.-]+$\` 만 허용.
- \`value\`는 반드시 **유효한 JSON 문자열**이어야 함(문자열/숫자/객체/배열 모두 JSON으로 직렬화해 전달). JSON parse 실패 시 거부.

**대상(pageId):**
- 미지정: 바인딩된 페이지.
- 페이지 ID(예 "13:62"): 그 페이지.
- "document": 문서 루트(파일 전역 기본값 저장용).

**예약 key:** \`"lint"\` = 그 페이지의 lint 설정(LintConfig JSON). sigma_lint의 per-page/merge 모드가 이 값을 참조합니다.
**문서(pageId:"document")에 저장하면** 같은 JSON 의 \`componentSpec.warn\` 이 그 파일의 **컴포넌트 스펙 등록 정책**으로도 쓰입니다 —
alias 가 패턴에 걸리면 sigma_create_component_spec 응답에 policyWarnings 가 실립니다(경고만, 등록은 진행).

**예약 key:** \`"fonts"\` (pageId:"document" 전용) = 이 파일의 **기본 폰트**. 예: \`'{"default":"Pretendard"}'\`.
HTML/스펙이 font-family를 지정하지 않은 텍스트, 그리고 fontFamily 인자를 생략한 sigma_create_text/create_text_style이 이 폰트로 만들어집니다.
미설정이면 Inter(Figma 기본)입니다 — 폰트는 파일의 디자인 시스템 결정이므로 변환기가 특정 폰트를 강요하지 않습니다.
설정한 폰트가 그 환경에 설치돼 있지 않으면 Inter로 폴백합니다.

**예시:**
- 페이지 lint 설정 저장: sigma_set_page_data({ token, key: "lint", value: '{"builtins":{"raw_node":{"enabled":true}}}' })
- 문서 전역 base 저장: sigma_set_page_data({ token, key: "lint", value: '{...}', pageId: "document" })`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        key: { type: 'string', description: '데이터 키 (^[a-zA-Z0-9_.-]+$). 예약: "lint"' },
        value: { type: 'string', description: '저장할 값 — 유효한 JSON 문자열이어야 함' },
        pageId: { type: 'string', description: '대상 페이지 ID. 미지정=바인딩 페이지, "document"=문서 루트' },
      },
      required: ['token', 'key', 'value'],
    },
  },

  {
    name: 'sigma_get_page_data',
    description: `Figma **페이지(또는 문서 루트) 노드**에 저장된 sigma 전용 메타데이터를 조회합니다.
sigma_set_page_data로 저장한 값(namespace "sigma")을 읽습니다.

**동작:**
- \`key\` 지정: 그 key의 값(JSON 문자열, 미저장 시 null)을 반환.
- \`key\` 미지정: 해당 노드의 sigma namespace 전체 key 목록 + key/value 맵 반환.

**대상(pageId):** sigma_set_page_data와 동일 (미지정=바인딩 페이지 / 페이지 ID / "document").

**예시:**
- 이 페이지 lint 설정 읽기: sigma_get_page_data({ token, key: "lint" })
- 이 페이지 전체 메타 보기: sigma_get_page_data({ token })`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        key: { type: 'string', description: '조회할 키 (미지정 시 전체 맵)' },
        pageId: { type: 'string', description: '대상 페이지 ID. 미지정=바인딩 페이지, "document"=문서 루트' },
      },
      required: ['token'],
    },
  },

  {
    name: 'sigma_delete_page_data',
    description: `sigma_set_page_data로 저장한 페이지/문서 메타데이터 키를 **삭제**합니다.
해당 노드의 sharedPluginData(namespace "sigma")에서 그 key를 제거합니다(빈 값 저장 = Figma가 키 삭제).

**대상(pageId):** 미지정=바인딩 페이지 / 페이지 ID / "document"(문서 루트).

**예시:**
- 이 페이지 lint 설정 제거: sigma_delete_page_data({ token, key: "lint" })`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        key: { type: 'string', description: '삭제할 키 (^[a-zA-Z0-9_.-]+$)' },
        pageId: { type: 'string', description: '대상 페이지 ID. 미지정=바인딩 페이지, "document"=문서 루트' },
      },
      required: ['token', 'key'],
    },
  },

  {
    name: 'sigma_set_node_data',
    description: `임의의 **노드**에 sigma 전용 메타데이터를 저장합니다 (페이지/문서는 sigma_set_page_data).
저장 위치는 그 노드의 sharedPluginData(namespace 고정 **"sigma"**)이며 .fig 파일에 영속됩니다.

**형식 강제:** namespace는 항상 "sigma", \`key\`는 \`^[a-zA-Z0-9_.-]+$\`, \`value\`는 **유효한 JSON 문자열**.

**예약 key \`"lint-ignore"\` = 노드 단위 lint 억제(inline suppress, eslint-disable 대응):**
- \`true\` → 이 노드의 **모든** 룰 억제
- \`["raw_node"]\` → 지정 룰만 억제
- \`{"rules":["raw_node"],"reason":"primitive token swatch"}\` → 지정 룰 + **의도(reason) 기록**

sigma_lint(page/file 무관)는 위반을 낸 뒤 그 주체 노드의 "lint-ignore"를 확인해 억제된 위반을 걸러냅니다.

**예시:**
- 이 스와치는 primitive라 raw_node 면제: sigma_set_node_data({ token, nodeId:"1:23", key:"lint-ignore", value:'{"rules":["raw_node"],"reason":"primitive"}' })
- 이 플레이스홀더는 임시라 전면 면제: sigma_set_node_data({ token, nodeId:"1:24", key:"lint-ignore", value:'{"rules":"all","reason":"stub"}' })`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '대상 노드 ID (예 "1:23")' },
        key: { type: 'string', description: '데이터 키 (^[a-zA-Z0-9_.-]+$). 예약: "lint-ignore"' },
        value: { type: 'string', description: '저장할 값 — 유효한 JSON 문자열이어야 함' },
      },
      required: ['token', 'nodeId', 'key', 'value'],
    },
  },

  {
    name: 'sigma_get_node_data',
    description: `노드에 저장된 sigma 전용 메타데이터를 조회합니다.
\`key\` 지정 시 그 값(JSON 문자열, 미저장 시 null), 미지정 시 그 노드의 sigma namespace 전체 key/value 맵.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '대상 노드 ID' },
        key: { type: 'string', description: '조회할 키 (미지정 시 전체 맵)' },
      },
      required: ['token', 'nodeId'],
    },
  },

  {
    name: 'sigma_delete_node_data',
    description: `노드에 저장된 sigma 메타데이터 키를 삭제합니다 (예: "lint-ignore" 억제 해제).`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '대상 노드 ID' },
        key: { type: 'string', description: '삭제할 키 (^[a-zA-Z0-9_.-]+$)' },
      },
      required: ['token', 'nodeId', 'key'],
    },
  },

  {
    name: 'sigma_create_section',
    description: `Figma에 Section을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
바인딩된 페이지에 Section이 생성됩니다.

Section은 Figma의 조직화 컨테이너입니다. Frame과 달리 Auto Layout을 지원하지 않지만,
페이지의 콘텐츠를 논리적으로 그룹화하는 데 사용됩니다.

**children**: 기존 노드의 ID 배열을 전달하면, 해당 노드들이 Section 안으로 이동합니다.

**권장 규약**: 배치 노드(프레임/컴포넌트)는 페이지에 흩뿌리지 말고 Section으로 구획하세요(형제 섹션끼리 non-overlap). Section 안 Frame 은 가장자리에 ≥20px 여백을 두는 게 좋습니다(딱 붙으면 섹션 의미가 없음). Section은 Auto Layout처럼 자동 확장되지 않으니 자식을 키운 뒤엔 Section도 직접 넓혀야 합니다. 검증·자동수정은 sigma_lint.`,
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

⚠️ **좌표계 함정**: 노드의 x/y는 "직속 부모 원점 기준" 로컬 좌표입니다(SECTION/FRAME/COMPONENT/GROUP 모두 자식 원점을 자기 좌상단으로 잡음 — 섹션도 예외 아님). 이동은 로컬 x/y **숫자를 그대로 보존**하므로 원점 위치가 다른 부모로 옮기면 그 차이만큼 절대 위치가 튑니다(예: 섹션→프레임). 이 경우 응답에 **coordinateShift**(beforeAbsolute/afterAbsolute + 원위치 복원용 restoreLocal 좌표)가 포함되니, 원래 절대 위치를 유지하려면 sigma_modify_node(move)로 restoreLocal 좌표로 보정하세요. 이동 후 sigma_lint로 회귀 검사 권장.

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

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.

## 처리 파이프라인
Figma exportAsync → Crop(선택) → mode별 처리 → Save

## mode (토큰 제한 해결 전략 — 배타적, 하나만 선택)
| mode | 동작 | 용도 |
|------|------|------|
| "auto" (기본) | 토큰 예산(22,000) 내로 자동 축소 | 일반 사용. 대부분 이것으로 충분 |
| "thumbnail" | scale 절반 + 자동 축소 | 전체 구조 빠르게 파악 (줌인 1단계) |
| "tile" | 축소 없이 그리드 분할 | 원본 화질 유지하며 큰 이미지 전체 보기 |
| "manual" | manualResize 값으로 명시적 리사이즈 | 크기를 직접 결정할 때 |
| "none" | 아무 처리 안 함 | crop 영역을 원본 해상도로 볼 때 (줌인 2단계) |

## 줌 인 워크플로우 (추천)
1단계: mode: "thumbnail"로 전체 구조 파악 → 응답의 original(원본 크기)과 resizeScale(축소 비율) 확인
2단계: 관심 영역을 mode: "none" + crop으로 원본 해상도로 확인
  - crop 좌표는 원본 이미지(scale 적용 후) 기준입니다
  - 1단계 thumbnail에서 본 좌표를 원본으로 환산하려면: 좌표 / resizeScale

## 응답 필드
- original: Figma export 직후 이미지 크기 (px)
- cropped: crop 적용 후 크기 (crop 사용 시)
- final: 최종 저장된 이미지 크기 (px)
- resizeScale: original 대비 축소 비율 (예: 0.25 = 25%로 축소). crop 미반영
- resizeApplied: 실제 축소가 발생했는지
- estimatedTokens: 최종 이미지의 추정 토큰 수
- withinTokenLimit: Read 도구로 읽을 수 있는지 (≤25,000 토큰)
- tiles (tile 모드): 각 타일의 filePath, 위치, 크기, 토큰 수

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
          description: '이미지 형식 (기본값: PNG). SVG/PDF는 이미지 처리(crop/resize/tile) 미지원',
        },
        scale: {
          type: 'number',
          default: 2,
          description: 'Figma export 스케일 (기본값: 2). 이미지의 기본 해상도를 결정. SVG/PDF에는 미적용',
        },
        filename: {
          type: 'string',
          description: '저장할 파일명 (미지정 시 자동 생성)',
        },
        crop: {
          type: 'object',
          description: '관심 영역만 잘라냅니다. mode와 독립적으로 항상 먼저 적용됩니다. 좌표는 원본 이미지(scale 적용 후)의 좌상단(0,0) 기준 픽셀 단위.',
          properties: {
            x: { type: 'number', description: '좌상단 X (px)' },
            y: { type: 'number', description: '좌상단 Y (px)' },
            width: { type: 'number', description: '너비 (px)' },
            height: { type: 'number', description: '높이 (px)' },
          },
          required: ['x', 'y', 'width', 'height'],
        },
        mode: {
          type: 'string',
          enum: ['auto', 'thumbnail', 'tile', 'manual', 'none'],
          default: 'auto',
          description: '토큰 제한 해결 전략. "auto": 자동 축소(기본), "thumbnail": 빠른 전체 파악, "tile": 원본 화질 분할, "manual": 명시적 크기 지정, "none": 처리 안 함',
        },
        manualResize: {
          type: 'string',
          description: 'mode가 "manual"일 때 필수. 비율("70%", "50%") 또는 긴 변 기준("800px", "1200px")으로 리사이즈',
        },
        tileSize: {
          type: 'object',
          description: 'mode가 "tile"일 때 선택. 명시적 타일 크기. 미지정 시 각 타일이 토큰 예산 내에 들도록 자동 계산 (~775x775px)',
          properties: {
            width: { type: 'number', description: '타일 너비 (px)' },
            height: { type: 'number', description: '타일 높이 (px)' },
          },
          required: ['width', 'height'],
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
    name: 'sigma_save_and_import',
    description: `컴포넌트를 저장하고 바로 Figma로 가져옵니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
바인딩된 페이지에 프레임이 생성됩니다.

JSON은 저장 후 가져오기, HTML은 저장 없이 바로 가져오기.

**position 안내:**
position을 생략하면 자동 배치됩니다 (바인딩된 페이지의 기존 내용 맨 아래에서 200px 아래, x는 항상 0. 빈 페이지면 (0, 0)).
가로로 나란히 놓거나 좌표를 확정해야 하면 position을 명시하세요 — 자동 배치는 호출 시점의 페이지 내용을 기준으로 계산하므로 동시 작업 중에는 값이 달라질 수 있습니다.`,
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
        position: {
          type: 'object',
          description: '프레임 생성 위치 (x, y 좌표)',
          properties: {
            x: { type: 'number', description: 'X 좌표' },
            y: { type: 'number', description: 'Y 좌표' },
          },
        },
        layoutMode: {
          type: 'string',
          enum: ['auto', 'absolute'],
          default: 'auto',
          description: "레이아웃 모드. 'auto': Auto Layout 사용 (기본값), 'absolute': 모든 노드를 boundingRect 기반 절대 배치 (형상 정확도 우선)",
        },
      },
      required: ['token', 'name'],
    },
  },

  // === Playwright Scripts (토큰 불필요) ===
  {
    name: 'sigma_get_playwright_scripts',
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
category로 extracted/screenshots/reports/all 중 대상을 선택할 수 있습니다.

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
          enum: ['extracted', 'screenshots', 'reports', 'all'],
          default: 'all',
          description: "정리 대상 카테고리 (extracted=추출물, screenshots=스크린샷, reports=lint 리포트, all=전체. 기본값: 'all')",
        },
      },
    },
  },
  {
    name: 'sigma_list_screenshots',
    description: '저장된 스크린샷 목록을 조회합니다 (파일명, 경로, 크기, 생성일)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sigma_delete_screenshot',
    description: '저장된 스크린샷을 파일명으로 삭제합니다',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: '삭제할 스크린샷 파일명 (sigma_list_screenshots로 확인)',
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
        parentId: { type: 'string', description: '부모 노드 ID (선택, 미지정 시 바인딩된 페이지의 루트)' },
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
        parentId: { type: 'string', description: '부모 노드 ID (선택, 미지정 시 바인딩된 페이지의 루트)' },
        fontSize: { type: 'number', description: '폰트 크기 (기본 14)' },
        fontFamily: { type: 'string', description: '폰트 패밀리 (기본: 파일 설정 fonts.default, 미설정 시 "Inter")' },
        fontWeight: { type: 'number', description: '폰트 굵기 (100~900, 기본 400). 폰트별 스타일 이름 차이(SemiBold/Semi Bold)는 자동 처리' },
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
    name: 'sigma_create_annotation_layer',
    description: `섹션에 "기획 레이어(annotation-layer)"를 생성합니다 — 기획 주석(anno/wire 인스턴스)을 담는 투명 오버레이 프레임.

**왜 전용 tool인가**: 채워 넣는 컨테이너라 스펙 컴포넌트로 만들 수 없다(스펙은 자식 인스턴스를 못 품음, 인스턴스 자식은 잠김). 그래서 네이티브 FRAME 으로 만든다.
**동작**: 섹션 전체를 덮는 투명 프레임을 섹션 직속 자식으로 생성 + clipsContent off + sharedPluginData("sigma","role"="annotation-layer") 태깅.
**이름이 아니라 pluginData 로 판정** → 이름 규약이 생기지 않고, 이름을 자유롭게 바꿔도 됨.
**lint 연동**: 페이지 config 로 \`annotation_layer\` 규칙(opt-in)을 켜면 ① 이 레이어는 겹침/여백/오버플로우에서 자동 면제(수동 lint-ignore 불필요) ② 모든 섹션이 레이어를 갖도록 강제된다.
**사용 순서**: 이 tool 로 레이어 생성 → 그 안에 anno/marker·wire/kv·anno/legend 등 인스턴스를 자식으로 삽입.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        sectionId: { type: 'string', description: '기획 레이어를 넣을 SECTION 노드 ID' },
        name: { type: 'string', description: '레이어 이름 (기본 "📝 기획 주석"). pluginData 로 판정하므로 이름은 자유' },
      },
      required: ['token', 'sectionId'],
    },
  },
  {
    name: 'sigma_create_empty_frame',
    description: `Figma에 빈 프레임(Frame)을 생성합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인/페이지가 결정됩니다.
Auto Layout, 패딩, 정렬 등 모든 프레임 옵션을 지원합니다.

⚠️ **\`layoutMode\` 를 켜면 \`width\`/\`height\` 는 그대로 유지되지 않습니다.** 오토레이아웃 프레임의 sizing 은 Figma 기본값이 **HUG** 라, **자식을 넣는 순간** 지정한 크기가 무효가 되고 프레임이 자식 크기로 줄어듭니다(넓은 자식은 클리핑되어 **화면에서 사라짐** — 노드 속성은 멀쩡해 보여서 원인 추적이 어렵습니다).
→ 크기를 고정하려면 **\`layoutSizingHorizontal\`/\`layoutSizingVertical\` 을 \`"FIXED"\` 로 함께 지정**하세요. 응답의 \`layoutSizingHorizontal/Vertical\` 과 \`sizingWarning\` 으로 실효 상태를 확인할 수 있습니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        width: { type: 'number', description: '너비' },
        height: { type: 'number', description: '높이' },
        name: { type: 'string', description: '프레임 이름 (선택)' },
        parentId: { type: 'string', description: '부모 노드 ID (선택, 미지정 시 바인딩된 페이지의 루트)' },
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
  {
    name: 'sigma_reorder_page',
    description: `페이지의 순서(위치)를 변경합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
sigma_list_pages로 pageId를 먼저 확인하세요.
index는 0부터 시작하며, 범위를 벗어나면 유효한 범위로 보정됩니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        pageId: { type: 'string', description: '이동할 페이지 ID' },
        index: { type: 'number', description: '이동할 위치 인덱스 (0부터 시작)' },
      },
      required: ['token', 'pageId', 'index'],
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
        parentId: { type: 'string', description: '부모 노드 ID (선택, 미지정 시 바인딩된 페이지의 루트)' },
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
        parentId: { type: 'string', description: '부모 노드 ID (선택, 미지정 시 바인딩된 페이지의 루트)' },
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
        parentId: { type: 'string', description: '부모 노드 ID (선택, 미지정 시 바인딩된 페이지의 루트)' },
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
        parentId: { type: 'string', description: '부모 노드 ID (선택, 미지정 시 바인딩된 페이지의 루트)' },
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
        parentId: { type: 'string', description: '부모 노드 ID (선택, 미지정 시 바인딩된 페이지의 루트)' },
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
        fontFamily: { type: 'string', description: '폰트 패밀리 (기본: 파일 설정 fonts.default, 미설정 시 Inter)' },
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
        parentId: { type: 'string', description: '부모 노드 ID (선택, 미지정 시 바인딩된 페이지의 루트)' },
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
    description: `Figma에서 특정 노드들을 선택합니다. **기본적으로 화면(뷰포트)은 움직이지 않습니다** — 뷰까지 옮기려면 zoomToFit: true 를 명시하세요(또는 sigma_set_viewport 사용).

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
        zoomToFit: { type: 'boolean', description: '선택 후 뷰포트도 그 노드로 옮길지 (기본 false — 선택만 하고 화면은 그대로 둔다)' },
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
        parentId: { type: 'string', description: '부모 노드 ID (선택, 미지정 시 바인딩된 페이지의 루트)' },
      },
      required: ['token', 'componentKey', 'x', 'y'],
    },
  },
  {
    name: 'sigma_get_instance_overrides',
    description: `컴포넌트 인스턴스의 오버라이드 가능한 속성을 조회합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.
nodeId는 필수입니다 — 결과가 사용자의 캔버스 선택 상태에 따라 달라지지 않도록, 현재 선택 폴백을 제공하지 않습니다.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        nodeId: { type: 'string', description: '인스턴스 노드 ID' },
      },
      required: ['token', 'nodeId'],
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
    name: 'sigma_get_selection_details',
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
nodeId는 필수입니다 — 결과가 사용자의 캔버스 선택 상태에 따라 달라지지 않도록, 현재 선택 폴백을 제공하지 않습니다.`,
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
nodeId는 필수입니다 — 결과가 사용자의 캔버스 선택 상태에 따라 달라지지 않도록, 현재 선택 폴백을 제공하지 않습니다.
각 Reaction은 trigger(트리거)와 actions(액션) 배열로 구성됩니다.`,
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
    name: 'sigma_delete_reactions',
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
  {
    name: 'sigma_set_hyperlink',
    description: `두 노드가 서로를 가리키는 하이퍼링크를 겁니다 — 누르면 뷰가 상대 노드로 이동합니다.

**바인딩 필수**: 토큰 바인딩에 따라 대상 플러그인이 결정됩니다.

**프로토타입(reaction)과 다릅니다**: 이 링크는 재생 모드가 아니라 **편집 캔버스에서 그대로 클릭**됩니다. 기획 주석 마커 ↔ 범례처럼 "번호를 누르면 설명과 화면을 오가는" 문서형 이동에 적합합니다. 같은 파일 안이라 fileKey 없이 노드 ID 만으로 동작합니다.

**링크 대상 텍스트는 slot 으로 찾습니다**: 하이퍼링크는 TEXT 노드에만 걸리는데, 실제로 지정하는 건 \`anno/marker\` 같은 인스턴스입니다. 스펙 등록 시 심어둔 slot 표시(pluginData)로 어느 텍스트에 걸지 정하므로 이름 규약이 필요 없고, 텍스트가 여럿인 스펙(\`anno/legend\` = 번호 \`n\` + 설명 \`desc\`)에서도 정확히 번호만 집습니다. 대상 결정 순서: ① TEXT 면 그대로 ② slot 이 일치하는 하위 TEXT ③ 하위 TEXT 가 정확히 하나면 그것 ④ 그 밖은 모호하므로 에러(가능한 slot 을 알려줍니다).

**사용 예시:**
- 마커 ↔ 범례 왕복 배선: sigma_set_hyperlink({ links: [{ a: "182:125455", b: "182:125485" }, { a: "182:125457", b: "182:125489" }] })
- 한 방향만: sigma_set_hyperlink({ links: [...], direction: "a_to_b" })
- 링크 해제: sigma_set_hyperlink({ links: [...], remove: true })

배선 확인은 응답의 aTextId/bTextId 를 \`sigma_get_node_info\`(또는 \`sigma_get_nodes_info\`)로 조회하면 TEXT 노드의 \`hyperlinks\` 필드로 나옵니다. 한 쌍이 실패해도 나머지 쌍은 계속 진행합니다(응답 results 의 error 확인).

외부 URL 링크나 문자열 일부에만 거는 부분 링크는 이 도구가 아니라 \`sigma_modify_node\` 의 \`setRangeHyperlink\` 를 사용하세요.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        links: {
          type: 'array',
          description: '서로 연결할 노드 쌍 목록 (최소 1쌍). 인스턴스를 그대로 넣으면 slot 으로 내부 텍스트를 찾습니다',
          items: {
            type: 'object',
            properties: {
              a: { type: 'string', description: '한쪽 노드 ID' },
              b: { type: 'string', description: '다른 쪽 노드 ID' },
            },
            required: ['a', 'b'],
          },
        },
        direction: {
          type: 'string',
          description: '링크 방향 (선택, 기본 both = 양방향 왕복)',
          enum: ['both', 'a_to_b', 'b_to_a'],
        },
        slot: { type: 'string', description: '링크를 걸 텍스트의 slot 이름 (선택, 기본 "n" = 주석 마커·범례의 번호)' },
        remove: { type: 'boolean', description: 'true 면 링크를 걸지 않고 제거합니다 (선택, 기본 false)' },
      },
      required: ['token', 'links'],
    },
  },

  // === Component Spec System (스펙 기반 컴포넌트) ===
  {
    name: 'sigma_create_component_spec',
    description:
      '[용도] 반복되는 UI 조각(배지·버튼·칩 등)을 HTML로 한 번 정의해 재사용 Figma 컴포넌트로 등록하고, ' +
      '이후 sigma_create_component_spec_instance에 alias+props만 주어 화면을 조립합니다 — create_frame/create_rectangle로 노드를 하나씩 쌓는 것을 대체합니다. ' +
      '⚠️ 코드베이스의 컴포넌트를 Figma에 연결하는 code-connect/코드매핑 기능이 아닙니다. ' +
      '여기서 HTML은 Figma 컴포넌트를 만들기 위한 설계 스펙일 뿐, 소스코드와 링크하지 않습니다. ' +
      '엄격한 규칙의 HTML 스펙으로 재사용 가능한 Figma 컴포넌트를 등록합니다 (바인딩 필수, validateOnly는 예외). ' +
      '[구조] 단일 루트, inline style만(<style>·class 불가). 컨테이너 태그는 div/button뿐이며 자식이 있으면 display: flex 명시 필수. ' +
      '텍스트 태그(span/p/h1~h6/a/strong/em/b/i)는 자식 없는 leaf 전용. void는 img/br. 허용 HTML 속성: style, src, alt, href, data-sigma-*. ' +
      '[이미지] <img src>는 **base64 data URI("data:image/…")만** 허용됩니다 — 원격 URL·상대 경로는 Figma 플러그인이 네트워크로 가져올 수 없어 ' +
      '조용히 회색 플레이스홀더가 되므로 등록 단계에서 거부합니다(src 누락도 거부). 스펙 이미지는 scaleMode FIT(잘리지 않음), 노드 이름은 alt 우선. ' +
      '[CSS] 화이트리스트: display/flex-direction/justify-content/align-items/align-self/gap/flex-wrap/flex-grow/flex-shrink/overflow, ' +
      'width/height, padding(개별 포함), background-color/background/color/opacity, border-width·color(개별)·radius, ' +
      'font-family/font-size/font-weight/line-height/letter-spacing, box-shadow(inset 불가). ' +
      'font-family는 생략 가능 — 생략하면 **파일 기본 폰트**로 렌더됩니다(문서 설정 `fonts.default`, 미설정 시 Inter). ' +
      '지정 시 이름만 허용(쉼표 폴백 체인 가능, var()·local() 불가)하고, Figma에 없는 폰트면 파일 기본 폰트로 폴백합니다. ' +
      '[값] 길이는 px만(0만 단위 생략, %·rem·em·calc·var 불가), 색상은 단색만(hex/rgb/rgba/색상명, gradient 불가), ' +
      'position·text-align 불가 — 배치·정렬은 flex 속성으로. 순수 텍스트 요소의 width/height 불가(부모 div로 감싸기). ' +
      '[slot] <span data-sigma-slot="이름" data-sigma-desc="설명">기본값</span> → Figma TEXT 속성으로 승격. ' +
      '텍스트 태그에만, 루트 불가, 기본 텍스트 필수, 순수 텍스트 속성만 허용. ' +
      '고정폭 직계 부모 안의 slot에 text-overflow: ellipsis(단일 행 …처리) 또는 white-space: normal(다중 행 줄바꿈)을 줄 수 있습니다. ' +
      '[조합 — 중요] 스펙 HTML은 정적 div/text/svg leaf만 만듭니다. **다른 등록 컴포넌트(예: oneui/*)의 인스턴스를 스펙 HTML 안에 넣을 수 없습니다** — ' +
      'HTML로 그 외형을 raw로 흉내내지 마세요(디자인시스템과 어긋납니다). 이미 등록된 컴포넌트(OneUI 등)를 재사용해 더 큰 컴포넌트를 조립하려면 **네이티브 경로**를 쓰세요: ' +
      'sigma_create_component(빈 COMPONENT) → 그 안에 sigma_create_component_spec_instance(parentId=그 컴포넌트) 또는 sigma_create_component_instance로 실제 인스턴스를 자식으로 삽입 → ' +
      '인스턴스를 찍은 뒤 per-instance로 바꿀 부분은 중첩 노드 id(I<instance>;<child>)에 sigma_modify_node(setCharacters) / sigma_set_component_spec_instance_props로 override. ' +
      '(Figma 네이티브 컴포넌트는 인스턴스를 자식으로 품지만, 스펙 HTML은 못 품습니다. 표·차트 등 등록 컴포넌트에 없는 조각만 스펙으로 만들어 이 조합에 끼워넣으세요.) ' +
      '[박스모델 경고] 루트에 width/height 와 border-width·padding 을 같이 주면 **내용상자는 그만큼 작습니다**. 직계 자식이 내용상자보다 크면 등록은 되지만 응답에 `warnings` 가 실립니다 — 이대로 두면 **인스턴스마다 child_overflow** 가 납니다(표 셀 스펙 하나로 한 번에 250건 난 적이 있고, 사후에는 이미 찍힌 인스턴스를 전부 손봐야 합니다). 경고는 양쪽 고칠 값(자식을 줄이거나 루트를 키우거나)을 함께 알려 줍니다. validateOnly 에서도 같이 나옵니다. ' +
      '[동작] overwrite 시 기존 컴포넌트가 in-place 갱신되어 기존 인스턴스에 전파. 규칙 위반 시 위반 전체 목록과 함께 거부. ' +
      'validateOnly: true면 Figma/토큰 없이 규칙 검증만 수행(사전 점검용). ' +
      '[본문이 큰 스펙] html 대신 htmlPath로 파일에서 읽을 수 있습니다. <img>에 base64 data URI를 넣는 스펙은 본문이 수십 KB라 ' +
      '호출 인자로 옮겨 적는 과정에서 깨지기 쉽고, 깨져도 등록은 통과하고 렌더만 실패하므로(이미지 디코드 예외 → 회색 플레이스홀더) 파일로 넘기세요. ' +
      '[파일 등록 정책] 이 Figma 파일의 문서 노드에 저장된 lint config 의 `componentSpec.warn` 에 걸리면 ' +
      '조건은 `aliasPattern`(이름) · `htmlPattern`(스펙 HTML 내용, 함께 쓰면 AND) · `unlessDescription`(걸리면 면제). ' +
      'htmlPattern 은 이름으로 못 잡는 규약을 위한 것이다 — 예를 들어 아이콘 창작은 대부분 **다른 컴포넌트 HTML 안에 묻힌 inline `<svg>`** 로 들어와서 alias 로는 보이지 않는다. ' +
      '응답에 policyWarnings 가 실립니다 — **경고일 뿐 등록은 그대로 진행**됩니다(거부 아님). ' +
      '정책 설정: sigma_set_page_data({ pageId: "document", key: "lint", value: JSON }). validateOnly 경로에선 파일을 특정할 수 없어 검사하지 않습니다. ' +
      '등록 후 sigma_create_component_spec_instance로 삽입, 카탈로그는 sigma_list_component_specs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰 (validateOnly: true면 생략 가능)' },
        alias: { type: 'string', description: '의미론적 식별자 (소문자 시작, [a-z0-9_]). 예: ui_badge' },
        description: { type: 'string', description: '컴포넌트 용도 설명 — 카탈로그에서 선택 근거가 됨' },
        html: { type: 'string', description: '스펙 HTML (단일 루트, inline style, data-sigma-slot으로 텍스트 파라미터 선언). htmlPath와 함께 쓸 수 없음' },
        htmlPath: { type: 'string', description: '(선택) 스펙 HTML을 읽어올 파일 경로. html 대신 사용. base64 data URI 이미지처럼 본문이 큰 스펙은 인자로 옮겨 적다 깨지면 등록은 통과하고 렌더만 실패하므로(회색 플레이스홀더) 파일로 넘기세요. 서버가 컨테이너면 컨테이너 경로 — 호스트 ~/.sigma ↔ /root/.sigma' },
        namespace: { type: 'string', description: '(선택) 스타일 체계 구분용 네임스페이스 (소문자 시작, [a-z0-9_]). 예: plan(기획), design(디자인). 기본 "default". 유일성 키는 namespace+alias' },
        position: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          description: '(선택) 컴포넌트 배치 위치. 미지정 시 자동 배치',
        },
        overwrite: { type: 'boolean', description: '(선택) 같은 namespace+alias가 있으면 in-place 갱신(인스턴스 전파). 기본 false' },
        validateOnly: { type: 'boolean', description: '(선택) true면 등록 없이 HTML 규칙 검증만 수행 — Figma 연결·토큰 불필요. 결과로 ok/violations/params/sizing 반환' },
      },
      required: ['alias', 'description'],
    },
  },
  {
    name: 'sigma_list_component_specs',
    description:
      '등록된 컴포넌트 스펙 카탈로그를 조회합니다 (토큰 불필요). ' +
      '기본은 alias/설명/params/size/sizing (토큰 절약형) — sizing의 hug 축은 내용에 따라 늘어나고 fixed 축은 고정입니다. ' +
      'alias 인자를 주면 해당 스펙의 HTML 원문 포함 상세를 반환합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        alias: { type: 'string', description: '(선택) 상세 조회할 컴포넌트 alias' },
        namespace: { type: 'string', description: '(선택) 네임스페이스 필터 (alias 지정 시엔 모호성 해소용)' },
      },
    },
  },
  {
    name: 'sigma_create_component_spec_instance',
    description:
      '등록된 스펙 컴포넌트의 인스턴스를 생성합니다 (바인딩 필수). ' +
      'Figma 내부를 탐색할 필요 없이 alias + props만으로 삽입됩니다. ' +
      '예: alias: "ui_badge", props: {text: "완료"}. 사용 가능한 alias와 param은 sigma_list_component_specs로 확인하세요.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        alias: { type: 'string', description: '등록된 컴포넌트 alias' },
        namespace: { type: 'string', description: '(선택) 네임스페이스 — alias가 여러 네임스페이스에 있으면 필수' },
        props: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: '(선택) 파라미터 값 매핑. 예: {text: "haha"}. 미지정 param은 기본값 유지',
        },
        x: { type: 'number', description: '(선택) X 좌표. 미지정 시 자동 배치' },
        y: { type: 'number', description: '(선택) Y 좌표' },
        width: { type: 'number', description: '(선택) 인스턴스 너비 — 생성 직후 resize (hug 축은 FIXED로 전환, placeholder 용도)' },
        height: { type: 'number', description: '(선택) 인스턴스 높이 — 생성 직후 resize' },
        parentId: { type: 'string', description: '(선택) 부모 노드 ID (Auto Layout 프레임에 삽입 가능). parentId로 **COMPONENT 노드**를 주면 그 컴포넌트의 자식으로 삽입돼, 등록 컴포넌트(OneUI 등)를 재사용한 조합 컴포넌트를 만들 수 있습니다 — sigma_create_component로 빈 컴포넌트를 만든 뒤 이 방식으로 실제 인스턴스들을 채우세요. 스펙 HTML 안에 인스턴스를 넣는 것은 불가능하므로, 조립은 이 네이티브 경로로 합니다.' },
      },
      required: ['token', 'alias'],
    },
  },
  {
    name: 'sigma_import_spec_preset',
    description:
      'sigma가 내장한 스펙 프리셋(표준 컴포넌트 팩)을 현재 바인딩된 파일에 등록합니다 (바인딩 필수). ' +
      '등록 후에는 일반 스펙과 동일하게 sigma_create_component_spec_instance로 사용합니다. ' +
      'annotation: 기획 주석 4종 — anno/region(영역 강조 사각형), anno/marker(번호 마커), anno/legend(범례 행: 번호+설명), anno/label(라벨 칩). ' +
      'wireframe: 와이어프레임 프리미티브 5종 — wire/box(placeholder), wire/section_title, wire/item, wire/kv, wire/note(줄바꿈 메모). ' +
      '이미 등록된 항목은 건너뛰고(overwrite: true면 in-place 갱신 — 기존 인스턴스에 전파), 프리셋 스펙은 overwrite로 자유롭게 커스터마이즈할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        preset: { type: 'string', enum: ['annotation', 'wireframe'], description: '등록할 프리셋 팩' },
        overwrite: { type: 'boolean', description: '(선택) 이미 등록된 항목도 in-place 갱신. 기본 false(건너뜀)' },
      },
      required: ['token', 'preset'],
    },
  },
  {
    name: 'sigma_set_component_spec_instance_props',
    description:
      '기존 스펙 인스턴스의 파라미터(TEXT 속성)를 재설정합니다 (바인딩 필수). ' +
      '인스턴스 nodeId + param 이름만으로 텍스트를 바꿉니다 — 삭제 후 재생성 불필요. ' +
      '스펙 인스턴스가 아니면 거부되며, 넘침 시 warnings를 반환합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        nodeId: { type: 'string', description: '스펙 인스턴스 nodeId (sigma_create_component_spec_instance의 반환값)' },
        props: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: '재설정할 파라미터 값 매핑. 예: {text: "새 값"}. 미지정 param은 유지',
        },
      },
      required: ['token', 'nodeId', 'props'],
    },
  },
  {
    name: 'sigma_delete_component_spec',
    description: '레지스트리에서 컴포넌트 스펙을 삭제합니다 (토큰 불필요). Figma의 컴포넌트 노드는 유지됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        alias: { type: 'string', description: '삭제할 컴포넌트 alias' },
        namespace: { type: 'string', description: '(선택) 네임스페이스 — alias가 여러 네임스페이스에 있으면 필수' },
        deleteNode: { type: 'boolean', description: '(선택) true 면 Figma 마스터 컴포넌트 노드까지 함께 삭제. 기본 false(레지스트리만 — 마스터는 마스터 페이지에 남는다). ⚠️ 삭제 전 그 스펙의 인스턴스가 0인지 확인하세요' },
      },
      required: ['alias'],
    },
  },

  // === Component System ===
  {
    name: 'sigma_create_component',
    description: '새 컴포넌트 노드 생성',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        width: { type: 'number', description: '너비' },
        height: { type: 'number', description: '높이' },
        name: { type: 'string', description: '컴포넌트 이름' },
        parentId: { type: 'string', description: '부모 노드 ID' },
      },
      required: ['token', 'x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'sigma_convert_to_component',
    description: '기존 프레임/노드를 컴포넌트로 변환',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        nodeId: { type: 'string', description: '변환할 노드 ID' },
      },
      required: ['token', 'nodeId'],
    },
  },
  {
    name: 'sigma_create_component_set',
    description: '여러 컴포넌트를 Variants 세트로 결합',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        componentIds: { type: 'array', items: { type: 'string' }, description: '결합할 컴포넌트 ID 배열 (최소 2개)' },
        name: { type: 'string', description: 'ComponentSet 이름' },
      },
      required: ['token', 'componentIds'],
    },
  },
  {
    name: 'sigma_add_component_property',
    description: '컴포넌트에 프로퍼티 추가 (Boolean, Text, Instance Swap, Variant)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        nodeId: { type: 'string', description: 'COMPONENT 또는 COMPONENT_SET 노드 ID' },
        propertyName: { type: 'string', description: '프로퍼티 이름' },
        propertyType: { type: 'string', enum: ['BOOLEAN', 'TEXT', 'INSTANCE_SWAP', 'VARIANT'], description: '프로퍼티 타입' },
        defaultValue: { description: '기본값' },
      },
      required: ['token', 'nodeId', 'propertyName', 'propertyType', 'defaultValue'],
    },
  },
  {
    name: 'sigma_edit_component_property',
    description: '컴포넌트 프로퍼티 수정',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        nodeId: { type: 'string', description: 'COMPONENT 또는 COMPONENT_SET 노드 ID' },
        propertyName: { type: 'string', description: '프로퍼티 이름' },
        newValues: { type: 'object', description: '수정할 값 객체 (defaultValue, preferredValues 등)' },
      },
      required: ['token', 'nodeId', 'propertyName', 'newValues'],
    },
  },
  {
    name: 'sigma_delete_component_property',
    description: '컴포넌트 프로퍼티 삭제',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        nodeId: { type: 'string', description: 'COMPONENT 또는 COMPONENT_SET 노드 ID' },
        propertyName: { type: 'string', description: '삭제할 프로퍼티 이름' },
      },
      required: ['token', 'nodeId', 'propertyName'],
    },
  },
  {
    name: 'sigma_get_component_properties',
    description: '컴포넌트 프로퍼티 정의 조회',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        nodeId: { type: 'string', description: 'COMPONENT 또는 COMPONENT_SET 노드 ID' },
      },
      required: ['token', 'nodeId'],
    },
  },
  {
    name: 'sigma_detach_instance',
    description: '인스턴스를 일반 프레임으로 분리 (detach)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        nodeId: { type: 'string', description: 'INSTANCE 노드 ID' },
      },
      required: ['token', 'nodeId'],
    },
  },
  {
    name: 'sigma_swap_component',
    description: '인스턴스의 메인 컴포넌트를 다른 컴포넌트로 교체. 등록된 컴포넌트 스펙이면 alias(+namespace)로 지정 — 상태 variant 교체(예: 체크박스 unchecked→checked)의 정석이며, 인스턴스를 새로 만들고 옛 것을 지우면 자식 순서·pluginData·하이퍼링크가 날아간다',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        nodeId: { type: 'string', description: 'INSTANCE 노드 ID' },
        alias: { type: 'string', description: '교체할 컴포넌트 스펙의 alias (newComponentKey 대신 사용)' },
        namespace: { type: 'string', description: 'alias의 네임스페이스 (여러 ns에 같은 alias가 있으면 필수)' },
        newComponentKey: { type: 'string', description: '새 컴포넌트의 key. 스펙이 아닌 일반 컴포넌트일 때 사용 (alias를 주면 불필요)' },
      },
      required: ['token', 'nodeId'],
    },
  },

  // === Creation & Query ===
  {
    name: 'sigma_create_node_from_svg',
    description: 'SVG 문자열을 Figma 노드로 변환하여 생성',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        svgString: { type: 'string', description: 'SVG 마크업 문자열' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        name: { type: 'string', description: '노드 이름' },
        parentId: { type: 'string', description: '부모 노드 ID' },
      },
      required: ['token', 'svgString'],
    },
  },
  {
    name: 'sigma_list_fonts',
    description: 'Figma에서 사용 가능한 폰트 목록 조회',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_get_css',
    description: '노드의 CSS 스타일 추출',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        nodeId: { type: 'string', description: '노드 ID' },
      },
      required: ['token', 'nodeId'],
    },
  },

  // === Variable Advanced ===
  {
    name: 'sigma_set_variable_scopes',
    description: '변수의 사용 범위(scope) 설정',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        variableId: { type: 'string', description: '변수 ID' },
        scopes: { type: 'array', items: { type: 'string' }, description: 'scope 배열 (ALL_SCOPES, TEXT_CONTENT, CORNER_RADIUS, WIDTH_HEIGHT, GAP, ALL_FILLS, FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR, STROKE_FLOAT, EFFECT_FLOAT, EFFECT_COLOR, OPACITY, FONT_FAMILY, FONT_STYLE, FONT_WEIGHT, FONT_SIZE, LINE_HEIGHT, LETTER_SPACING, PARAGRAPH_SPACING, PARAGRAPH_INDENT)' },
      },
      required: ['token', 'variableId', 'scopes'],
    },
  },
  {
    name: 'sigma_set_variable_alias',
    description: '변수에 다른 변수를 별칭(alias)으로 설정',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        variableId: { type: 'string', description: '대상 변수 ID' },
        modeId: { type: 'string', description: '모드 ID' },
        aliasTargetId: { type: 'string', description: '별칭으로 참조할 변수 ID' },
      },
      required: ['token', 'variableId', 'modeId', 'aliasTargetId'],
    },
  },
  {
    name: 'sigma_set_variable_code_syntax',
    description: '변수의 코드 생성 구문 설정 (개발자용)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        variableId: { type: 'string', description: '변수 ID' },
        platform: { type: 'string', enum: ['WEB', 'ANDROID', 'iOS'], description: '플랫폼' },
        syntax: { type: 'string', description: '코드 구문 문자열 (예: var(--color-primary))' },
      },
      required: ['token', 'variableId', 'platform', 'syntax'],
    },
  },
  {
    name: 'sigma_rename_variable',
    description: '변수의 이름을 변경합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        variableId: { type: 'string', description: '대상 변수 ID' },
        name: { type: 'string', description: '새 변수 이름 (예: "surface/raised")' },
      },
      required: ['token', 'variableId', 'name'],
    },
  },
  {
    name: 'sigma_delete_variable',
    description: '변수를 삭제합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        variableId: { type: 'string', description: '삭제할 변수 ID' },
      },
      required: ['token', 'variableId'],
    },
  },

  // === Team Library ===
  {
    name: 'sigma_list_libraries',
    description: '사용 가능한 Team Library 목록 조회',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_list_library_components',
    description: '라이브러리의 컴포넌트 목록 조회',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        libraryKey: { type: 'string', description: '라이브러리 key' },
      },
      required: ['token', 'libraryKey'],
    },
  },
  {
    name: 'sigma_list_library_variables',
    description: '라이브러리 변수 컬렉션의 변수 목록 조회',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        collectionKey: { type: 'string', description: '변수 컬렉션 key' },
      },
      required: ['token', 'collectionKey'],
    },
  },
  {
    name: 'sigma_import_library_component',
    description: '라이브러리 컴포넌트를 현재 파일로 임포트',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        key: { type: 'string', description: '컴포넌트 key' },
      },
      required: ['token', 'key'],
    },
  },
  {
    name: 'sigma_import_library_style',
    description: '라이브러리 스타일을 현재 파일로 임포트',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        key: { type: 'string', description: '스타일 key' },
      },
      required: ['token', 'key'],
    },
  },

  // === Utilities ===
  {
    name: 'sigma_notify',
    description: 'Figma UI에 알림 메시지 표시',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        message: { type: 'string', description: '알림 메시지' },
        options: { type: 'object', properties: { timeout: { type: 'number' }, error: { type: 'boolean' } }, description: '옵션 (timeout: ms, error: 에러 스타일)' },
      },
      required: ['token', 'message'],
    },
  },
  {
    name: 'sigma_commit_undo',
    description: `Undo 체크포인트 생성 (현재 상태를 undo 히스토리에 기록).

⚠️ 체크포인트도 문서 전역입니다 — 동시 작업 중이라면 다른 주체의 변경까지 같은 경계에
묶입니다(sigma_trigger_undo 설명 참조).`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_trigger_undo',
    description: `Undo 실행 (마지막 작업 되돌리기).

⚠️ **문서 전역 동작**: undo 히스토리는 Figma 문서 하나에 대해 공유됩니다. 여러 에이전트가
동시에 작업 중이거나 사람이 같은 파일을 편집하고 있으면, **자기 작업이 아닌 마지막 변경이
되돌려질 수 있습니다.** 되돌릴 대상이 확실할 때만 쓰고, 그 외에는 해당 노드를 직접
수정/삭제하세요(sigma_modify_node, sigma_batch_delete).`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_save_version',
    description: '현재 상태를 버전 히스토리에 저장',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        title: { type: 'string', description: '버전 제목' },
        description: { type: 'string', description: '버전 설명' },
      },
      required: ['token', 'title'],
    },
  },
  {
    name: 'sigma_set_export_settings',
    description: '노드의 export 설정 지정 (PNG 2x, SVG 등)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        nodeId: { type: 'string', description: '노드 ID' },
        settings: { type: 'array', items: { type: 'object' }, description: 'ExportSettings 배열 (format: PNG|SVG|JPG|PDF, constraint?: {type,value})' },
      },
      required: ['token', 'nodeId', 'settings'],
    },
  },
  {
    name: 'sigma_get_export_settings',
    description: '노드의 현재 export 설정 조회',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        nodeId: { type: 'string', description: '노드 ID' },
      },
      required: ['token', 'nodeId'],
    },
  },

  // === FigJam ===
  {
    name: 'sigma_create_sticky',
    description: 'FigJam 스티키 노트 생성 (FigJam 환경에서만 사용 가능)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        text: { type: 'string', description: '스티키 노트 텍스트' },
        x: { type: 'number', description: 'X 좌표' },
        y: { type: 'number', description: 'Y 좌표' },
        parentId: { type: 'string', description: '부모 노드 ID' },
      },
      required: ['token'],
    },
  },
  {
    name: 'sigma_create_connector',
    description: 'FigJam 커넥터 생성 — 두 노드를 연결 (FigJam 환경에서만 사용 가능)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: '인증 토큰' },
        startNodeId: { type: 'string', description: '시작 노드 ID' },
        endNodeId: { type: 'string', description: '끝 노드 ID' },
        strokeColor: { type: 'object', properties: { r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' }, a: { type: 'number' } }, description: 'stroke 색상' },
        strokeWeight: { type: 'number', description: 'stroke 두께' },
      },
      required: ['token', 'startNodeId', 'endNodeId'],
    },
  },

  // === Lint (빌트인 카탈로그 + 커스텀 규칙) ===
  {
    name: 'sigma_lint',
    description: `**config 파일에 정의된 규칙으로 문서를 검사**하고, 안전한 것만 자동수정합니다. **바인딩 필수**.

**base config 는 inline \`config\` / \`configPath\` / 문서 저장값 중 하나로 제공**합니다(아래 "config 출처" 참조). Figma 파일마다 다른 규칙을 쓸 수 있어, 서버는 config를 저장하지 않고 매 호출 시 지정된 것을 그대로 읽습니다. \`configPath\` 는 **서버 자신의 파일시스템 기준**이라, Docker로 배포했다면 컨테이너에 보이는 경로(보통 바인드 마운트된 \`~/.sigma\` 하위)여야 합니다 — 프로젝트 저장소 경로는 컨테이너 안에서 안 보입니다.

**config 스키마**:
\`\`\`jsonc
{
  "builtins": {
    // 아래 규칙 id. 대부분 생략하면 기본 ON(opt-out). 값은 { enabled?: boolean, ...파라미터 }
    // 예외: raw_node 만 opt-in(기본 OFF) — { "enabled": true } 로 켜야 실행됨.
    "section_gap": { "gap": 80 },
    "frame_padding": { "enabled": false },
    "raw_node": { "enabled": true }
  },
  "custom": [
    // (a) JSON 선언적 — 필드 등가/범위/정규식/열거/존재 검사만. 이 이상은 (b)로.
    { "id": "card-radius-12", "select": { "type": "FRAME", "namePattern": "Card" },
      "check": { "op": "equals", "field": "cornerRadius", "value": 12 } },
    // (b) JS 프레디케이트 — 관계형(형제/조상)·임의 로직. 서버 Worker에서 격리 실행(타임아웃 기본 2000ms).
    { "id": "modal-needs-overlay", "kind": "predicate",
      "code": "export default function(node, ctx) {\\n  if (node.type !== 'FRAME' || !node.name.startsWith('Modal/')) return null;\\n  if (!ctx.getSiblings(node.id).some(s => s.name === 'Overlay')) return { message: node.name + ' 옆에 Overlay 형제가 없음' };\\n  return null;\\n}" }
  ],
  // 문서(document) 저장 config 에서만 의미 있음 — lint 검사가 아니라 **컴포넌트 스펙 등록 정책**이다.
  // sigma_create_component_spec 의 등록/overwrite 시 걸리면 응답에 policyWarnings(경고만, 거부 아님).
  // 조건: aliasPattern(이름) · htmlPattern(스펙 HTML 내용) — 함께 쓰면 AND. unlessDescription 에 걸리면 면제.
  "componentSpec": { "warn": [
    { "aliasPattern": "^table$", "message": "테이블은 wire/table 프리셋을 쓰세요" },
    { "aliasPattern": "^btn_", "message": "버튼은 ui_button 권장", "namespace": "design" },
    // 이름으로는 못 잡는 규약 — 아이콘 창작은 대부분 "다른 컴포넌트 HTML 안에 묻힌 inline <svg>" 로 들어온다.
    { "htmlPattern": "<svg", "unlessDescription": "출처",
      "message": "아이콘을 새로 그리지 말고 등록된 세트에서 가져오세요 — 부득이하면 description 에 출처를 적으세요" }
  ] }
}
\`\`\`

**빌트인 규칙 24개**:
- 기하 8종(좌표, sigma_layout_lint 시절과 동일): \`outside_section\`(섹션 밖 배치 노드) · \`section_overlap\`(형제 섹션 겹침) · \`section_gap\`(형제 섹션 간격 부족, 기본 80px — 섹션 라벨이 경계를 가림) · \`card_overlap\`(섹션 안 카드끼리 겹침) · \`frame_padding\`(섹션 안 프레임 여백 부족, 기본 20px) · \`instance_orphan\`(래퍼 없이 뜬 INSTANCE) · \`component_needs_frame\`(섹션 직속 COMPONENT/GROUP) · \`child_overflow\`(자식이 로컬좌표 기준 부모 밖).
- 구조/이름/가시성 6종: \`stray_pixel\`(비정수 좌표/크기) · \`default_name\`("Rectangle 123" 류 Figma 기본 이름 방치) · \`empty_container\`(자식 없는 FRAME/GROUP — 단 fill 로 내용을 그리는 이미지 프레임 등은 제외) · \`hidden_leaf\`(visible:false 로 트리에 잔존) · \`fill_sizing_orphan\`(layoutSizing이 FILL인데 부모가 오토레이아웃 아님 — 무효 상태) · \`component_description_empty\`(COMPONENT/COMPONENT_SET의 description 비어있음).
- occlusion 1종: \`fully_occluded_sibling\`(같은 부모 안에서 나중에 그려지는 형제가 불투명 SOLID fill로 완전히 덮어 절대 안 보임 — 켜져 있으면 fills/opacity 조회를 위해 get_nodes_info 왕복이 추가됨).
- 컴포넌트 강제 1종 **(opt-in, 기본 OFF)**: \`raw_node\`(화면 조립 레이어에서 등록 컴포넌트의 INSTANCE 가 아니라 raw 도형/프레임으로 그린 노드를 전수 검출 — "쓰는 건 전부 사전 정의" 정책 강제). 파라미터: \`types\`(대상 노드 타입, 기본 \`["FRAME","RECTANGLE","ELLIPSE","VECTOR","LINE","POLYGON","STAR"]\` — TEXT/GROUP/SECTION/INSTANCE/COMPONENT 비대상) · \`checkInsideComponent\`(COMPONENT 정의 내부의 raw 요소까지 검사, 기본 false) · \`exemptNamePattern\`(정규식 매칭 이름 제외, 기획 킷/주석 등). **INSTANCE 내부 노드는 항상 제외**(정의의 사본이라 독립 저작 대상 아님). strict 정책이라 켜는 파일만 적용하도록 opt-in.
- 기획 레이어 강제 1종 **(opt-in, 기본 OFF)**: \`annotation_layer\`(섹션마다 pluginData \`role="annotation-layer"\` 로 태깅된 기획 레이어 프레임이 직속 자식으로 **반드시** 있어야 함 — 없으면 위반). 레이어는 \`sigma_create_annotation_layer\` 로 생성(투명 프레임, 이름이 아니라 pluginData 로 판정). **이 규칙을 켜면**(=계약 opt-in) 태깅된 레이어는 \`card_overlap\`/\`frame_padding\`/\`child_overflow\`/\`instance_orphan\` 에서 **자동 면제**된다(디자인 위에 겹쳐 덮는 투명 오버레이라 기하 검사 무의미). 즉 면제 혜택은 "모든 섹션에 레이어" 강제를 받아들이는 대가로 주어진다. 페이지 config 로 적용 범위를 조절.
- 찾기 쉬움 2종 **(opt-in, 기본 OFF, 페이지 루트 전용)**: \`content_spread\`(최상위 노드를 \`maxGap\`(기본 3000px) 이내로 이어지는 덩어리로 묶어, 본진 밖에 홀로 떨어진 이상치를 검출 — 이런 노드 하나가 zoom-to-fit 범위를 삼켜 "페이지를 열었는데 내용을 못 찾는" 상태를 만든다. 숨김 노드 제외) · \`origin_anchor\`(최상위 SECTION 이 있는 페이지는 그 중 하나가 원점(0,0) \`tolerance\`(기본 100px) 이내에서 시작해야 함 — 좌표 규약 고정용, 위반은 페이지당 1건이고 주체는 원점에 가장 가까운 섹션). **둘 다 \`nodeId\`/\`path\` 로 서브트리를 검사할 땐 실행되지 않는다**(그 트리는 부모 로컬좌표라 원점·거리 판정이 무의미). 자동수정 없음.
- 인스턴스 이름 강제 1종 **(opt-in, 기본 OFF)**: \`instance_default_name\`(\`default_name\` 의 인스턴스 판 — INSTANCE 이름이 **마스터 컴포넌트 이름 그대로**면 고유 이름 미부여로 보고 위반). 마스터명은 TreeNode 에 없어 서버가 \`get_nodes_info\` 의 \`componentName\` 을 resolve 해 판정(규칙 ON 일 때만 1왕복). **중첩 인스턴스(다른 INSTANCE 내부)는 제외**(정의의 사본). 실화면엔 마스터명 유지 인스턴스가 흔해 기본 ON 이면 폭주 → strict 네이밍 원하는 파일만 opt-in.
- 스펙 인스턴스 크기 1종 **(opt-in, 기본 OFF)**: \`instance_resized_from_spec\`(**작은 스펙 인스턴스를 배 이상 늘려 컨테이너 대용으로 쓴 것**). 스펙 마스터는 HTML 을 고정 크기 자식 트리로 구운 것이라 상자만 커지고 **안쪽은 제자리에 남는다** — 16×16 체크박스를 48×42 표 칸으로 늘려 쓰다가 선택 상태로 바꾸는 순간 칸 전체가 색 덩어리가 된 사례. ⚠️ **크기 차이 자체는 잡지 않는다**(실측: 표는 열 너비 때문에 셀을 늘리고 줄이는 게 정상 사용이라 한 페이지에서만 2220건). 줄임의 실제 피해(자식 넘침)는 \`child_overflow\` 가 이미 잡으므로 기본 대상이 아니다(\`flagShrink\` 로 원인 이름까지 듣고 싶을 때만). 파라미터: \`growthRatio\`(기본 2) · \`smallMaster\`(기본 64px — 원래 큰 요소를 늘린 건 의도로 본다) · \`flagShrink\`(기본 false) · \`tolerance\`(기본 0.5px). 마스터 크기·스펙 alias 는 TreeNode 에 없어 서버가 \`get_nodes_info\` 로 resolve(규칙 ON 일 때만 1왕복).
- 기획 주석 짝 검사 1종 **(opt-in, 기본 OFF)**: \`annotation_marker_pair\`(기획 레이어 안에서 **마커 ↔ 범례가 1:1 이고 서로 왕복 하이퍼링크가 걸려 있는지**). 결번(설명 없는 마커)·유령(가리키는 곳 없는 범례)·중복 번호·링크 누락을 잡는다 — 마커를 빼고 재번호하다 어긋나기 쉬운데 눈으로는 번호를 하나씩 세어야만 보이고, 링크는 화면에 표시가 없어 빠뜨려도 티가 안 난다. 짝은 **기획 레이어 단위**로 맞춘다(한 페이지에 섹션이 여럿이면 ① 번 마커도 여럿이라 페이지 전체로 묶으면 전부 중복이 된다). 판정은 이름이 아니라 **스펙 alias + 인스턴스 안 번호 글자 + 실제 하이퍼링크 데이터**다. 파라미터: \`markerAlias\`(기본 \`marker\`) · \`legendAlias\`(기본 \`legend\`) · \`requireHyperlink\`(기본 true) · \`symbolPattern\`(기본 원문자 숫자 한 글자 — ㉑(U+3251)은 ①(U+2460)과 연속이 아니라 범위를 나눠 넣었다).
- 폰트 일관성 1종 **(opt-in, 기본 OFF)**: \`font_not_default\`(이 파일이 정한 기본 폰트와 **다른 폰트를 쓰는 TEXT**). 기대 패밀리는 문서 노드 \`fonts.default\` 에서 읽는다(\`family\` 로 override 가능) — **설정이 없으면 판정하지 않는다**(기준 없이 전부 위반으로 만들지 않는다). 파일 기본 폰트는 새로 만들 때만 적용되므로 설정 이전에 만든 텍스트는 그대로 남는다 — 스펙 마스터는 재등록으로 바뀌어도 화면에 직접 그린 raw TEXT 는 옛 폰트가 남는데, 그걸 찾는 일이 지금까지 사람이 섹션마다 훑는 것이었다(\`scope:"file"\` 한 번이면 된다). 한 텍스트 안에 폰트가 섞인 경우(figma.mixed)도 잡는다(\`flagMixed\`, 기본 true). 파라미터: \`family\` · \`allow\`(함께 허용할 패밀리, 예: 코드용 고정폭) · \`flagMixed\`. 의도한 예외는 노드 lint-ignore 로 사유와 함께 면제.
- 기획 주석 거리 1종 **(opt-in, 기본 OFF)**: \`annotation_marker_gap\`(마커가 가리키려는 대상을 **덮고 있거나**, 너무 **멀리 떠 있거나**, 주변에 **가리킬 것이 아예 없는** 경우). 규약은 "대상 경계에서 4~10px, 12px 초과 금지, 겹침 금지" 인데 지금까지 기계 백스톱이 없었다 — 한 화면에서 마커 14개가 전부 대상 위에 얹혀 있던 적이 있고, 반대로 그리지도 않은 위젯을 가리키는 마커가 빈 공간에 찍혀 있던 적도 있다. **절대좌표가 필요하므로 이 규칙이 켜졌을 때만** 서버가 get_tree 를 \`includeAbsolute\` 로 부른다(payload 를 그때만 치른다) — 마커는 기획 레이어 안에 있고 대상은 상태 프레임 깊숙한 곳이라 부모 로컬좌표로는 애초에 비교가 안 된다. 대상 후보는 **원자적 노드만**(자식 없는 leaf + INSTANCE) — 상태 프레임 같은 큰 컨테이너를 후보에 넣으면 마커는 언제나 그 위에 있어 전부 겹침이 된다. 파라미터: \`maxGap\`(기본 12) · \`orphanRadius\`(기본 240) · \`markerAlias\`(기본 \`marker\`). 영역을 가리키는 마커처럼 일부러 먼 것은 노드 lint-ignore 로 면제.

**JSON \`check.op\`**: \`equals | range(min/max) | regex(pattern) | oneOf(values) | exists\` — 5개뿐이며 더 늘리지 않습니다(새 언어 발명 방지). 형제/조상 조회나 유도값 계산이 필요하면 \`kind:"predicate"\`를 쓰세요.

**predicate 계약**: \`code\`는 \`export default function(node, ctx) { ... }\` 형태만 허용. \`node\`는 id/name/type/x/y/width/height/childCount + fills/strokes/cornerRadius/fontSize 등 상세 필드. \`ctx.getSiblings/getAncestors/getChildren(nodeId)\`로 관계 조회. 위반이면 \`{ message }\` 반환, 통과면 \`null\`. **read-only** — 커스텀 규칙은 fix를 가질 수 없습니다(문서를 직접 변형 못 함). 타임아웃/예외는 해당 규칙만 에러로 기록되고 나머지는 계속 진행됩니다.

**apply**: 기본 false(dry-run, 위반 목록 + 수정 계획만 반환). true 면 **빌트인 안전수정(섹션 확장, grow container)만** 실제 적용 — section_overlap/instance_orphan/outside_section 및 모든 커스텀 규칙은 재배치·수동 판단이 필요해 보고만 합니다. 적용 후 자동 회귀 검사 결과(after)를 반환합니다.

배치/resize 후 이 도구로 회귀 검사하는 습관을 권장합니다.

**검사 범위 (scope):**
- \`page\`(기본): 바인딩된 페이지 1개. \`apply\` 자동수정 지원.
- \`file\`: 파일의 전 페이지 순회(read-only). 결과를 **markdown 리포트 파일**로 떨구고 응답엔 페이지별 요약 + 리포트 경로만 반환(위반이 수백 건일 수 있어 인라인 금지). 리포트는 \`~/.sigma/lint-reports/\` 에 저장되고 서버 자동정리(7일/100MB) 대상.

**config 출처 (3순위):** inline \`config\` 객체 > \`configPath\` 파일 > 문서 노드에 저장된 \`lint\`(sigma_set_page_data, pageId:"document").

**config 모드 (configMode):**
- \`merge\`(기본): base + 페이지 저장 config 병합. **builtins·custom 모두 rule id 단위로** 페이지가 override 하고, base 에만 있는 규칙은 살아남는다. 문서=base + 페이지=override 패턴.
- \`per-page\`: 각 페이지에 저장된 lint config(sigma_set_page_data, key:"lint")로 각각(base 는 안 섞임). 저장 없으면 base 폴백, base도 없으면 그 페이지 skip(명시).
- \`uniform\`: base config 하나로 전 대상 일괄. **페이지 저장 config 를 무시**한다 — 페이지가 끈 규칙까지 되살아나므로 의도할 때만 명시. base 필수.

페이지 저장 config 는 sigma_set_page_data({ key:"lint", value }) 로, 문서 base 는 pageId:"document" 로 저장합니다.

**완전성**: lint 는 트리를 \`treeNodeLimit\`(기본 200000) 노드까지 전수 순회합니다(get_tree 인터랙티브 기본 1000과 다름 — lint 는 부분 스캔을 clean 으로 오보하면 안 되므로). 상한에 걸리면 응답에 \`scanTruncated: true\` + \`scannedNodes\` + \`scanWarning\` 을 싣고 \`clean\` 을 false 로 강제합니다(그 페이지는 \`treeNodeLimit\` 을 올리거나 \`nodeId\` 스코프로 섹션별로 나눠 재검사).`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Sigma 토큰 (stk-...)' },
        configPath: { type: 'string', description: '(선택) 검사 규칙 JSON 파일 경로. config/configPath/문서저장 중 하나로 base 제공(uniform은 base 필수)' },
        config: { type: 'object', description: '(선택) inline LintConfig 객체. configPath 대신 직접 전달(우선순위 최상)' },
        scope: { type: 'string', enum: ['page', 'file'], description: '(선택) page(기본, 바인딩 1페이지) | file(전 페이지 순회, md 리포트)' },
        configMode: { type: 'string', enum: ['uniform', 'per-page', 'merge'], description: '(선택) merge(기본, base+페이지 저장 config 를 rule id 단위 병합) | per-page(페이지 저장 config 만) | uniform(base 만 — 페이지 저장 config 무시)' },
        nodeId: { type: 'string', description: '(선택, scope=page) 검사 시작 노드. 미지정 시 페이지 전체' },
        path: { type: 'string', description: '(선택, scope=page) 검사 시작 경로 ("A/B/C")' },
        apply: { type: 'boolean', description: '(선택, scope=page) true 면 빌트인 안전수정 실제 적용. 기본 false(dry-run). file 범위에선 무시(read-only)' },
        treeNodeLimit: { type: 'number', description: '(선택) 트리 순회 노드 상한. 기본 200000(현실 페이지는 안 걸림). 이 상한에 걸리면 뒤쪽이 미검사되고 응답에 scanTruncated/scannedNodes/scanWarning + clean=false 로 명시됨. 아주 큰 페이지를 통째로 검사하려면 올리고, 빠르게 훑으려면 낮추세요.' },
        treeTimeoutMs: { type: 'number', description: '(선택) 트리 조회 타임아웃(ms). 기본 60000. treeNodeLimit 을 크게 올려 괴물 페이지를 통째로 뜰 때 플러그인 직렬화가 60초를 넘겨 실패하면 이 값도 함께 올리세요(둘은 짝).' },
      },
      required: ['token'],
    },
  },

  // === Server Status (토큰 불필요) ===
  {
    name: 'sigma_server_status',
    description: '서버 전체 상태를 확인합니다 (연결된 플러그인, 스토리지, 토큰 상태 등)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
