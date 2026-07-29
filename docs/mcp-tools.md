# MCP 도구 레퍼런스

Sigma MCP 서버가 제공하는 128개 도구의 전체 목록입니다.

## 사용 흐름

모든 Figma 조작 도구는 토큰이 필요합니다. 기본 흐름:

```
sigma_login → sigma_list_plugins → sigma_bind → [작업 도구들] → sigma_logout
```

토큰은 10분 후 만료되며, 사용할 때마다 자동 갱신됩니다.

---

## 인증

| 도구 | 설명 | 필수 인자 |
|------|------|-----------|
| `sigma_login` | 토큰 발급 (10분 유효) | — |
| `sigma_logout` | 토큰 삭제 | `token` |
| `sigma_bind` | 토큰을 Plugin+페이지에 바인딩 | `token`, `pluginId`, `pageId` |
| `sigma_status` | 토큰 상태/바인딩 정보 확인 | `token` |

## 플러그인/페이지 정보

| 도구 | 설명 | 필수 인자 |
|------|------|-----------|
| `sigma_list_plugins` | 연결된 Figma Plugin 목록 | — |
| `sigma_list_pages` | Plugin의 페이지 목록 | `pluginId` |

## 노드 생성

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_create_frame` | ExtractedNode JSON/HTML로 프레임 생성 | `token` | `data`, `html`, `format`, `name`, `position` |
| `sigma_import_saved` | 서버 저장 데이터로 프레임 생성 | `token`, `id` | `name`, `position` |
| `sigma_create_rectangle` | 사각형 | `token`, `x`, `y`, `width`, `height` | `name`, `fillColor`, `strokeColor`, `strokeWeight`, `cornerRadius`, `parentId` |
| `sigma_create_text` | 텍스트 (폰트 자동 로드) | `token`, `x`, `y`, `text` | `name`, `fontSize`, `fontFamily`, `fontWeight`, `fontColor`, `textAlignHorizontal`, `parentId` |
| `sigma_create_empty_frame` | 빈 프레임 (Auto Layout) | `token`, `x`, `y`, `width`, `height` | `name`, `layoutMode`, `padding*`, `itemSpacing`, `fillColor`, `cornerRadius`, `layoutWrap`, `counterAxisSpacing`, `layoutSizing*`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `parentId` |
| `sigma_create_section` | Section | `token`, `name` | `position`, `size`, `children`, `fills` |
| `sigma_create_component_instance` | 컴포넌트 인스턴스 (로컬/라이브러리) | `token`, `componentKey`, `x`, `y` | `parentId` |
| `sigma_create_ellipse` | 타원/원 | `token`, `x`, `y`, `width`, `height` | `name`, `fillColor`, `strokeColor`, `strokeWeight`, `arcData`, `parentId` |
| `sigma_create_polygon` | 다각형 | `token`, `x`, `y`, `width`, `height` | `name`, `pointCount`, `fillColor`, `strokeColor`, `strokeWeight`, `parentId` |
| `sigma_create_star` | 별 | `token`, `x`, `y`, `width`, `height` | `name`, `pointCount`, `innerRadius`, `fillColor`, `strokeColor`, `strokeWeight`, `parentId` |
| `sigma_create_line` | 선 | `token`, `x`, `y`, `length` | `name`, `strokeColor`, `strokeWeight`, `rotation`, `parentId` |
| `sigma_create_vector` | 벡터 (SVG path) | `token`, `x`, `y`, `width`, `height` | `name`, `fillColor`, `strokeColor`, `strokeWeight`, `vectorPaths`, `parentId` |
| `sigma_create_image` | 이미지 (base64) | `token`, `x`, `y`, `width`, `height`, `imageData` | `name`, `parentId`, `scaleMode`, `cornerRadius` |
| `sigma_create_node_from_svg` | SVG 문자열 → Figma 노드 | `token`, `svgString` | `x`, `y`, `name`, `parentId` |
| `sigma_create_component` | 컴포넌트 노드 | `token`, `x`, `y`, `width`, `height` | `name`, `parentId` |
| `sigma_create_sticky` | 스티키 노트 (FigJam) | `token` | `text`, `x`, `y`, `parentId` |
| `sigma_create_connector` | 연결선 (FigJam) | `token`, `startNodeId`, `endNodeId` | `strokeColor`, `strokeWeight` |

## 노드 조작

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_modify_node` | 노드에 메서드 실행 (73개) | `token`, `nodeId`, `method` | `args` |
| `sigma_batch_modify` | 여러 노드에 modify 일괄 실행 | `token`, `operations` | — |
| `sigma_update_frame` | 프레임 내용 전체 교체 | `token`, `nodeId` | `data`, `format`, `name` |
| `sigma_delete_frame` | 프레임 삭제 | `token`, `nodeId` | — |
| `sigma_batch_delete` | 여러 노드 일괄 삭제 | `token`, `nodeIds` | — |
| `sigma_move_node` | 다른 부모로 이동 (reparent). 원점 성격이 다른 부모(섹션↔프레임)로 옮겨 절대 위치가 튀면 응답에 `coordinateShift`(복원용 `restoreLocal` 좌표) 포함 | `token`, `nodeId`, `parentId` | `index` |
| `sigma_clone_node` | 노드 복제 | `token`, `nodeId` | `parentId`, `position`, `name` |
| `sigma_set_multiple_text_contents` | 여러 텍스트 일괄 변경 | `token`, `items` | — |
| `sigma_group_nodes` | 그룹으로 묶기 | `token`, `nodeIds` | `name` |
| `sigma_ungroup` | 그룹 해제 | `token`, `nodeId` | — |
| `sigma_flatten` | 벡터로 평탄화 | `token`, `nodeIds` | `name` |
| `sigma_boolean_operation` | Boolean 연산 | `token`, `nodeIds`, `operation` | `name` |

