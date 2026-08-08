# MCP 도구 레퍼런스

Sigma MCP 서버가 제공하는 129개 도구의 전체 목록입니다.

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
| `sigma_create_annotation_layer` | 섹션에 기획 레이어(주석 담는 투명 오버레이 프레임) 생성 + pluginData `role=annotation-layer` 태깅. lint `annotation_layer` 규칙과 연동(자동 면제·존재 강제). 스펙 아님(네이티브 프레임) | `token`, `sectionId` | `name` |
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
| `sigma_clone_node` | 노드 복제 (응답에 `childIdMap` = 원본자식id→복제자식id, 내부 하이퍼링크 경고) | `token`, `nodeId` | `parentId`, `position`, `name`, `includeChildIdMap`, `includeNames`, `childIdMapLimit`, `rewireInternalLinks` |
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

> `setRangeHyperlink` 는 `url`(외부 링크)과 `nodeId`(같은 파일 내 노드로 이동) 중 하나를 받는다. `nodeId` 링크는 fileKey 가 필요 없고, **편집 캔버스에서 그대로 클릭**된다(프로토타입 재생 모드 불필요). 둘 다 생략하면 해당 구간의 링크를 제거한다. 노드 쌍을 통째로 왕복 배선하려면 [`sigma_set_hyperlink`](#하이퍼링크-노드-간-상호-이동) 를 쓴다.

**Plugin Data:**
`setPluginData`, `getPluginData`, `getPluginDataKeys`, `setSharedPluginData`, `getSharedPluginData`

## Lint (빌트인 카탈로그 + 커스텀 규칙)

config 하나로 빌트인 규칙 24종(기본 ON 15종 = 기하 8 + 구조/이름/가시성 6 + occlusion 1, opt-in 9종)과
커스텀 규칙(JSON 선언적 / JS predicate)을 함께 검사·수정. Figma 파일마다 다른 config를 쓸 수 있도록
서버는 config를 저장하지 않고 매 호출 시 지정된 것을 그대로 읽는다.

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_lint` | config 기반 검사(read-only 기본) + 빌트인 안전수정(`apply:true`) | `token` | `config`, `configPath`, `scope`, `configMode`, `nodeId`, `path`, `apply`, `treeNodeLimit`, `treeTimeoutMs` |

- **base config 출처 3순위**: inline `config` 객체 > `configPath` 파일 > 문서 노드 저장값(`sigma_set_page_data`, `pageId:"document"`).
- **`scope`**: `page`(기본, 바인딩 1페이지, `apply` 지원) | `file`(전 페이지 순회, read-only, markdown 리포트 파일 + `reportPath` 반환).
- **`configMode`**: `merge`(기본, base + 페이지 override — `builtins`·`custom` 모두 rule id 단위) | `per-page`(페이지 저장 config) | `uniform`(base 하나로 일괄, **페이지 저장 config 무시**).
- **완전성**: 트리를 `treeNodeLimit`(기본 200000) 노드까지 전수 순회하고 `treeTimeoutMs`(기본 60000)로 끊는다. 상한에 걸리면 `scanTruncated`/`scannedNodes`/`scanWarning`을 싣고 `clean`을 false로 강제한다(부분 스캔을 clean으로 오보하지 않기 위함).

- **찾기 쉬움 2종(opt-in, 페이지 루트 전용)**: `content_spread`(본진에서 떨어진 이상치 노드 — zoom-to-fit을 망쳐 "내용을 못 찾는" 상태를 만듦, `maxGap` 기본 3000px) · `origin_anchor`(최상위 섹션 중 하나는 원점 `tolerance`(기본 100px) 이내에서 시작). `nodeId`/`path` 서브트리 검사에선 실행되지 않는다.

**빌트인 24종(파라미터·기본값 — opt-in 9종: `raw_node`·`annotation_layer`·`instance_default_name`·`content_spread`·`origin_anchor`·`instance_resized_from_spec`·`annotation_marker_pair`·`annotation_marker_gap`·`font_not_default`), JSON/predicate 커스텀 규칙 스키마,
`scope`/`configMode` 상세, `configPath`의 Docker 배포 주의사항, 복붙용 예제 config,
설계 근거는 [lint/](lint/) 참조 (룰 1개 = 파일 1개, 인덱스는 [lint/rules/](lint/rules/README.md)).**

## 조회/검색

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_find_node` | 경로/이름 검색(`paths`로 여러 경로 → nodeId 일괄 해석), 또는 `where`로 속성 조건 검색 | `token` | `path`, `paths`, `type`, `where`, `nodeId`, `limit` |
| `sigma_get_tree` | 문서 계층 구조 탐색 (`fields:"geometry"`=좌표 전용 축약) | `token` | `nodeId`, `path`, `depth`, `omit`(자르기), `keep`(남기기), `filter`(레거시), `limit`, `fields` |
| `sigma_get_node_info` | 노드 상세 정보 (TEXT 는 `hyperlinks` 포함 — 링크 배선 검증용) | `token`, `nodeId` | — |
| `sigma_get_nodes_info` | 여러 노드 상세 일괄 조회 | `token`, `nodeIds` | — |
| `sigma_get_document_info` | 문서 정보 (파일명, 페이지) | `token` | — |
| `sigma_get_styles` | 로컬 스타일 조회 | `token` | — |
| `sigma_get_selection` | 현재 선택 노드 | `token` | — |
| `sigma_set_selection` | 노드 선택 (화면 고정 — 뷰 이동은 `zoomToFit:true`) | `token`, `nodeIds` | `zoomToFit` |
| `sigma_get_viewport` | 뷰포트 정보 (center, zoom) | `token` | — |
| `sigma_set_viewport` | 뷰포트 설정 | `token` | `center`, `zoom`, `nodeIds` |
| `sigma_get_selection_details` | 선택 노드 상세 정보 | `token` | — |
| `sigma_scan_text_nodes` | 하위 텍스트 노드 스캔 | `token`, `nodeId` | — |
| `sigma_scan_nodes_by_types` | 하위 특정 타입 노드 스캔 | `token`, `nodeId`, `types` | — |
| `sigma_list_fonts` | 사용 가능 폰트 목록 | `token` | — |
| `sigma_get_css` | 노드의 CSS 속성 추출 | `token`, `nodeId` | — |

### sigma_get_tree 의 세 모드 — 전체 / 자르기(`omit`) / 남기기(`keep`)

| 모드 | 인자 | 동작 | 쓰임 |
|---|---|---|---|
| 전체 | (없음) | 전부 | 기본 |
| 자르기 | `omit.types` · `omit.namePattern` | 매칭 노드 + **그 서브트리** 제외 | SVG 산물 VECTOR 빼기, 인스턴스 내부 통째로 빼기 |
| 남기기 | `keep.types` · `keep.namePattern` | 매칭 노드를 남기고 **조상은 뼈대만**. 매칭 없는 가지는 제거 | 깊은 곳의 TEXT·마커를 계층째 보기 |

- 둘은 함께 쓸 수 있다 (`omit` 먼저 적용 → 남은 것에 `keep`).
- **`filter` 는 레거시다.** 이름과 달리 "거르기"가 아니라 매칭하지 **않는** 노드를 서브트리째
  잘라내는 화이트리스트 prune 이라, `filter.types:["TEXT"]` 가 오류 없이 0건이 된다
  (TEXT 의 부모가 먼저 잘림). 동작은 호환을 위해 그대로 뒀다.
- **`filter` 와 `omit`/`keep` 동시 지정은 거부**한다 — 조용히 한쪽을 무시하면
  "인자를 줬는데 아무 일도 안 일어남" 이 된다.
- `keep` 의 `totalCount` 는 **매칭 노드만** 세고, 뼈대는 `skeletonCount` 로 따로 온다.
  뼈대를 같이 세면 뼈대가 `limit` 을 먹어 `truncated` 가 거짓말을 한다.
- `keep` 은 **플러그인 순회 비용을 줄이지 않는다**(전부 돌아야 매칭을 안다). 줄어드는 것은
  전송량과 호출자 컨텍스트다.

배경: [`docs/history/008-get-tree-filter-was-a-prune.md`](history/008-get-tree-filter-was-a-prune.md)

### sigma_get_tree 의 `fields` — 좌표 전용 축약

| 값 | 노드마다 실리는 것 |
|----|-----------------|
| `all` (기본) | `id`·`name`·`type`·`boundingBox`·`childCount`·`children` + `fullPath` + `meta`(visible·locked·layoutMode·characters(최대 100자)·layoutSizing·description) |
| `geometry` | `id`·`name`·`type`·`boundingBox`·`childCount`·`children` + **`absolute`**. `fullPath`·`meta` 없음 |

위치 보정처럼 좌표만 필요한 작업에서 `meta.characters`·`fullPath`가 응답을 지배하는 걸 막는다.

**⚠️ 좌표계 — 두 좌표를 용도별로 나눠 쓴다:**
- `boundingBox`는 **직속 부모 로컬좌표**다(Figma의 모든 컨테이너가 자식 원점을 새로 잡는다 — 섹션도 동일).
  실제로 위치를 고칠 때(`sigma_modify_node`의 `move`/`resize`)는 이 좌표계로 값을 준다.
- `absolute: {x, y}`는 페이지 **절대좌표** 좌상단이다. 서로 다른 섹션·프레임에 든 노드끼리
  겹침·거리를 판단하려면 이 값이 필요하다(로컬좌표끼리는 비교 자체가 성립하지 않는다).

```jsonc
// 페이지 전체를 좌표만으로 조회 (위치 보정 작업의 기본 조회)
sigma_get_tree({ token, depth: "full", fields: "geometry" })
// → { id, name, type, boundingBox: {x,y,width,height}, absolute: {x,y}, childCount, children: [...] }
```

### sigma_find_node 의 `paths` — 여러 경로 → nodeId 일괄 해석

```
sigma_find_node({ token, paths: ["Design System/Buttons/Primary", "Screens/Home"] })
→ { results: [{path, nodeId, name, type}, {path, error}], resolved: 1, failed: 1 }
```

- 왕복 1회. 응답은 id 해석에 필요한 것만 싣는다(`path` 단일 모드처럼 노드 상세를 다 싣지 않는다).
- **부분 실패 허용** — 실패한 원소에 `path` 를 되울려 어느 경로가 실패했는지 알 수 있다.
- 다중 매칭은 첫 번째를 돌려주되 `matches` 개수를 함께 싣는다(조용히 고르지 않는다).
- ⚠️ **nodeId 를 스크립트에 손으로 옮겨 적지 말 것.** 세션이 바뀌면 무효고, 중간 실패 시
  재실행이 안 되며, 사람이 읽어도 무엇인지 모른다. 로컬 캐시도 답이 아니다 — 문서가 밖에서
  바뀐 것을 모르고 조용히 엉뚱한 노드를 고친다. 배경:
  [`docs/history/009-node-ids-were-copied-by-hand.md`](history/009-node-ids-were-copied-by-hand.md)

### sigma_find_node 의 `where` — 속성 조건 검색

`path`(경로로 하나 찾기)와 **상호배타**. `select`로 대상을 좁히고 `checks` 배열로 조건을 건다.

| 필드 | 의미 |
|------|------|
| `select.type` / `select.namePattern` | 노드 타입 / 이름 정규식 |
| `checks[]` | 조건 목록 — **모두 만족(AND)**. OR 은 호출을 나눈다 |
| `checks[].op` | `equals` · `range`(min/max) · `regex`(pattern) · `oneOf`(values) · `exists` — `sigma_lint` 커스텀 규칙과 동일한 5개 |
| `checks[].field` | 노드 필드 경로. `width`, `fills[0].opacity` 처럼 중첩 가능 |
| `nodeId` | 검색 시작 노드 (미지정 = 바인딩 페이지 전체) |
| `limit` | 반환 상한 (기본 200, 초과 시 `truncated: true`) |

```jsonc
// width 가 1000 넘는 노드 전부
sigma_find_node({ token, where: { checks: [{ op: "range", field: "width", min: 1000 }] } })

// 이름이 Card 로 시작하는 FRAME 중 높이 200~400
sigma_find_node({ token, where: {
  select: { type: "FRAME", namePattern: "^Card" },
  checks: [{ op: "range", field: "height", min: 200, max: 400 }],
} })
```

**비용**: `id·name·type·x·y·width·height·childCount·visible·locked` 만 쓰면 트리 조회 1회로 끝난다.
그 밖의 필드(`fills`·`opacity`·`cornerRadius`·`characters`·`fontSize`·`layoutMode`·`layoutSizing*`·
`strokes`·`strokeWeight`·`description`)를 쓰면 상세 조회 왕복이 1회 추가된다(응답 `enriched: true`).

**반환**: `{ matchCount, returned, truncated, enriched, nodes: [{ nodeId, name, type, x, y, width, height }] }`.
`nodeId` 들을 `sigma_batch_modify` / `sigma_batch_delete` 에 그대로 넘길 수 있다.

## 컴포넌트 스펙 (스펙 기반 컴포넌트)

엄격한 규칙의 HTML로 컴포넌트를 등록하고, alias + props만으로 인스턴스를 삽입하는 시스템.
**전체 규칙·근거는 [component-spec.md](component-spec.md) 참조.**

**파일별 등록 정책**: 문서 노드에 저장된 lint config의 `componentSpec.warn`(`aliasPattern`/`message`/`namespace?`)에
alias가 걸리면 등록·`overwrite` 갱신 응답에 `policyWarnings`가 실린다 — **경고만, 거부하지 않는다.**
설정은 `sigma_set_page_data({ pageId: "document", key: "lint", ... })`. `validateOnly` 경로는 파일을 특정할 수 없어 검사하지 않는다.
게이트는 sigma 도구 경로만 덮고 레지스트리는 서버 전역이라 다른 파일에서 등록하면 우회된다(실수 방지용).

**스펙 HTML 규칙 요약:**
- 단일 루트 요소, inline `style=""`만 허용 (`<style>` 블록·class 셀렉터 불가)
- 컨테이너(div/button)만 자식 보유 가능, 자식이 있으면 `display: flex` **명시 필수**.
  텍스트 태그(span/p/h1~h6 등)는 leaf 전용
- CSS는 속성 화이트리스트 + **값 검증** 통과 필요:
  길이는 **px만**(%, rem, em, calc, var 거부), 색상은 단색만(gradient 거부),
  enum 속성은 지원 값만(`display: flex`, `justify-content: space-between` 등)
- `position`·`text-align` 불가 — 배치·정렬은 Auto Layout(flex) 속성으로만
- `<img src>`는 **base64 data URI만** — 원격 URL·상대 경로는 등록 거부(Figma가 네트워크로 못 가져와 빈 프레임이 됨).
  본문이 커지므로 이런 스펙은 `html` 대신 `htmlPath`(파일 경로)로 넘긴다
- 텍스트 파라미터: `<span data-sigma-slot="이름">기본값</span>` — 텍스트 태그에만, 순수 텍스트 속성만 허용
- 위반 시 조용히 근사하지 않고 위반 목록과 함께 등록 거부

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_create_component_spec` | 스펙 HTML로 컴포넌트 등록 | `token`, `alias`, `description` + (`html` 또는 `htmlPath`) | `htmlPath`(파일에서 HTML 읽기 — 본문이 큰 스펙용, `html`과 상호배타), `namespace`, `position`, `overwrite`(in-place 갱신→인스턴스 전파), `validateOnly`(토큰 불필요 dry-run) |
| `sigma_list_component_specs` | 스펙 카탈로그 (alias 지정 시 상세) | — | `alias`, `namespace` |
| `sigma_create_component_spec_instance` | alias + props로 인스턴스 생성 (넘침 시 warnings). 여러 개는 `instances` 배열 | `token` | `alias` 또는 `instances`(상호배타), `namespace`, `props`, `x`, `y`, `width`, `height`, `parentId` |
| `sigma_set_component_spec_instance_props` | 기존 인스턴스의 param 재설정 | `token`, `nodeId`, `props` | — |
| `sigma_import_spec_preset` | 내장 프리셋 등록 (annotation: anno/4종, wireframe: wire/5종) | `token`, `preset` | `overwrite` |
| `sigma_delete_component_spec` | 레지스트리에서 스펙 삭제 (바인딩된 파일 소유만, 남은 인스턴스 있으면 거부) | `token`, `alias` | `namespace`, `deleteNode`, `allowCrossFile`, `force` |

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
| `sigma_get_instance_overrides` | 인스턴스 오버라이드 조회 | `token`, `nodeId` | — |
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
| `sigma_get_annotations` | 주석 목록 | `token`, `nodeId` | — |
| `sigma_set_annotation` | 주석 추가 | `token`, `nodeId`, `label` | `labelType` |
| `sigma_set_multiple_annotations` | 주석 일괄 추가 | `token`, `items` | — |

## 프로토타이핑

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_reactions` | 인터랙션 목록 | `token`, `nodeId` | — |
| `sigma_add_reaction` | 인터랙션 추가 | `token`, `nodeId`, `trigger`, `action` | `destinationId`, `url`, `transition`, `preserveScrollPosition` |
| `sigma_delete_reactions` | 인터랙션 제거 | `token`, `nodeId` | `triggerType` |

**trigger 종류:** `ON_CLICK`, `ON_HOVER`, `ON_PRESS`, `ON_DRAG`, `MOUSE_ENTER`, `MOUSE_LEAVE`, `AFTER_TIMEOUT`

**action 종류:** `NAVIGATE`(이동), `OVERLAY`(팝업), `BACK`(뒤로), `CLOSE`(닫기), `OPEN_URL`(외부 링크), `SCROLL_TO`(스크롤), `SWAP`(교체)

## 하이퍼링크 (노드 간 상호 이동)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_set_hyperlink` | 노드 쌍이 서로를 가리키는 링크 배선 (누르면 상대 노드로 뷰 이동) | `token`, `links` | `direction`, `slot`, `remove` |

**프로토타이핑과의 차이**: reaction 은 재생 모드에서만 동작하지만, 이 링크는 **편집 캔버스에서 그대로 클릭**된다. 기획 주석 마커 ↔ 범례처럼 "번호를 누르면 설명과 화면을 오가는" 문서형 이동에 맞다. 같은 파일 안이므로 fileKey 없이 노드 ID 만으로 동작한다.

**대상 텍스트를 slot 으로 찾는다**: 하이퍼링크는 TEXT 노드에만 걸리는데, 실제로 지정하는 건 `anno/marker` 같은 **인스턴스**다. 스펙 등록 시 심어둔 slot 표시(pluginData `sigma-slot`)로 어느 텍스트에 걸지 정하므로 이름 규약이 생기지 않고, 텍스트가 여럿인 스펙(`anno/legend` = 번호 `n` + 설명 `desc`)에서도 정확히 번호만 집는다. 순서에 의존하는 "첫 번째 TEXT" 방식과 다른 점이다.

대상 결정 순서:
1. TEXT 노드면 그대로
2. `slot`(기본 `"n"`)이 일치하는 하위 TEXT
3. 하위 TEXT 가 정확히 하나면 그것
4. 그 밖(후보 0개 또는 2개 이상)은 모호하므로 에러 — 사용 가능한 slot 목록을 함께 알린다

**`direction`**: `both`(기본, 왕복) / `a_to_b` / `b_to_a`. 뷰포트 이동에는 뒤로가기가 없으므로 왕복하려면 양쪽에 다 걸어야 한다.

**부분 실패 허용**: 한 쌍이 실패해도 나머지 쌍은 진행한다. 응답 `results[].error` 로 확인한다. 단 한 쌍 안에서는 양쪽 텍스트 해석이 모두 성공해야 걸린다(반쪽 배선 방지).

**배선 확인**: 응답의 `aTextId`/`bTextId` 를 `sigma_get_node_info`(또는 배치로 `sigma_get_nodes_info`)로 조회하면 TEXT 노드의 `hyperlinks` 필드(`[{start, end, type, value}]`)로 나온다.

```
sigma_set_hyperlink({ links: [{ a: "182:125455", b: "182:125485" }, { a: "182:125457", b: "182:125489" }] })
sigma_set_hyperlink({ links: [...], remove: true })   // 해제
```

외부 URL 링크나 문자열 일부에만 거는 부분 링크는 `sigma_modify_node` 의 `setRangeHyperlink` 를 쓴다.

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
**문서(`pageId:"document"`)에 저장한 경우** 같은 JSON의 `componentSpec.warn`이 그 파일의 **컴포넌트 스펙 등록 정책**으로도 쓰인다
(alias가 패턴에 걸리면 `sigma_create_component_spec` 응답에 `policyWarnings` — 경고만, 등록은 진행). 아래 §컴포넌트 스펙 참조.

예약 key **`"fonts"`**(문서 전용)는 그 파일의 **기본 폰트**다 — 예: `'{"default":"Pretendard"}'`.
`font-family`를 지정하지 않은 HTML/스펙 텍스트와, `fontFamily`를 생략한 `sigma_create_text`/`sigma_create_text_style`이 이 폰트로 만들어진다.
미설정이면 Inter(Figma 기본)다. 설정한 폰트가 실행 환경에 없으면 Inter로 폴백한다.

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
