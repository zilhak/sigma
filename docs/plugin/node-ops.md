# 노드 조작 (Node Ops)

Figma 노드를 생성, 수정, 조회, 삭제하는 핵심 모듈입니다.

**소스:** `packages/figma-plugin/src/node-ops/`

---

## 모듈 구성

| 파일 | 기능 | 관련 MCP 도구 |
|------|------|---------------|
| `modify.ts` | 노드 속성 수정 (73개 메서드) | `sigma_modify_node` |
| `create.ts` | 도형/텍스트/프레임/이미지 생성 | `sigma_create_rectangle/text/ellipse/...` |
| `query.ts` | 노드 정보 조회 (단일/배치/문서) | `sigma_get_node_info/nodes_info/document_info` |
| `batch.ts` | 배치 작업 (스캔/일괄수정/삭제) | `sigma_batch_modify/batch_delete/scan_*` |
| `tree.ts` | 트리 탐색/검색 | `sigma_find_node/get_tree` |
| `selection.ts` | 선택 관리 + 뷰포트 | `sigma_get/set_selection/viewport` |
| `frames.ts` | 프레임 삭제 | `sigma_delete_frame` |
| `move.ts` | 이동/복제/그룹/언그룹/평탄화 | `sigma_move_node/clone_node/group_nodes/...` |
| `boolean.ts` | Boolean 연산 | `sigma_boolean_operation` |
| `section.ts` | Section 생성 | `sigma_create_section` |
| `create.ts` | SVG, 이미지 노드 생성 | `sigma_create_node_from_svg/image` |
| `export.ts` | 이미지 export | `sigma_screenshot` (내부) |
| `page.ts` | 페이지 관리 | `sigma_create/rename/switch/delete_page` |

---

## modify.ts — 노드 속성 수정

**MCP 도구:** `sigma_modify_node(token, nodeId, method, args)`

`executeModifyNode(nodeId, method, args)` 함수가 진입점입니다. `ALLOWED_METHODS` 레코드에서 메서드를 찾아 실행합니다.

### 타입 안전 유틸리티

Agent가 보내는 값을 정규화하는 유틸리티 함수들:

| 함수 | 변환 | 예시 |
|------|------|------|
| `toNum(val, name)` | `"16"` → `16` | fontSize |
| `toNumOpt(val, name)` | `undefined` → `undefined` | optional 인자 |
| `toBool(val)` | `"false"` → `false` | visibility |
| `toEnum(val, allowed, name)` | `"center"` → `"CENTER"` | alignment |

### 노드 타입별 지원 검증

`METHOD_SUPPORT_MATRIX`로 각 메서드가 어떤 노드 타입에서 지원되는지 검증합니다. 지원하지 않는 노드 타입에 메서드를 호출하면 사용 가능한 메서드 목록을 에러로 반환합니다.

### 메서드 카테고리 (73개)

**Basic (7개):**
`rename`, `resize`, `move`, `setOpacity`, `setVisible`, `setLocked`, `remove`

**Visual (13개):**
`setFills`, `setSolidFill`, `setStrokes`, `setStrokeWeight`, `setCornerRadius`, `setCornerRadii`, `setEffects`, `setBlendMode`, `setCornerSmoothing`, `setDashPattern`, `setMask`, `setGradientFill`, `setImageFill`

**Stroke Advanced (4개):**
`setStrokeAlign`, `setStrokeCap`, `setStrokeJoin`, `setIndividualStrokeWeights`

**Transform (1개):**
`setRotation`

**Layout — Frame (12개):**
`setLayoutMode`, `setPadding`, `setItemSpacing`, `setClipsContent`, `setPrimaryAxisSizingMode`, `setCounterAxisSizingMode`, `setPrimaryAxisAlignItems`, `setCounterAxisAlignItems`, `setLayoutWrap`, `setCounterAxisSpacing`, `setLayoutSizing`, `setOverflowDirection`

**Layout — Child (3개):**
`setLayoutAlign`, `setLayoutGrow`, `setLayoutPositioning`

**Constraints (5개):**
`setConstraints`, `setMinWidth`, `setMaxWidth`, `setMinHeight`, `setMaxHeight`

**Text (14개):**
`setCharacters`, `setFontSize`, `setTextAlignHorizontal`, `setTextAlignVertical`, `setFontFamily`, `setFontWeight`, `setTextAutoResize`, `setLineHeight`, `setLetterSpacing`, `setParagraphSpacing`, `setParagraphIndent`, `setTextCase`, `setTextTruncation`, `setMaxLines`

**Rich Text — Range (9개):**
`setRangeFontSize`, `setRangeFontName`, `setRangeFills`, `setRangeTextDecoration`, `setRangeLineHeight`, `setRangeLetterSpacing`, `setRangeHyperlink`, `setRangeListOptions`, `setRangeIndentation`

**Plugin Data (5개):**
`setPluginData`, `getPluginData`, `getPluginDataKeys`, `setSharedPluginData`, `getSharedPluginData`

### 텍스트 메서드의 폰트 로드

텍스트 관련 메서드는 실행 전 `loadTextNodeFonts()`로 폰트를 로드합니다:
- `figma.mixed`인 경우 `getRangeAllFontNames()`로 모든 폰트 수집
- 각 폰트에 대해 `figma.loadFontAsync()` 호출

---

## create.ts — 도형/텍스트/프레임 생성

각 함수가 Figma 노드를 생성하고 결과를 반환합니다.

