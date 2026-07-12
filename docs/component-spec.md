# 컴포넌트 스펙 (Component Spec) — HTML 기반 컴포넌트 정의

엄격한 규칙의 HTML로 Figma 컴포넌트를 등록하고, 에이전트가 Figma 내부를 탐색하지 않고
`alias + props`만으로 인스턴스를 삽입하는 시스템.

```
등록:  sigma_define_component(token, alias, description, html)
조회:  sigma_list_components()            → alias + 설명 + params (카탈로그)
       sigma_list_components(alias)       → HTML 원문 포함 상세
사용:  sigma_use_component(token, alias, props, x, y, parentId)
삭제:  sigma_delete_component_spec(alias) → 레지스트리만 삭제 (Figma 노드 유지)
```

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
<span data-sigma-slot="text" style="font-size: 12px; color: #1565C0;">기본값</span>
```

- `data-sigma-slot="이름"` — 빌드 시 Figma 네이티브 **TEXT 컴포넌트 속성**으로 승격.
- slot 이름: `^[a-z][a-z0-9_]*$`, 스펙 내 중복 불가.
- **텍스트 태그에만**, **루트 불가**, 자식 요소 불가, 기본 텍스트 필수.
- slot 요소에는 순수 텍스트 속성만 허용: `font-size`, `font-weight`, `line-height`,
  `letter-spacing`, `color`, `opacity`.
  배경/패딩/보더/크기는 부모 컨테이너에 둔다 — slot이 프레임으로 승격되면
  "slot = 단일 TextNode" 계약이 깨지기 때문.

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
sigma_define_component(token, alias: "ui_badge", description: "상태 표시용 뱃지", html: ...)
sigma_use_component(token, alias: "ui_badge", props: {text: "완료"}, parentId: "12:34")
```

검증된 레이아웃 패턴 (라이브 테스트 PASS):
column/row + `gap`, `padding`, `justify-content: space-between`, `align-items: center`,
`flex-grow: 1`(잔여 공간 채움), 중첩 컨테이너, `border-width`+`border-color`,
`box-shadow`, 부분 `border-radius`(`12px 12px 0 0`), stretch(기본값) 폭 채움.

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
