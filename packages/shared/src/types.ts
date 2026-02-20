// ============================================
// 추출 및 통신 타입
// ============================================

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
  alignSelf: string;
  flexWrap: string;
  gap: number;
  rowGap: number;
  columnGap: number;
  borderSpacingX: number;  // border-spacing 가로 성분
  borderSpacingY: number;  // border-spacing 세로 성분

  // Flex 아이템 속성
  flexGrow: number;
  flexShrink: number;
  flexBasis: number | 'auto';

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
  whiteSpace: string;
  textOverflow: string;
  verticalAlign: string;

  // Grid 컨테이너 속성
  gridTemplateColumns: string;
  gridTemplateRows: string;
  gridAutoFlow: string;

  // Grid 아이템 속성
  gridColumnStart: string;
  gridColumnEnd: string;
  gridRowStart: string;
  gridRowEnd: string;

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
  /** 이미지 데이터 URL (canvas, img 요소에서 추출) */
  imageDataUrl?: string;
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

// ============================================
// Figma 트리 탐색 타입 (sigma_find_node, sigma_get_tree)
// ============================================

/**
 * 트리 탐색 필터
 */
export interface TreeFilter {
  /** 허용할 노드 타입 (예: ['FRAME', 'SECTION']) */
  types?: string[];
  /** 이름 정규식 패턴 (예: 'Button.*') */
  namePattern?: string;
}

/**
 * 트리 노드 정보
 */
export interface TreeNode {
  id: string;
  name: string;
  type: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 직접 자식 수 */
  childCount: number;
  /** 자식 노드들 (depth > 0일 때만) */
  children?: TreeNode[];
  /** 루트부터의 전체 경로 (예: "Section/Frame/Button") */
  fullPath?: string;
  /** 타입별 추가 정보 */
  meta?: {
    visible?: boolean;
    locked?: boolean;
    /** FRAME/COMPONENT만 해당 */
    layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
    /** TEXT만 해당 (처음 100자) */
    characters?: string;
  };
}

/**
 * sigma_find_node 결과
 */
export interface FindNodeResult {
  /** 단일 매칭 시 노드 정보 */
  node?: TreeNode;
  /** 다중 매칭 시 노드 목록 */
  matches?: TreeNode[];
  /** 다중 매칭 시 경고 메시지 */
  warning?: string;
}

/**
 * sigma_get_tree 결과
 */
export interface GetTreeResult {
  pageId: string;
  pageName: string;
  /** 탐색 시작점 노드 ID (페이지 루트면 null) */
  rootNodeId: string | null;
  /** 탐색 시작점 경로 (path로 지정했을 때) */
  rootNodePath?: string;
  /** 자식 노드들 */
  children: TreeNode[];
  /** limit에 의해 결과가 잘렸는지 */
  truncated?: boolean;
  /** 총 탐색된 노드 수 */
  totalCount?: number;
}
