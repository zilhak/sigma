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
// 플러그인(code.ts) → UI 메시지 중 **브리지가 특별 처리하는 것만** 나열한다.
// 그 밖의 *-result 는 bridge-plugin 의 default 패스스루가 {commandId,success,result,error} 로
// 그대로 서버에 넘기므로 여기 추가하지 않는다.
export const PLUGIN_MSG = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  FILE_INFO: 'file-info',
  PAGES_LIST: 'pages-list',
  EXTRACT_RESULT: 'extract-result',
  PAGE_LINT_RESULT: 'page-lint-result',
  GOTO_NODE_RESULT: 'goto-node-result',
  SELECTION_CHANGED: 'selection-changed',
} as const;
