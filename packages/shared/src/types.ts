/**
 * RGBA 색상 (Figma 호환 - 0~1 범위)
 */
export interface RGBA {
  r: number; // 0-1
  g: number; // 0-1
  b: number; // 0-1
  a: number; // 0-1
}

/**
 * 바운딩 박스
 */
export interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 계산된 CSS 스타일
 */
export interface ComputedStyles {
  // 레이아웃
  display: string;
  position: string;
  flexDirection: string;
  justifyContent: string;
  alignItems: string;
  flexWrap: string;
  gap: number;

  // 크기
  width: number | 'auto';
  height: number | 'auto';
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;

  // 패딩
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;

  // 마진
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;

  // 배경
  backgroundColor: RGBA | null;
  backgroundImage: string | null;

  // 테두리 두께
  borderTopWidth: number;
  borderRightWidth: number;
  borderBottomWidth: number;
  borderLeftWidth: number;

  // 테두리 색상
  borderTopColor: RGBA | null;
  borderRightColor: RGBA | null;
  borderBottomColor: RGBA | null;
  borderLeftColor: RGBA | null;

  // 테두리 라운드
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomRightRadius: number;
  borderBottomLeftRadius: number;

  // 텍스트
  color: RGBA | null;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  textAlign: string;
  textDecoration: string;
  lineHeight: number;
  letterSpacing: number;

  // 기타
  opacity: number;
  overflow: string;
  boxShadow: string;
  transform: string;
}

/**
 * 추출된 노드 (Extension → Server → Figma Plugin)
 */
export interface ExtractedNode {
  id: string;
  tagName: string;
  className: string;
  textContent: string;
  attributes: Record<string, string>;
  styles: ComputedStyles;
  boundingRect: BoundingRect;
  children: ExtractedNode[];
  /** SVG 요소인 경우 전체 SVG 마크업 (outerHTML) */
  svgString?: string;
  /** CSS pseudo-element (::before, ::after) 여부 */
  isPseudo?: boolean;
}

/**
 * 추출 데이터 저장 형식 (서버 저장용)
 */
export interface ExtractedData {
  id: string;
  name: string;
  data: ExtractedNode;
  format: 'json' | 'html';
  timestamp: number;
  metadata?: {
    url?: string;
    title?: string;
  };
}

/**
 * 서버 API 응답
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Extension → Server 전송 페이로드
 */
export interface ExtractPayload {
  name: string;
  data: ExtractedNode;
  format: 'json' | 'html';
  timestamp: number;
  metadata?: {
    url?: string;
    title?: string;
  };
}

/**
 * WebSocket 메시지 타입
 */
export type WebSocketMessage =
  | { type: 'REGISTER'; client: 'figma-plugin' }
  | { type: 'CREATE_FRAME'; commandId: string; data: ExtractedNode; name?: string }
  | { type: 'RESULT'; commandId: string; success: boolean; error?: string }
  | { type: 'PING' }
  | { type: 'PONG' };
