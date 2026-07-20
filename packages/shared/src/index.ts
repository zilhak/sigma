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
} from './component-spec';
export {
  validateComponentSpecHtml,
  isValidSpecName,
  ALLOWED_CSS_PROPS,
  ALLOWED_TAGS,
  SPEC_NAME_RE,
  SPEC_HTML_MAX_LENGTH,
} from './component-spec';

// Constants
export {
  VERSION,
  PORTS,
  HTTP_PORT,
  WS_PORT,
  SERVER_URL,
  WEBSOCKET_URL,
  API,
  STORAGE_PATH,
  EXTRACTED_PATH,
} from './constants';

// Layout lint (공간 규약 검출/수정 엔진)
export type {
  LayoutRule,
  LayoutFix,
  LayoutViolation,
  LintOptions,
  LintResult,
} from './layout/lint';
export {
  DEFAULT_PADDING,
  lintLayout,
  mergeFixesBySection,
} from './layout/lint';
