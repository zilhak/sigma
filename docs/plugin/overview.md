# Figma Plugin 개요

Sigma Figma Plugin은 서버로부터 WebSocket 명령을 받아 Figma API를 실행하는 브릿지입니다.

## 실행 환경

Plugin은 두 개의 격리된 환경에서 실행됩니다:

| 환경 | 파일 | API | 역할 |
|------|------|-----|------|
| **Figma Sandbox** | `code.ts` | `figma.*` API | 노드 생성/조작, Figma API 호출 |
| **iframe** | `ui.ts` + `ui.html` | 브라우저 API, fetch, WebSocket | 서버 통신, UI 렌더링 |

두 환경 간 통신은 `postMessage`로만 가능합니다.

## 전체 통신 흐름

```
MCP Tool 호출 (AI Agent)
  │
  │ MCP (stdio / HTTP)
  ▼
Server (mcp/handlers/figma.ts)
  │
  │ validateFigmaAccess(token) → pluginId, pageId
  ▼
WebSocket Server (websocket/server.ts)
  │
  │ sendCommand(pluginId, { type, ...args })
  │ → PendingCommand 등록 (Promise + timeout)
  ▼
Plugin UI (ui.ts — iframe)
  │
  │ WebSocket onmessage → postMessage
  ▼
Plugin Code (code.ts — Figma Sandbox)
  │
  │ figma.ui.onmessage → switch(msg.type) → node-ops 호출
  ▼
Figma API 실행
  │
  │ 결과를 figma.ui.postMessage()로 반환
  ▼
Plugin UI (ui.ts)
  │
  │ postMessage → WebSocket send
  ▼
WebSocket Server
  │
  │ PendingCommand.resolve(result)
  ▼
MCP Handler → AI Agent에 응답
```

## code.ts — 메시지 디스패처

`code.ts`는 `figma.ui.onmessage`로 메시지를 받아 `switch(msg.type)`으로 라우팅합니다.

### 메시지 타입 → 핸들러 매핑

| msg.type | 호출되는 함수 | 모듈 | MCP 도구 |
|----------|---------------|------|----------|
| `create-from-json` | `createFrameFromJSON()` | converter/frame | `sigma_create_frame` |
| `create-from-html` | `createFrameFromHTML()` | converter/frame | `sigma_create_frame` |
| `update-frame` | `updateExistingFrame()` | converter/frame | `sigma_update_frame` |
| `modify-node` | `executeModifyNode()` | node-ops/modify | `sigma_modify_node` |
| `get-frames` | `getFrames()` | node-ops/frames | `sigma_get_frames` |
| `delete-frame` | `deleteFrame()` | node-ops/frames | `sigma_delete_frame` |
| `find-node` | `findNodeWithDetails()` | node-ops/tree | `sigma_find_node` |
| `get-tree` | `getTreeWithFilter()` | node-ops/tree | `sigma_get_tree` |
| `get-node-info` | `getNodeInfo()` | node-ops/query | `sigma_get_node_info` |
| `get-nodes-info` | `getNodesInfo()` | node-ops/query | `sigma_get_nodes_info` |
| `get-document-info` | `getDocumentInfo()` | node-ops/query | `sigma_get_document_info` |
| `get-styles` | `getStyles()` | node-ops/query | `sigma_get_styles` |
| `get-selection` | `getSelection()` | node-ops/selection | `sigma_get_selection` |
| `set-selection` | `setSelection()` | node-ops/selection | `sigma_set_selection` |
| `get-viewport` | `getViewport()` | node-ops/selection | `sigma_get_viewport` |
| `set-viewport` | `setViewport()` | node-ops/selection | `sigma_set_viewport` |
| `create-rectangle` | `createRectangle()` | node-ops/create | `sigma_create_rectangle` |
| `create-text` | `createText()` | node-ops/create | `sigma_create_text` |
| `create-empty-frame` | `createEmptyFrame()` | node-ops/create | `sigma_create_empty_frame` |
| `create-ellipse` | `createEllipse()` | node-ops/create | `sigma_create_ellipse` |
| `create-polygon` | `createPolygon()` | node-ops/create | `sigma_create_polygon` |
| `create-star` | `createStar()` | node-ops/create | `sigma_create_star` |
| `create-line` | `createLine()` | node-ops/create | `sigma_create_line` |
| `create-vector` | `createVector()` | node-ops/create | `sigma_create_vector` |
| `create-image` | `createImageNode()` | node-ops/create | `sigma_create_image` |
| `create-node-from-svg` | `createNodeFromSvg()` | node-ops/create | `sigma_create_node_from_svg` |
| `create-component` | `createComponent()` | node-ops/components | `sigma_create_component` |
| `create-component-instance` | `createComponentInstance()` | node-ops/components | `sigma_create_component_instance` |
| `create-section` | `createSection()` | node-ops/section | `sigma_create_section` |
| `create-sticky` | `createSticky()` | node-ops/figjam | `sigma_create_sticky` |
| `create-connector` | `createConnector()` | node-ops/figjam | `sigma_create_connector` |
| `move-node` | `moveNode()` | node-ops/move | `sigma_move_node` |
| `clone-node` | `cloneNode()` | node-ops/move | `sigma_clone_node` |
| `group-nodes` | `groupNodes()` | node-ops/move | `sigma_group_nodes` |
| `ungroup-nodes` | `ungroupNodes()` | node-ops/move | `sigma_ungroup` |
| `flatten-nodes` | `flattenNodes()` | node-ops/move | `sigma_flatten` |
| `boolean-operation` | `performBooleanOperation()` | node-ops/boolean | `sigma_boolean_operation` |
| `batch-modify` | `batchModify()` | node-ops/batch | `sigma_batch_modify` |
| `batch-delete` | `batchDelete()` | node-ops/batch | `sigma_batch_delete` |
| `set-multiple-text` | `setMultipleTextContents()` | node-ops/batch | `sigma_set_multiple_text_contents` |
| `scan-text-nodes` | `scanTextNodes()` | node-ops/batch | `sigma_scan_text_nodes` |
| `scan-nodes-by-types` | `scanNodesByTypes()` | node-ops/batch | `sigma_scan_nodes_by_types` |
| `export-image` | `exportImage()` | node-ops/export | `sigma_screenshot` |
| `extract-to-json` | `extractNodeToJSON()` | extractor/ | `sigma_extract_node` |
| `extract-to-html` | `convertExtractedNodeToHTML()` | extractor/ | `sigma_extract_node` |
| `get-annotations` | `getAnnotations()` | node-ops/annotations | `sigma_get_annotations` |
| `set-annotation` | `setAnnotation()` | node-ops/annotations | `sigma_set_annotation` |
| `get-reactions` | `getReactions()` | node-ops/prototyping | `sigma_get_reactions` |
| `add-reaction` | `addReaction()` | node-ops/prototyping | `sigma_add_reaction` |
| `remove-reactions` | `removeReactions()` | node-ops/prototyping | `sigma_delete_reactions` |
| `create-page` | `createPage()` | node-ops/page | `sigma_create_page` |
| `rename-page` | `renamePage()` | node-ops/page | `sigma_rename_page` |
| `switch-page` | `switchPage()` | node-ops/page | `sigma_switch_page` |
| `delete-page` | `deletePage()` | node-ops/page | `sigma_delete_page` |
| (스타일/변수/라이브러리) | (각 모듈 함수) | node-ops/styles, variables, library | (각 도구) |

