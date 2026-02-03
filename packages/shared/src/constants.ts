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

// Shorthand URL exports
export const HTTP_URL = SERVER_URL;
export const WS_URL = WEBSOCKET_URL;

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