| 함수 | 생성 노드 | 핵심 로직 |
|------|-----------|-----------|
| `createRectangle()` | RectangleNode | fills, strokes, cornerRadius |
| `createText()` | TextNode | `figma.loadFontAsync()` 필수, fontSize/fontFamily/color |
| `createEmptyFrame()` | FrameNode | Auto Layout 옵션 (layoutMode, padding, itemSpacing) |
| `createEllipse()` | EllipseNode | arcData로 부분 원 지원 |
| `createPolygon()` | PolygonNode | pointCount로 꼭지점 수 |
| `createStar()` | StarNode | pointCount + innerRadius |
| `createLine()` | LineNode | length, rotation |
| `createVector()` | VectorNode | vectorPaths (SVG path data) |
| `createImageNode()` | RectangleNode + ImagePaint | base64 → `figma.createImage()` |
| `createNodeFromSvg()` | VectorNode/Group | `figma.createNodeFromSvg(svgString)` |

### parentId 지원

모든 생성 함수는 `parentId` 옵션을 받습니다. 지정하면 해당 노드의 자식으로 생성되고, 미지정이면 현재 페이지의 루트에 생성됩니다.

---

## query.ts — 노드 정보 조회

| 함수 | MCP 도구 | 반환 |
|------|----------|------|
| `getNodeInfo(nodeId)` | `sigma_get_node_info` | fills, strokes, effects, text 속성, Auto Layout 등 상세 |
| `getNodesInfo(nodeIds)` | `sigma_get_nodes_info` | 여러 노드 일괄 조회 |
| `getDocumentInfo()` | `sigma_get_document_info` | 파일명, 페이지 목록 |
| `getStyles()` | `sigma_get_styles` | 로컬 Paint/Text/Effect/Grid 스타일 |
| `readMyDesign()` | `sigma_get_selection_details` | 현재 선택된 노드의 상세 정보 |
| `listAvailableFonts()` | `sigma_list_fonts` | 사용 가능한 폰트 목록 |
| `getNodeCSS(nodeId)` | `sigma_get_css` | 노드의 CSS 속성 추출 |

---

## batch.ts — 배치 작업

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `scanTextNodes(nodeId)` | `sigma_scan_text_nodes` | 하위 모든 TextNode 수집 |
| `scanNodesByTypes(nodeId, types)` | `sigma_scan_nodes_by_types` | 특정 타입 노드 수집 |
| `batchModify(operations)` | `sigma_batch_modify` | `[{nodeId, method, args}]` 일괄 실행 |
| `batchDelete(nodeIds)` | `sigma_batch_delete` | 여러 노드 일괄 삭제 |
| `setMultipleTextContents(items)` | `sigma_set_multiple_text_contents` | `[{nodeId, text}]` 일괄 텍스트 변경 |

---

## tree.ts — 트리 탐색/검색

### findNodeWithDetails(path, type?, pageId?)

**MCP 도구:** `sigma_find_node`

경로 문자열(예: `"Header > Logo"`)로 노드를 검색합니다.

- `/`나 `>` 구분자로 경로 분할
- 각 세그먼트에 대해 이름 매칭으로 탐색
- `type` 필터로 특정 노드 타입만 반환

> `sigma_find_node` 에는 속성 조건 검색(`where`) 축도 있지만, 그쪽은 **서버에서 평가**하므로
> 이 함수를 타지 않습니다(서버가 `getTree` 결과에 lint 엔진의 `queryNodes` 를 적용).
> 플러그인 변경 없이 동작하며, 스키마는 [mcp-tools.md](../mcp-tools.md) 참조.

### getTreeWithFilter(options)

**MCP 도구:** `sigma_get_tree`

문서 계층 구조를 트리로 반환합니다.

- `nodeId`: 특정 노드부터 탐색 시작
- `path`: 경로로 시작 노드 지정
- `depth`: 탐색 깊이 (기본: 2, `'full'`이면 전체)
- `filter.types`: 특정 타입만 포함
- `filter.namePattern`: 이름 패턴 매칭
- `limit`: 최대 노드 수 제한

---

## move.ts — 이동/복제/그룹

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `moveNode(nodeId, parentId, index?)` | `sigma_move_node` | 다른 부모로 reparent |
| `cloneNode(nodeId, ...)` | `sigma_clone_node` | 노드 복제 (위치/부모/이름 옵션) |
| `groupNodes(nodeIds, name?)` | `sigma_group_nodes` | 여러 노드를 GroupNode로 묶기 |
| `ungroupNodes(nodeId)` | `sigma_ungroup` | 그룹 해제 (자식을 부모로 이동) |
| `flattenNodes(nodeIds, name?)` | `sigma_flatten` | 여러 노드를 하나의 VectorNode로 평탄화 |

---

## boolean.ts — Boolean 연산

**MCP 도구:** `sigma_boolean_operation(token, nodeIds, operation)`

| operation | Figma API | 설명 |
|-----------|-----------|------|
| `UNION` | `figma.union()` | 합집합 |
| `SUBTRACT` | `figma.subtract()` | 차집합 |
| `INTERSECT` | `figma.intersect()` | 교집합 |
| `EXCLUDE` | `figma.exclude()` | 배타적 합집합 |

---

## selection.ts — 선택/뷰포트

| 함수 | MCP 도구 | 설명 |
|------|----------|------|
| `getSelection()` | `sigma_get_selection` | 현재 선택 노드 목록 |
| `setSelection(nodeIds, zoomToFit?)` | `sigma_set_selection` | 노드 선택 + 뷰포트 이동 |
| `getViewport()` | `sigma_get_viewport` | center, zoom, bounds 정보 |
| `setViewport(options)` | `sigma_set_viewport` | center+zoom 또는 nodeIds로 이동 |
