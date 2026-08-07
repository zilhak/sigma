// 버전 상수는 여기 두지 않는다.
//
// 예전에는 `export const VERSION = 'v1.0'` 하나가 플러그인 UI 헤더·확장 popup·
// GET /api/version 을 동시에 대표했다. 그런데 루트 CLAUDE.md 의 버전 규칙은 추적 축을
// 플러그인·서버 **둘**로 나누고 각각 독립적으로 올린다(지금 1.30 / 1.40). 축이 갈라진
// 순간부터 어떤 값을 넣어도 최소 한쪽은 틀리고, 실제로 둘 다 틀린 채 'v1.0' 으로 굳어 있었다.
//
// 이제 각 패키지가 자기 package.json 의 version 을 읽어 쓴다:
//   서버   packages/server/src/version.ts
//   플러그인·확장  각 build.ts 가 빌드 시 주입

/**
 * 서버 포트 설정
 */
export const PORTS = {
  HTTP: 19832,
  WEBSOCKET: 19831,
} as const;

// Shorthand exports
export const HTTP_PORT = PORTS.HTTP;
export const WS_PORT = PORTS.WEBSOCKET;

/**
 * 서버 URL
 */
export const SERVER_URL = `http://localhost:${PORTS.HTTP}`;
export const WEBSOCKET_URL = `ws://localhost:${PORTS.WEBSOCKET}`;

/**
 * API 엔드포인트
 */
export const API = {
  HEALTH: '/api/health',
  EXTRACTED: '/api/extracted',
  FIGMA_CREATE: '/api/figma/create',
} as const;

/**
 * 스토리지 경로
 */
export const STORAGE_PATH = '~/.sigma';
export const EXTRACTED_PATH = `${STORAGE_PATH}/extracted`;
export const SCREENSHOTS_PATH = `${STORAGE_PATH}/screenshots`;

export const STORAGE_SUBDIRS = {
  EXTRACTED: 'extracted',
  SCREENSHOTS: 'screenshots',
} as const;