## 이벤트 리스너

`code.ts`는 메시지 라우팅 외에 Figma 이벤트도 감지합니다:

| 이벤트 | 동작 |
|--------|------|
| `figma.on('currentpagechange')` | 페이지 변경 시 `sendFileInfo()` → UI에 파일 정보 전달 |
| `figma.on('selectionchange')` | 선택 변경 시 `sendSelectionInfo()` → 선택 노드 목록 + 뷰포트 |
| 뷰포트 변경 (500ms 폴링) | center/zoom 변경 감지 → `sendSelectionInfo()` |

## MCP → Plugin 연결 구조

### Server 측 (mcp/handlers/figma.ts)

```typescript
// 모든 핸들러의 공통 패턴:
async sigma_some_tool(args, context) {
  const { wsServer } = context;

  // 1. 토큰 검증 + 바인딩된 pluginId/pageId 추출
  const access = validateFigmaAccess(args.token, wsServer);
  if (access.error) return access.error;
  const { pluginId, pageId } = access;

  // 2. WebSocket 서버를 통해 Plugin에 명령 전달
  const result = await wsServer.someMethod(args, pluginId, pageId);

  // 3. 결과를 MCP 응답으로 변환
  return jsonResponse({ success: true, ...result });
}
```

### WebSocket Server (websocket/server.ts)

```typescript
// 명령 전달 패턴:
class FigmaWebSocketServer {
  // Plugin에 명령 전송 → Promise로 결과 대기
  async sendCommand(pluginId, command): Promise<unknown> {
    const cmdId = generateCommandId();
    const plugin = this.getPlugin(pluginId);

    // PendingCommand 등록 (resolve/reject/timeout)
    return new Promise((resolve, reject) => {
      this.pendingCommands.set(cmdId, { resolve, reject, timeout: ... });
      plugin.ws.send(JSON.stringify({ id: cmdId, ...command }));
    });
  }
}
```

### 1MB 청킹

WebSocket 전송 시 1MB를 초과하는 데이터는 자동으로 청크로 분할됩니다:

```
전송 측: message → 1MB 단위 분할 → [chunk_start, chunk_data..., chunk_end]
수신 측: 청크 수신 → 버퍼 조립 → 완성된 메시지 처리
```

## 코드 제약 사항

| 제약 | 이유 |
|------|------|
| `??` 연산자 사용 금지 | Figma Sandbox ES2017 한계 |
| `?.` 사용 가능 | esbuild가 변환 |
| `code.ts`에서 DOM/fetch 불가 | Figma Sandbox 격리 |
| `ui.ts`에서 `figma.*` 불가 | iframe 격리 |
| localhost만 접근 가능 | Figma Desktop의 Electron 환경 |

## 관련 문서

- [변환기 (Converter)](converter.md) — JSON/HTML → Figma 프레임 변환
- [노드 조작 (Node Ops)](node-ops.md) — 73개 modify 메서드, 도형 생성, 조회, 배치
- [스크린샷](screenshot.md) — 이미지 export + 토큰 최적화 파이프라인
- [컴포넌트/변수/스타일](components.md) — 컴포넌트, 인스턴스, Team Library, 변수, 스타일
- [프로토타이핑/주석/페이지](prototyping.md) — 인터랙션, 주석, 페이지 관리
