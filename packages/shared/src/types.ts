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
  /** 텍스트가 실제로 여러 줄로 래핑되는지 (고정폭 + HEIGHT auto-resize 필요) */
  textWraps?: boolean;

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
/**
 * 트리 노드에 실을 필드 집합.
 * - 'all'(기본): 기존 그대로 — fullPath + meta(visible/locked/layoutMode/characters/layoutSizing/description) 포함
 * - 'geometry': 좌표 작업 전용 — id/name/type/boundingBox/absolute/childCount/children 만. fullPath·meta 생략.
 *   위치 보정처럼 좌표만 필요한 작업에서 meta.characters(최대 100자)·fullPath 가 페이로드를 지배하는 걸 막는다.
 */
export type TreeFields = 'all' | 'geometry';

/**
 * 노드 선택 조건. `filter`(레거시) / `omit` / `keep` 이 같은 모양을 쓴다 —
 * **의미는 셋이 다르다**:
 *
 * | 인자 | 동작 |
 * |---|---|
 * | `filter` | 매칭하지 **않는** 노드를 서브트리째 제외 (화이트리스트 prune, 이름과 달리 "거르기"가 아니다) |
 * | `omit` | 매칭하는 노드를 서브트리째 제외 (블랙리스트 prune) |
 * | `keep` | 매칭 노드를 남기고 조상은 뼈대로 유지, 매칭 없는 가지는 제거 |
 *
 * `filter.types:['TEXT']` 가 오류 없이 0건을 돌려주던 것이 `keep` 을 만든 이유다 —
 * TEXT 는 언제나 FRAME 밑에 있는데 그 부모가 먼저 잘렸다.
 * 배경: docs/history/008-get-tree-filter-was-a-prune.md
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
  /** 루트부터의 전체 경로 (예: "Section/Frame/Button"). fields:"geometry" 에선 생략 */
  fullPath?: string;
  /** 페이지 절대좌표 좌상단. fields:"geometry" 에서만 채워진다 — boundingBox 는 부모 로컬좌표라
   *  다른 컨테이너에 속한 노드끼리 겹침·거리를 비교하려면 이 값이 필요하다. */
  absolute?: { x: number; y: number };
  /** 타입별 추가 정보 */
  meta?: {
    visible?: boolean;
    locked?: boolean;
    /** FRAME/COMPONENT만 해당 */
    layoutMode?: string;
    /** TEXT만 해당 (처음 100자) */
    characters?: string;
    /** 오토레이아웃 자식으로 참여 가능한 노드 타입만 해당(FRAME/TEXT/RECTANGLE 등) */
    layoutSizingHorizontal?: string;
    layoutSizingVertical?: string;
    /** COMPONENT/COMPONENT_SET만 해당 */
    description?: string;
    /** fills 를 가질 수 있는 타입만 해당. 자식이 없어도 fill 로 내용을 그리는 노드(이미지 프레임 등)를
     *  empty_container 가 오탐하지 않도록 하는 판정 근거. */
    hasVisibleFill?: boolean;
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
  /** 탐색 시작점 노드 자신의 정보 (nodeId/path 로 스코프를 좁혔을 때만). children 은 이 노드의 자식이므로,
   *  스코프 검사에서 "자식이 이 컨테이너 안에 있는가"를 판정하려면 이 값이 필요하다.
   *  `children` 은 담지 않는다(형제 필드로 따로 온다) — 그래서 TreeNode 자체가 아니라 이 모양이다.
   *  ⚠️ `meta`·`childCount` 를 뺐다가 스코프 루트를 보는 규칙이 전부 오탐/침묵했다.
   *  배경: docs/history/019-scope-root-skipped-by-name-rules.md */
  rootNode?: Omit<TreeNode, 'children' | 'fullPath'>;
  /** 시작 노드가 INSTANCE 안쪽인가. 조상은 트리에 담기지 않아 lint 가 스스로 알 수 없으므로
   *  플러그인이 판정해 준다 — 인스턴스 내부를 면제하는 규칙이 시작 노드에도 면제를 걸기 위함. */
  rootNodeInsideInstance?: boolean;
  /** 자식 노드들 */
  children: TreeNode[];
  /** limit에 의해 결과가 잘렸는지 */
  truncated?: boolean;
  /** 순회 예산(budgetMs)을 넘겨 중단됐다 — 결과는 부분이다.
   *  배경: docs/history/015-big-page-lint-killed-the-plugin.md */
  timedOut?: boolean;
  /** 총 탐색된 노드 수 (keep 모드에선 **매칭 노드만** — 뼈대는 skeletonCount 로 따로 센다) */
  totalCount?: number;
  /** keep 모드에서 경로를 보여주려고 남긴 비매칭 조상 수 */
  skeletonCount?: number;
}
