# 컴포넌트 스펙 (Component Spec) — HTML 기반 컴포넌트 정의

엄격한 규칙의 HTML로 Figma 컴포넌트를 등록하고, 에이전트가 Figma 내부를 탐색하지 않고
`alias + props`만으로 인스턴스를 삽입하는 시스템.

```
검증:  sigma_create_component_spec(alias, description, html, validateOnly: true)
       → Figma 연결·토큰 없이 규칙 검증만 (사전 점검 dry-run)
등록:  sigma_create_component_spec(token, alias, description, html, namespace?, overwrite?)
조회:  sigma_list_component_specs(namespace?)  → alias/설명/params/size/sizing (카탈로그)
       sigma_list_component_specs(alias)       → HTML 원문 포함 상세
사용:  sigma_create_component_spec_instance(token, alias, props, x, y, parentId, namespace?, width?, height?)
       → width/height: 생성 직후 resize (hug 축은 FIXED로 전환 — placeholder 용도)
수정:  sigma_set_component_spec_instance_props(token, nodeId, props)
       → 기존 인스턴스의 param 재설정 (삭제 후 재생성 불필요, 넘침 시 warnings)
삭제:  sigma_delete_component_spec(alias, namespace?) → 레지스트리만 삭제 (Figma 노드 유지)
```

## 핵심 동작

- **네임스페이스**: 유일성 키는 `(namespace, alias)`. 같은 역할·다른 스타일 체계
  (기획 `plan` vs 디자인 `design`, 페이지별 테마)를 네임스페이스로 구분한다.
  미지정 시 `default`. use 시 alias가 여러 네임스페이스에 있으면 명시를 요구한다.
- **overwrite = in-place 갱신**: 기존 ComponentNode의 내용을 교체하므로 nodeId가
  유지되고 **기존 인스턴스에 자동 전파**된다. TEXT 속성은 이름으로 매칭해 재사용하므로
  인스턴스의 props 오버라이드도 유지된다. (노드가 삭제된 경우에만 신규 빌드로 폴백)
- **파일 스코프**: 등록 시 파일 ID(`figma.root` pluginData `sigma-file-id`, 최초 1회
  발급)를 레코드에 기록하고, use 시 현재 파일과 대조한다. 다른 파일에서 등록된
  컴포넌트를 쓰려 하면 출처 파일명을 알려주며 거부한다.
- **size / sizing**: 카탈로그의 `size`는 기본 상태 크기, `sizing`은 축별 동작 —
  `hug`(내용에 따라 늘어남, 뱃지처럼) / `fixed`(스펙에 width/height 명시, 인풋처럼).
  스펙 루트의 크기 명시 여부에서 유도된다.
- **넘침 경고**: fixed 축 컴포넌트에 긴 props를 넣어 텍스트가 컴포넌트 영역을
  벗어나거나(가로 삐져나옴), 줄바꿈으로 인스턴스 높이가 기본의 1.5배를 넘으면
  use 응답에 `warnings`로 알려준다 (조용한 삐져나옴·변형 방지). hug 축은 컴포넌트가
  함께 늘어나므로 검사하지 않는다.
- **외부 에이전트 온보딩**: 규칙 전문이 `sigma_create_component_spec` 도구 설명에
  요약돼 있고, 빈 카탈로그 조회 시 `specRules`로 안내되며, `validateOnly: true`로
  등록 없이 사전 검증할 수 있다 — 이 저장소의 문서 없이도 MCP만으로 사용 가능.

## 설계 원칙

1. **스펙 언어는 HTML+CSS의 엄격한 부분집합** — 새 언어를 발명하지 않는다.
   에이전트(LLM)는 HTML/CSS에 이미 유창하므로 학습 비용이 0이다.
2. **화이트리스트 + 값 검증** — 변환기가 Figma로 손실 없이 옮길 수 있다고 보장된
   속성·값만 통과시킨다. 벗어나면 **조용히 근사하지 않고 등록을 거부**하며
   위반 항목 전체를 나열한다.
3. **계약의 이중 저장** — 서버 레지스트리(`~/.sigma/component-specs/`)가 카탈로그,
   Figma 컴포넌트 노드의 pluginData(`sigma-spec`)가 파일 내장 진실.
   사용 시 검증에 실패하면 명시적 "계약 위반" 에러를 낸다
   (컴포넌트가 삭제된 limbo 상태 포함).

## 스펙 HTML 규칙

### 구조

| 규칙 | 설명 |
|------|------|
| 단일 루트 | 루트 요소는 1개. 루트가 컴포넌트 프레임이 된다 |
| inline style만 | `<style>` 블록·class 셀렉터 불가 (variant 단계에서 확장 예정) |
| 컨테이너 태그 | `div`, `button`만 자식 요소 보유 가능. **자식이 있으면 `display: flex` 명시 필수** (암시적 블록 배치 불가) |
| 텍스트 태그 | `span, p, h1~h6, a, strong, em, b, i` — **leaf 전용** (자식 요소 금지, rich text 중첩은 이후 단계) |
| void 태그 | `img`, `br` |
| 허용 HTML 속성 | `style`, `src`, `alt`, `href`, `data-sigma-*` |

