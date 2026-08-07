// Types
export type {
  RGBA,
  BoundingRect,
  ComputedStyles,
  ExtractedNode,
  ExtractedData,
  ApiResponse,
  ExtractPayload,
  WebSocketMessage,
  TreeFilter,
  TreeFields,
  TreeNode,
  FindNodeResult,
  GetTreeResult,
} from './types';

// Color utilities
export { parseColor, rgbaToString } from './colors';

// Component Spec (컴포넌트 스펙 시스템)
export type {
  ComponentParam,
  ComponentSizing,
  ComponentSpecRecord,
  SpecValidationResult,
  ComponentSpecStamp,
  ComponentSpecPolicy,
  SpecNamingRule,
} from './component-spec';
export {
  checkSpecNamingPolicy,
  validateComponentSpecHtml,
  isValidSpecName,
  ALLOWED_CSS_PROPS,
  ALLOWED_TAGS,
  SPEC_NAME_RE,
  SPEC_HTML_MAX_LENGTH,
} from './component-spec';

// Constants
export {
  PORTS,
  HTTP_PORT,
  WS_PORT,
  SERVER_URL,
  WEBSOCKET_URL,
  API,
  STORAGE_PATH,
  EXTRACTED_PATH,
} from './constants';

// Lint 엔진은 여기 없다 — 서브패스 `@sigma/shared/lint` 로만 노출한다 (src/lint/index.ts).
