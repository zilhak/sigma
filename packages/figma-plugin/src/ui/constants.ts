// 서버(WebSocket) → UI 메시지 타입 상수
// 서버(WebSocket) → UI 메시지 중 **브리지가 특별 처리하는 것만** 나열한다.
// 그 밖의 모든 명령은 bridge-server 의 default 제네릭 패스스루가 처리하므로 여기 추가하지 않는다.
// (필드를 손으로 고르는 case 를 늘리면 인자가 조용히 사라지는 버그가 돌아온다 — 실제로 세 번 났다.)
export const SERVER_MSG = {
  REGISTERED: 'REGISTERED',
  CREATE_FRAME: 'CREATE_FRAME',
  CHUNK_START: 'CHUNK_START',
  CHUNK: 'CHUNK',
  CHUNK_END: 'CHUNK_END',
  PING: 'PING',
} as const;

// 플러그인(code.ts) → UI 메시지 타입 상수
export const PLUGIN_MSG = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  FILE_INFO: 'file-info',
  PAGES_LIST: 'pages-list',
  DELETE_RESULT: 'delete-result',
  UPDATE_RESULT: 'update-result',
  MODIFY_RESULT: 'modify-result',
  EXTRACT_RESULT: 'extract-result',
  ROUNDTRIP_RESULT: 'roundtrip-result',
  FIND_NODE_RESULT: 'find-node-result',
  TREE_RESULT: 'tree-result',
  EXPORT_IMAGE_RESULT: 'export-image-result',
  EXTRACT_NODE_JSON_RESULT: 'extract-node-json-result',
  CREATE_SECTION_RESULT: 'create-section-result',
  MOVE_NODE_RESULT: 'move-node-result',
  CLONE_NODE_RESULT: 'clone-node-result',
  SET_PAGE_DATA_RESULT: 'set-page-data-result',
  GET_PAGE_DATA_RESULT: 'get-page-data-result',
  SET_NODE_DATA_RESULT: 'set-node-data-result',
  GET_NODE_DATA_RESULT: 'get-node-data-result',
  GET_NODES_DATA_RESULT: 'get-nodes-data-result',
  PAGE_LINT_RESULT: 'page-lint-result',
  GOTO_NODE_RESULT: 'goto-node-result',
  SELECTION_CHANGED: 'selection-changed',
} as const;