### sigma_modify_node 메서드 목록 (73개)

`sigma_modify_node`는 `method` 인자로 아래 메서드를 호출합니다.

**Basic:**
`rename`, `resize`, `move`, `setOpacity`, `setVisible`, `setLocked`, `remove`

**Visual:**
`setFills`, `setSolidFill`, `setStrokes`, `setStrokeWeight`, `setCornerRadius`, `setCornerRadii`, `setEffects`, `setBlendMode`, `setCornerSmoothing`, `setDashPattern`, `setMask`, `setGradientFill`, `setImageFill`

**Stroke Advanced:**
`setStrokeAlign`, `setStrokeCap`, `setStrokeJoin`, `setIndividualStrokeWeights`

**Transform:**
`setRotation`

**Layout (Frame):**
`setLayoutMode`, `setPadding`, `setItemSpacing`, `setClipsContent`, `setPrimaryAxisSizingMode`, `setCounterAxisSizingMode`, `setPrimaryAxisAlignItems`, `setCounterAxisAlignItems`, `setLayoutWrap`, `setCounterAxisSpacing`, `setLayoutSizing`, `setOverflowDirection`

**Layout (Child):**
`setLayoutAlign`, `setLayoutGrow`, `setLayoutPositioning`

**Constraints:**
`setConstraints`, `setMinWidth`, `setMaxWidth`, `setMinHeight`, `setMaxHeight`

**Text:**
`setCharacters`, `setFontSize`, `setTextAlignHorizontal`, `setTextAlignVertical`, `setFontFamily`, `setFontWeight`, `setTextAutoResize`, `setLineHeight`, `setLetterSpacing`, `setParagraphSpacing`, `setParagraphIndent`, `setTextCase`, `setTextTruncation`, `setMaxLines`

**Rich Text (Range):**
`setRangeFontSize`, `setRangeFontName`, `setRangeFills`, `setRangeTextDecoration`, `setRangeLineHeight`, `setRangeLetterSpacing`, `setRangeHyperlink`, `setRangeListOptions`, `setRangeIndentation`

