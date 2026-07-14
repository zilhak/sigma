/**
 * 컴포넌트 스펙 시스템 타입 정의
 *
 * 컴포넌트 스펙 = 엄격한 규칙(CSS 화이트리스트 + data-sigma-* 주석)을 따르는 HTML.
 * MCP가 이 스펙으로 Figma 컴포넌트를 빌드하고, alias로 인스턴스를 생성한다.
 */

/** 컴포넌트 파라미터 (MVP: 텍스트 슬롯만) */
export interface ComponentParam {
  /** 파라미터 이름 (^[a-z][a-z0-9_]*$) */
  name: string;
  /** 파라미터 타입 (MVP는 text 고정, 이후 enum/boolean 확장) */
  type: 'text';
  /** 스펙 HTML에 적힌 기본 텍스트 */
  defaultValue: string;
  /** slot 요소의 data-sigma-desc — 에이전트가 값을 채울 때 참고하는 설명 */
  description?: string;
  /** text-overflow: ellipsis slot — 컨테이너 폭을 넘치면 …으로 잘림 (긴 값 안전, 단일 행) */
  truncates?: boolean;
  /** white-space: normal slot — 컨테이너 폭에서 줄바꿈되는 다중 행 텍스트 (주석/본문용) */
  wraps?: boolean;
}

/**
 * 축별 크기 동작.
 * - hug: 내용에 따라 늘어남 (size의 해당 축 값은 "기본 텍스트일 때"의 참고값)
 * - fixed: 스펙에 명시된 고정 크기
 */
export interface ComponentSizing {
  horizontal: 'hug' | 'fixed';
  vertical: 'hug' | 'fixed';
}

/** 서버 레지스트리에 저장되는 컴포넌트 스펙 레코드 */
export interface ComponentSpecRecord {
  /** 의미론적 식별자 (^[a-z][a-z0-9_]*$), 예: ui_badge */
  alias: string;
  /**
   * 네임스페이스 — 같은 역할·다른 스타일 체계의 컴포넌트 구분
   * (예: 기획용 "plan" vs 디자인용 "design", 페이지별 테마).
   * 미지정 시 "default". 유일성 키는 (namespace, alias).
   */
  namespace: string;
  /** 에이전트에게 노출되는 한 줄 설명 */
  description: string;
  /** 정의에 사용된 HTML 원문 (상세 조회 시 노출) */
  html: string;
  /** 추출된 파라미터 목록 */
  params: ComponentParam[];
  /** 빌드된 Figma ComponentNode의 id */
  componentNodeId: string;
  /** Figma component key (라이브러리 공유 시 사용) */
  componentKey: string;
  /** 기본 상태 크기 (px) — hug 축은 기본 텍스트 기준 참고값 */
  size: { width: number; height: number };
  /** 축별 크기 동작 (스펙 루트의 width/height 명시 여부에서 유도) */
  sizing: ComponentSizing;
  /**
   * 컴포넌트가 존재하는 파일의 Sigma 파일 ID
   * (figma.root pluginData 'sigma-file-id' — 최초 등록 시 발급, 파일과 함께 이동).
   * use 시 바인딩된 파일과 대조해 다른 파일에서의 오사용을 막는다.
   */
  fileId?: string;
  /** 등록 당시 파일 이름 (안내용) */
  fileName?: string;
  createdAt: number;
  updatedAt: number;
}

/** 스펙 HTML 검증 결과 */
export interface SpecValidationResult {
  ok: boolean;
  /** 검증 실패 사유 (ok=false일 때). 위반 항목을 구체적으로 나열 */
  errors: string[];
  /** 추출된 파라미터 목록 (ok=true일 때 유효) */
  params: ComponentParam[];
  /** 루트 스타일에서 유도한 축별 크기 동작 */
  sizing: ComponentSizing;
}

/** Figma 컴포넌트 노드에 pluginData('sigma-spec')로 스탬프되는 계약 정보 */
export interface ComponentSpecStamp {
  alias: string;
  params: ComponentParam[];
  /** param 이름 → Figma component property id 매핑 */
  propertyIds: Record<string, string>;
}
