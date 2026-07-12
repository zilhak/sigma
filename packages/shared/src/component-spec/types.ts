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
}

/** 서버 레지스트리에 저장되는 컴포넌트 스펙 레코드 */
export interface ComponentSpecRecord {
  /** 의미론적 식별자 (^[a-z][a-z0-9_]*$), 예: ui_badge */
  alias: string;
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
  /** 컴포넌트가 존재하는 Figma 파일 key (알 수 있는 경우) */
  fileKey?: string;
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
}

/** Figma 컴포넌트 노드에 pluginData('sigma-spec')로 스탬프되는 계약 정보 */
export interface ComponentSpecStamp {
  alias: string;
  params: ComponentParam[];
  /** param 이름 → Figma component property id 매핑 */
  propertyIds: Record<string, string>;
}