**Plugin Data:**
`setPluginData`, `getPluginData`, `getPluginDataKeys`, `setSharedPluginData`, `getSharedPluginData`

## Lint (빌트인 카탈로그 + 커스텀 규칙)

config 하나로 빌트인 규칙(기하 8종 + 구조/이름/가시성 6종 + occlusion 1종 + 컴포넌트 강제 1종)과
커스텀 규칙(JSON 선언적 / JS predicate)을 함께 검사·수정. Figma 파일마다 다른 config를 쓸 수 있도록
서버는 config를 저장하지 않고 매 호출 시 지정된 것을 그대로 읽는다.

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_lint` | config 기반 검사(read-only 기본) + 빌트인 안전수정(`apply:true`) | `token` | `config`, `configPath`, `scope`, `configMode`, `nodeId`, `path`, `apply` |

- **base config 출처 3순위**: inline `config` 객체 > `configPath` 파일 > 문서 노드 저장값(`sigma_set_page_data`, `pageId:"document"`).
- **`scope`**: `page`(기본, 바인딩 1페이지, `apply` 지원) | `file`(전 페이지 순회, read-only, markdown 리포트 파일 + `reportPath` 반환).
- **`configMode`**: `uniform`(기본, base 하나로 일괄) | `per-page`(페이지 저장 config) | `merge`(base + 페이지 override).

**빌트인 16종(파라미터·기본값 — `raw_node`만 opt-in), JSON/predicate 커스텀 규칙 스키마,
`scope`/`configMode` 상세, `configPath`의 Docker 배포 주의사항, 복붙용 예제 config,
설계 근거는 [lint.md](lint.md) 참조.**

## 조회/검색

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_frames` | 페이지 모든 프레임 위치/크기 | `token` | — |
| `sigma_find_node` | 경로/이름으로 노드 검색 | `token`, `path` | `type` |
| `sigma_get_tree` | 문서 계층 구조 탐색 | `token` | `nodeId`, `path`, `depth`, `filter`, `limit` |
| `sigma_get_node_info` | 노드 상세 정보 | `token`, `nodeId` | — |
| `sigma_get_nodes_info` | 여러 노드 상세 일괄 조회 | `token`, `nodeIds` | — |
| `sigma_get_document_info` | 문서 정보 (파일명, 페이지) | `token` | — |
| `sigma_get_styles` | 로컬 스타일 조회 | `token` | — |
| `sigma_get_selection` | 현재 선택 노드 | `token` | — |
| `sigma_set_selection` | 노드 선택 + 뷰포트 이동 | `token`, `nodeIds` | `zoomToFit` |
| `sigma_get_viewport` | 뷰포트 정보 (center, zoom) | `token` | — |
| `sigma_set_viewport` | 뷰포트 설정 | `token` | `center`, `zoom`, `nodeIds` |
| `sigma_get_selection_details` | 선택 노드 상세 정보 | `token` | — |
| `sigma_scan_text_nodes` | 하위 텍스트 노드 스캔 | `token`, `nodeId` | — |
| `sigma_scan_nodes_by_types` | 하위 특정 타입 노드 스캔 | `token`, `nodeId`, `types` | — |
| `sigma_list_fonts` | 사용 가능 폰트 목록 | `token` | — |
| `sigma_get_css` | 노드의 CSS 속성 추출 | `token`, `nodeId` | — |

## 컴포넌트 스펙 (스펙 기반 컴포넌트)

엄격한 규칙의 HTML로 컴포넌트를 등록하고, alias + props만으로 인스턴스를 삽입하는 시스템.
**전체 규칙·근거는 [component-spec.md](component-spec.md) 참조.**

**스펙 HTML 규칙 요약:**
- 단일 루트 요소, inline `style=""`만 허용 (`<style>` 블록·class 셀렉터 불가)
- 컨테이너(div/button)만 자식 보유 가능, 자식이 있으면 `display: flex` **명시 필수**.
  텍스트 태그(span/p/h1~h6 등)는 leaf 전용