### 배치는 Auto Layout으로만

- `position` 불가 — absolute/relative 배치는 표현되지 않는다.
- `text-align` 불가 — TextNode는 내용에 맞는(hug) 폭이라 정렬할 공간이 없다.
  **정렬은 부모 컨테이너의 `justify-content` / `align-items`로 표현한다.**
- 순수 텍스트 요소(배경/패딩 없는 span 등)의 `width`/`height`는 무시되므로 거부된다.
  크기가 필요하면 부모 div로 감싸 크기를 준다.

### CSS 속성 화이트리스트

| 분류 | 속성 |
|------|------|
| 크기 | `width`, `height` |
| 레이아웃 | `display`(flex만), `flex-direction`, `justify-content`, `align-items`, `align-self`, `gap`, `flex-wrap`, `flex-grow`, `flex-shrink`, `overflow` |
| 여백 | `padding`(+개별 4방향) |
| 배경/색 | `background-color`, `background`(단색만), `color`, `opacity` |
| 테두리 | `border-width`(+개별), `border-color`(+개별), `border-radius`(1~4값) |
| 텍스트 | `font-size`, `font-weight`, `line-height`, `letter-spacing` |
| 효과 | `box-shadow`(inset 불가) |

### 값 규칙 (속성이 허용되어도 값이 틀리면 거부)

| 분류 | 규칙 | 거부 예 |
|------|------|---------|
| 길이 | **px 필수** (0만 단위 생략 가능) | `100%`, `1.5rem`, `1em`, `calc(...)`, `var(...)` |
| 색상 | hex / rgb / rgba / 색상명 (parseColor 해석 가능해야 함) | `linear-gradient(...)`, `var(--x)` |
| enum | `display: flex` / `flex-direction: row\|column` / `justify-content: flex-start\|center\|flex-end\|space-between` / `align-items: flex-start\|center\|flex-end\|stretch` / `flex-wrap: nowrap\|wrap` / `overflow: visible\|hidden` | `display: block`, `justify-content: space-around` |
| 숫자 | `opacity`, `flex-grow`, `flex-shrink` — 단위 없는 숫자 | — |
| font-weight | `normal`, `bold`, `100`~`900` | `650` |

> 이 값 규칙들은 라이브 검증에서 발견된 실제 손상 사례에 근거한다:
> `width: 100%` → 100px로 오변환, `1.5rem` → 1.5px, gradient → 배경 소실, `1em` → 1px.
> parseFloat 기반 파서가 단위를 버리기 때문에, 값 검증 없이는 조용히 틀린 결과가 나온다.

### 텍스트 파라미터 (slot)

```html
<span data-sigma-slot="text" data-sigma-desc="버튼에 표시할 라벨"
      style="font-size: 12px; color: #1565C0;">기본값</span>
```

- `data-sigma-slot="이름"` — 빌드 시 Figma 네이티브 **TEXT 컴포넌트 속성**으로 승격.
- `data-sigma-desc="설명"` — (선택) 카탈로그에 노출되는 파라미터 설명. slot 요소에만 허용.
- slot 이름: `^[a-z][a-z0-9_]*$`, 스펙 내 중복 불가.
- **텍스트 태그에만**, **루트 불가**, 자식 요소 불가, 기본 텍스트 필수.
- slot 요소에는 순수 텍스트 속성만 허용: `font-size`, `font-weight`, `line-height`,
  `letter-spacing`, `color`, `opacity`, `text-overflow`(아래).
  배경/패딩/보더/크기는 부모 컨테이너에 둔다 — slot이 프레임으로 승격되면
  "slot = 단일 TextNode" 계약이 깨지기 때문.

### 긴 텍스트 처리 (ellipsis / wrap)

고정폭 컨테이너 안의 slot은 긴 값이 들어오면 글자가 박스 밖으로 삐져나온다.
두 가지 처리 모드를 slot에 선언할 수 있다 (상호배타):

| 선언 | 동작 | 용도 |
|------|------|------|
| `text-overflow: ellipsis` | 단일 행, 넘치면 `…` | 드롭다운 값, 목록 항목 |
| `white-space: normal` | 다중 행 줄바꿈 (높이 성장) | 주석, 본문 문단 |

```html
<div style="display: flex; width: 220px; ...">
  <span data-sigma-slot="value" style="text-overflow: ellipsis;">Select</span>
</div>
<div style="display: flex; width: 260px; ...">
  <span data-sigma-slot="note" style="white-space: normal;">주석 내용</span>
</div>
```

- 두 모드 모두 **직계 부모 컨테이너에 width 명시 필수** (hug 부모에서는 무의미 + 거부).
- 둘 다 없는 fixed 컴포넌트에 긴 값을 넣으면 use 응답의 `warnings`로 넘침을 알려준다.
- 카탈로그 param에 `truncates: true` / `wraps: true`로 노출된다.

## 내장 프리셋 (표준 컴포넌트 팩)

