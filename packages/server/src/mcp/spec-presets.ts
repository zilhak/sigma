/**
 * 내장 스펙 프리셋 — sigma가 미리 정의해 배포하는 컴포넌트 스펙 "표준 라이브러리".
 *
 * sigma_import_spec_preset(token, preset)으로 현재 바인딩된 파일에 등록되며,
 * 이후에는 사용자 등록 스펙과 완전히 동일하게 동작한다
 * (sigma_create_component_spec_instance로 사용, overwrite로 커스터마이즈 가능).
 *
 * 모든 HTML은 스펙 검증기(validateComponentSpecHtml)를 통과해야 한다 —
 * 유닛 테스트(spec-presets.test.ts)가 이를 강제한다.
 */

export interface SpecPresetItem {
  alias: string;
  description: string;
  html: string;
}

export interface SpecPreset {
  /** 등록될 네임스페이스 */
  namespace: string;
  /** 프리셋 용도 설명 (도구 응답에 노출) */
  summary: string;
  items: SpecPresetItem[];
}

/** annotation — 기획 설명용 주석 도구 (영역 강조 / 번호 마커 / 라벨 칩) */
const ANNOTATION_PRESET: SpecPreset = {
  namespace: 'anno',
  summary: '기획 주석 도구 — 영역 강조(region), 번호 마커(marker), 라벨 칩(label)',
  items: [
    {
      alias: 'region',
      description:
        '영역 강조 사각형 — 투명 배경 + 빨간 보더 + 좌상단 라벨 칩. ' +
        '설명할 영역 위에 width/height로 씌워 사용 (콘텐츠를 가리지 않음)',
      html: `<div style="display: flex; align-items: flex-start; width: 240px; height: 140px; border-width: 2px; border-color: #E53935; border-radius: 4px;">
  <div style="display: flex; padding: 2px 8px; background-color: #E53935; border-radius: 0 0 4px 0;">
    <span data-sigma-slot="label" data-sigma-desc="이 영역에 대한 설명 (짧게 — 길면 칩이 영역을 넘음)" style="font-size: 11px; font-weight: 600; color: #FFFFFF;">영역 설명</span>
  </div>
</div>`,
    },
    {
      alias: 'marker',
      description:
        '번호 마커 — 빨간 원형 배지 + 번호. 설명할 지점(프레임 안)에 놓고, ' +
        '번호별 설명은 범례(anno/label 또는 wire/note 목록)로 작성',
      html: `<div style="display: flex; justify-content: center; align-items: center; width: 24px; height: 24px; background-color: #E53935; border-radius: 12px;">
  <span data-sigma-slot="n" data-sigma-desc="마커 번호" style="font-size: 12px; font-weight: 700; color: #FFFFFF;">1</span>
</div>`,
    },
    {
      alias: 'label',
      description: '라벨 칩 — 진회색 배경의 짧은 텍스트 태그 (이름표/상태 표시용)',
      html: `<div style="display: flex; align-items: center; padding: 2px 8px; background-color: #37474F; border-radius: 3px;">
  <span data-sigma-slot="text" data-sigma-desc="라벨 텍스트" style="font-size: 11px; font-weight: 600; color: #FFFFFF;">LABEL</span>
</div>`,
    },
  ],
};

/** wireframe — 저충실 와이어프레임 프리미티브 (기획 화면 골격용) */
const WIREFRAME_PRESET: SpecPreset = {
  namespace: 'wire',
  summary: '와이어프레임 프리미티브 — placeholder 박스(box), 섹션 제목(section_title), 목록 행(item), 설정 행(kv), 주석 메모(note)',
  items: [
    {
      alias: 'box',
      description: '와이어프레임 placeholder 박스 — 회색 영역 + 중앙 라벨. width/height로 크기를 지정해 화면 영역을 표현',
      html: `<div style="display: flex; justify-content: center; align-items: center; width: 160px; height: 100px; background-color: #ECEFF1; border-width: 1px; border-color: #B0BEC5; border-radius: 4px;">
  <span data-sigma-slot="label" data-sigma-desc="이 영역이 의미하는 것" style="font-size: 12px; color: #607D8B;">영역</span>
</div>`,
    },
    {
      alias: 'section_title',
      description: '화면/섹션 제목 블록 — 제목 + 설명 한 줄',
      html: `<div style="display: flex; flex-direction: column; gap: 4px;">
  <span data-sigma-slot="title" data-sigma-desc="화면/섹션 이름" style="font-size: 18px; font-weight: 700; color: #263238;">Section</span>
  <span data-sigma-slot="desc" data-sigma-desc="이 화면/섹션이 하는 일 요약" style="font-size: 12px; color: #78909C;">설명</span>
</div>`,
    },
    {
      alias: 'item',
      description: '목록/사이드바 아이템 행 — 불릿 + 텍스트',
      html: `<div style="display: flex; align-items: center; gap: 8px; padding: 4px 8px;">
  <div style="display: flex; width: 6px; height: 6px; background-color: #90A4AE; border-radius: 3px;"></div>
  <span data-sigma-slot="text" data-sigma-desc="아이템 내용" style="font-size: 13px; color: #37474F;">항목</span>
</div>`,
    },
    {
      alias: 'kv',
      description: '설정/속성 행 — 키 + 값 (값이 길면 …처리)',
      html: `<div style="display: flex; justify-content: space-between; align-items: center; width: 320px; padding: 6px 8px; border-bottom-width: 1px; border-bottom-color: #ECEFF1;">
  <span data-sigma-slot="key" data-sigma-desc="설정/속성 이름" style="font-size: 13px; color: #37474F;">설정명</span>
  <span data-sigma-slot="value" data-sigma-desc="현재 값 또는 컨트롤 종류" style="font-size: 13px; color: #90A4AE; text-overflow: ellipsis;">값</span>
</div>`,
    },
    {
      alias: 'note',
      description: '기획 주석 메모 — 노란 배경, 긴 설명은 자동 줄바꿈. width로 폭 지정 권장',
      html: `<div style="display: flex; width: 260px; padding: 10px 12px; background-color: #FFF9C4; border-width: 1px; border-color: #F9A825; border-radius: 4px;">
  <span data-sigma-slot="note" data-sigma-desc="기획 의도/동작 설명" style="font-size: 12px; line-height: 17px; color: #5D4037; white-space: normal;">주석 내용</span>
</div>`,
    },
  ],
};

export const SPEC_PRESETS: Record<string, SpecPreset> = {
  annotation: ANNOTATION_PRESET,
  wireframe: WIREFRAME_PRESET,
};

export const SPEC_PRESET_NAMES = Object.keys(SPEC_PRESETS);