- CSS는 속성 화이트리스트 + **값 검증** 통과 필요:
  길이는 **px만**(%, rem, em, calc, var 거부), 색상은 단색만(gradient 거부),
  enum 속성은 지원 값만(`display: flex`, `justify-content: space-between` 등)
- `position`·`text-align` 불가 — 배치·정렬은 Auto Layout(flex) 속성으로만
- 텍스트 파라미터: `<span data-sigma-slot="이름">기본값</span>` — 텍스트 태그에만, 순수 텍스트 속성만 허용
- 위반 시 조용히 근사하지 않고 위반 목록과 함께 등록 거부

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_create_component_spec` | 스펙 HTML로 컴포넌트 등록 | `token`, `alias`, `description`, `html` | `namespace`, `position`, `overwrite`(in-place 갱신→인스턴스 전파), `validateOnly`(토큰 불필요 dry-run) |
| `sigma_list_component_specs` | 스펙 카탈로그 (alias 지정 시 상세) | — | `alias`, `namespace` |
| `sigma_create_component_spec_instance` | alias + props로 인스턴스 생성 (넘침 시 warnings) | `token`, `alias` | `namespace`, `props`, `x`, `y`, `width`, `height`, `parentId` |
| `sigma_set_component_spec_instance_props` | 기존 인스턴스의 param 재설정 | `token`, `nodeId`, `props` | — |
| `sigma_import_spec_preset` | 내장 프리셋 등록 (annotation: anno/4종, wireframe: wire/5종) | `token`, `preset` | `overwrite` |
| `sigma_delete_component_spec` | 레지스트리에서 스펙 삭제 | `alias` | `namespace` |

```
등록: sigma_create_component_spec(token, alias: "ui_badge", description: "상태 뱃지",
      html: '<div style="display: flex; padding: 2px 8px; background-color: #E3F2FD; border-radius: 10px;">
               <span data-sigma-slot="text" style="font-size: 12px; color: #1565C0;">Badge</span></div>')
사용: sigma_create_component_spec_instance(token, alias: "ui_badge", props: {text: "완료"}, x: 100, y: 100)
```

## 컴포넌트

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_local_components` | 로컬 컴포넌트 목록 | `token` | — |
| `sigma_get_instance_overrides` | 인스턴스 오버라이드 조회 | `token` | `nodeId` |
| `sigma_set_instance_overrides` | 인스턴스 오버라이드 설정 | `token`, `nodeId`, `overrides` | — |
| `sigma_convert_to_component` | 프레임 → 컴포넌트 변환 | `token`, `nodeId` | — |
| `sigma_create_component_set` | Variants 세트 결합 | `token`, `componentIds` | `name` |
| `sigma_add_component_property` | 컴포넌트 속성 추가 | `token`, `nodeId`, `propertyName`, `propertyType`, `defaultValue` | — |
| `sigma_edit_component_property` | 컴포넌트 속성 수정 | `token`, `nodeId`, `propertyName`, `newValues` | — |
| `sigma_delete_component_property` | 컴포넌트 속성 삭제 | `token`, `nodeId`, `propertyName` | — |
| `sigma_get_component_properties` | 컴포넌트 속성 정의 조회 | `token`, `nodeId` | — |
| `sigma_detach_instance` | 인스턴스 → 프레임 분리 | `token`, `nodeId` | — |
| `sigma_swap_component` | 인스턴스 컴포넌트 교체 | `token`, `nodeId`, `newComponentKey` | — |

## 주석

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_annotations` | 주석 목록 | `token` | `nodeId` |
| `sigma_set_annotation` | 주석 추가 | `token`, `nodeId`, `label` | `labelType` |
| `sigma_set_multiple_annotations` | 주석 일괄 추가 | `token`, `items` | — |

## 프로토타이핑

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_reactions` | 인터랙션 목록 | `token` | `nodeId` |
| `sigma_add_reaction` | 인터랙션 추가 | `token`, `nodeId`, `trigger`, `action` | `destinationId`, `url`, `transition`, `preserveScrollPosition` |
| `sigma_delete_reactions` | 인터랙션 제거 | `token`, `nodeId` | `triggerType` |

**trigger 종류:** `ON_CLICK`, `ON_HOVER`, `ON_PRESS`, `ON_DRAG`, `MOUSE_ENTER`, `MOUSE_LEAVE`, `AFTER_TIMEOUT`

**action 종류:** `NAVIGATE`(이동), `OVERLAY`(팝업), `BACK`(뒤로), `CLOSE`(닫기), `OPEN_URL`(외부 링크), `SCROLL_TO`(스크롤), `SWAP`(교체)

## 이미지/추출

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_screenshot` | 노드 캡처 → 파일 저장 | `token`, `nodeId` | `format`, `scale`, `filename` |
| `sigma_extract_node` | Figma 노드 → JSON/HTML 추출 | `token`, `nodeId` | `format` |
| `sigma_test_roundtrip` | 추출 → 재생성 라운드트립 테스트 | `token`, `nodeId` | `format` |

## 페이지 관리

| 도구 | 설명 | 필수 인자 |
|------|------|-----------|
| `sigma_create_page` | 새 페이지 생성 | `token`, `name` |
| `sigma_rename_page` | 페이지 이름 변경 | `token`, `pageId`, `name` |
| `sigma_switch_page` | 페이지 전환 | `token`, `pageId` |
| `sigma_delete_page` | 페이지 삭제 (마지막 불가) | `token`, `pageId` |
| `sigma_reorder_page` | 페이지 순서 변경 | `token`, `pageId`, `index` |

### 페이지/문서 메타데이터

PAGE/DOCUMENT 노드는 `sigma_modify_node` 가드로 막혀 있어 전용 도구로만 다룬다.
저장소는 해당 노드의 `sharedPluginData`(namespace 고정 `"sigma"`)이며 `.fig` 파일에 영속된다.
`key`는 `^[a-zA-Z0-9_.-]+$`, `value`는 유효한 JSON 문자열이어야 한다.
`pageId`는 미지정=바인딩 페이지 / 페이지 ID / `"document"`(문서 루트).
예약 key `"lint"`는 그 페이지(또는 문서)의 LintConfig로, `sigma_lint`의 `per-page`/`merge` 모드가 참조한다.

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_set_page_data` | 페이지/문서 노드에 메타데이터 저장 | `token`, `key`, `value` | `pageId` |
| `sigma_get_page_data` | 저장된 메타데이터 조회 (`key` 미지정 시 전체 맵) | `token` | `key`, `pageId` |
| `sigma_delete_page_data` | 메타데이터 키 삭제 | `token`, `key` | `pageId` |

### 노드 메타데이터

일반 노드(scene node)의 sigma 메타데이터. 저장소·형식 규칙은 페이지 메타데이터와 같다.
예약 key **`"lint-ignore"`** = 그 노드에서만 lint 룰을 억제(inline suppress, `eslint-disable` 대응).
`sigma_lint`는 위반이 난 노드만 이 값을 배치 조회해 억제된 위반을 걸러내고, 응답/리포트에 `suppressed` 건수를 표기한다.

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_set_node_data` | 노드에 메타데이터 저장 (예약 key `"lint-ignore"`) | `token`, `nodeId`, `key`, `value` | — |
| `sigma_get_node_data` | 노드 메타데이터 조회 (`key` 미지정 시 전체 맵) | `token`, `nodeId` | `key` |
| `sigma_delete_node_data` | 노드 메타데이터 키 삭제 | `token`, `nodeId`, `key` | — |

## 스타일

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_create_paint_style` | Paint 스타일 생성 | `token`, `name`, `paints` | `description` |
| `sigma_create_text_style` | Text 스타일 생성 | `token`, `name` | `fontSize`, `fontFamily`, `fontWeight`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration`, `description` |
| `sigma_create_effect_style` | Effect 스타일 생성 | `token`, `name`, `effects` | `description` |
| `sigma_create_grid_style` | Grid 스타일 생성 | `token`, `name`, `grids` | `description` |
| `sigma_apply_style` | 노드에 스타일 적용 | `token`, `nodeId`, `styleType`, `styleId` | — |
| `sigma_delete_style` | 스타일 삭제 | `token`, `styleId` | — |

## 변수

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_create_variable_collection` | 변수 컬렉션 생성 | `token`, `name` | — |
| `sigma_create_variable` | 변수 생성 | `token`, `name`, `collectionId`, `resolvedType` | — |
| `sigma_get_variables` | 로컬 변수/컬렉션 조회 | `token` | `type` |
| `sigma_set_variable_value` | 모드별 값 설정 | `token`, `variableId`, `modeId`, `value` | — |
| `sigma_bind_variable` | 노드 속성에 변수 바인딩 | `token`, `nodeId`, `field`, `variableId` | — |
| `sigma_add_variable_mode` | 컬렉션에 모드 추가 | `token`, `collectionId`, `name` | — |
| `sigma_set_variable_scopes` | 변수 사용 범위 설정 | `token`, `variableId`, `scopes` | — |
| `sigma_set_variable_alias` | 변수 alias 설정 | `token`, `variableId`, `modeId`, `aliasTargetId` | — |
| `sigma_set_variable_code_syntax` | 변수 코드 구문 설정 | `token`, `variableId`, `platform`, `syntax` | — |
| `sigma_rename_variable` | 변수 이름 변경 | `token`, `variableId`, `name` | — |
| `sigma_delete_variable` | 변수 삭제 | `token`, `variableId` | — |

**resolvedType:** `COLOR`, `FLOAT`, `STRING`, `BOOLEAN`

## Team Library

| 도구 | 설명 | 필수 인자 |
|------|------|-----------|
| `sigma_list_libraries` | Team Library 목록 | `token` |
| `sigma_list_library_components` | 라이브러리 컴포넌트 목록 | `token`, `libraryKey` |
| `sigma_list_library_variables` | 라이브러리 변수 컬렉션 | `token`, `collectionKey` |
| `sigma_import_library_component` | 라이브러리 컴포넌트 임포트 | `token`, `key` |
| `sigma_import_library_style` | 라이브러리 스타일 임포트 | `token`, `key` |

## 유틸리티 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_notify` | Figma UI에 알림 표시 | `token`, `message` | `options` |
| `sigma_commit_undo` | Undo 체크포인트 생성 | `token` | — |
| `sigma_trigger_undo` | Undo 실행 | `token` | — |
| `sigma_save_version` | 버전 히스토리에 저장 | `token`, `title` | `description` |
| `sigma_set_export_settings` | Export 설정 지정 | `token`, `nodeId`, `settings` | — |
| `sigma_get_export_settings` | Export 설정 조회 | `token`, `nodeId` | — |

## 데이터 저장/관리 (토큰 불필요)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_save_extracted` | 추출 데이터 저장 | `name`, `data` | — |
| `sigma_list_saved` | 저장된 컴포넌트 목록 | — | — |
| `sigma_load_extracted` | 저장된 컴포넌트 로드 | `id` 또는 `name` | — |
| `sigma_delete_extracted` | 저장된 컴포넌트 삭제 | `id` | — |
| `sigma_save_and_import` | 저장 + 즉시 Figma 임포트 | `token`, `name` | `data`, `html`, `format` |

## 스크립트/상태

| 도구 | 설명 |
|------|------|
| `sigma_get_playwright_scripts` | 임베드 스크립트 경로 + API 정보 |
| `sigma_storage_stats` | 스토리지 용량 현황 |
| `sigma_cleanup` | 스토리지 일괄 정리 (`extracted`/`screenshots`/`reports`/`all`) |
| `sigma_list_screenshots` | 저장된 스크린샷 목록 |
| `sigma_delete_screenshot` | 스크린샷 삭제 |
| `sigma_server_status` | 서버 전체 상태 |