sigma가 미리 정의한 스펙 팩을 `sigma_import_spec_preset(token, preset)`으로
현재 파일에 등록할 수 있다. 등록 후에는 일반 스펙과 완전히 동일하게 동작한다
(인스턴스 생성, props 재설정, overwrite 커스터마이즈 전부 가능).

| preset | namespace | 구성 |
|--------|-----------|------|
| `annotation` | `anno` | `region`(영역 강조 사각형 — 투명 배경+보더+라벨 칩), `marker`(번호 마커 ①), `label`(라벨 칩) |
| `wireframe` | `wire` | `box`(placeholder), `section_title`, `item`(목록 행), `kv`(설정 행, ellipsis), `note`(메모, wrap) |

- 이미 등록된 항목은 건너뛴다 (`overwrite: true`면 in-place 갱신 → 인스턴스 전파).
- 프리셋 HTML은 유닛 테스트가 스펙 검증기 통과를 강제한다 (`spec-presets.test.ts`).
- 기획 주석 관례: **번호 마커 + 범례**가 기본 (마커를 대상 프레임 안에 넣으면 함께
  이동). 영역 강조는 위치 스냅샷이므로 대상을 옮기면 함께 옮겨야 한다.
- **프레임 위 오버레이 레시피**: Auto Layout 프레임 위에 region을 씌우려면
  ① `parentId` 없이 생성 → ② `sigma_move_node(nodeId, parentId: 프레임)` →
  ③ `sigma_modify_node(setLayoutPositioning, {positioning: "ABSOLUTE"})` →
  ④ `sigma_modify_node(move, {x, y})` (프레임 상대 좌표). flow에 끼어들지 않고
  겹쳐진다.

## 예시

```html
<!-- 뱃지: 텍스트 파라미터 1개 -->
<div style="display: flex; align-items: center; padding: 2px 8px;
            background-color: #E3F2FD; border-radius: 10px;">
  <span data-sigma-slot="text"
        style="font-size: 12px; font-weight: 600; color: #1565C0;">Badge</span>
</div>
```

```
sigma_create_component_spec(token, alias: "ui_badge", description: "상태 표시용 뱃지", html: ...)
sigma_create_component_spec_instance(token, alias: "ui_badge", props: {text: "완료"}, parentId: "12:34")
```

검증된 레이아웃 패턴 (라이브 테스트 PASS):
column/row + `gap`, `padding`, `justify-content: space-between / flex-end / center`,
`align-items: center`, `flex-grow: 1`(잔여 공간 채움), 중첩 컨테이너,
`border-width`+`border-color`, 개별 면 보더(`border-left-width` 액센트, 탭 밑줄),
`box-shadow`, 부분 `border-radius`(`12px 12px 0 0`), 원형(`border-radius` = 크기/2),
stretch(기본값) 폭 채움, 고정 열 너비 테이블(셀을 `width` 지정 div로).

실전 검증 완료 컴포넌트 12종 (Playground):
button, text_input, dropdown, checkbox, toggle, avatar, alert, tabs, progress,
autocomplete, card, table — 전부 등록·인스턴스 생성·Auto Layout 조합(폼) PASS.

참고: 스펙 루트에 배경을 지정하지 않으면 **투명**으로 유지된다
(일반 프레임 임포트의 "루트 흰 배경 대체" 규칙은 컴포넌트에 적용되지 않음 —
체크박스처럼 임의 배경 위에 놓이는 컴포넌트의 조합성을 위해).

## 에러 동작

| 상황 | 응답 |
|------|------|
| 규칙 위반 HTML | 등록 거부 + `violations` 배열에 위반 전체 나열 |
| 중복 alias | 거부 + `overwrite: true` 안내 |
| 미등록 alias 사용 | 에러 + `available` 목록 |
| 알 수 없는 props | 에러 + 사용 가능 param 목록 |
| 컴포넌트 노드 삭제 후 사용 | "계약 위반 ... 다시 등록하세요" (Figma의 limbo 컴포넌트로 조용히 생성하지 않음) |

## 구현 위치

| 레이어 | 파일 |
|--------|------|
| 검증기 (규칙의 단일 원천) | `packages/shared/src/component-spec/validate.ts` |
| 타입 | `packages/shared/src/component-spec/types.ts` |
| 빌드/사용 (Figma) | `packages/figma-plugin/src/node-ops/component-spec.ts` |
| slot 마커 전달 | `packages/figma-plugin/src/converter/node-creator.ts` (`data-sigma-slot` → pluginData) |
| MCP 핸들러 | `packages/server/src/mcp/handlers/component-spec.ts` |
| 레지스트리 저장소 | `packages/server/src/storage/component-specs.ts` |

## 이후 단계 (미구현)

- **variant**: class 기반 CSS(`.badge.sm`) 파싱 + Component Set 빌드 + enum param
- **adopt**: 손으로 만든 컴포넌트의 구조 검증 후 편입
- **boolean slot**(표시/숨김), **INSTANCE_SWAP**(아이콘 교체)
- rich text(텍스트 태그 중첩), text-align(고정폭 다중행 텍스트)
- 같은 HTML 소스에서 코드 컴포넌트(React 등) 생성
