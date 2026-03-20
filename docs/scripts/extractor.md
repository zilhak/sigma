# Extractor 스크립트

**파일:** `dist/extractor.standalone.js` (v2.0.0)
**전역 API:** `window.__sigma__`
**소스:** `packages/shared/src/extractor/` + `packages/shared/src/discovery/`
**엔트리:** `packages/shared/src/extractor-standalone-entry.ts`

DOM 요소를 `ExtractedNode` JSON으로 변환하고, 페이지 내 요소를 탐색하는 스크립트입니다.
Chrome Extension과 Playwright 자동화 모두 이 추출 로직을 공유합니다 (Single Source of Truth).

---

## 소스 모듈 구성

```
extractor/
├── core.ts        # extractElement, extractAll, extractVisible, getDesignTokens
├── styles.ts      # CSS computed style → ComputedStyles 변환
├── visibility.ts  # 요소 가시성 판단
├── text.ts        # 인라인 텍스트 병합 로직
├── icons.ts       # 아이콘 폰트 감지 + canvas 캡처
├── pseudo.ts      # ::before/::after pseudo-element 추출
├── svg.ts         # SVG computed styles → inline 속성 직렬화
├── utils.ts       # ID 생성, 크기 파싱, 클래스/텍스트/속성 추출
└── index.ts       # Barrel export

discovery/
├── core.ts        # findByText, findByAlt, findForm, findContainer, getPageStructure
└── index.ts       # Barrel export
```

---

## 핵심 로직: extractElement()

**파일:** `extractor/core.ts`

DOM 요소 하나를 재귀적으로 `ExtractedNode`로 변환하는 메인 함수입니다.

### 처리 순서

```
1. 가시성 체크 (visibility.ts)
   → display:none, visibility:hidden, opacity:0, clip:rect(0), position:-9999px 등 감지
   → 보이지 않는 요소는 null 반환 (루트 body 제외)

2. 특수 요소 Early Return
   a. <canvas> → toDataURL()로 이미지 캡처 (CORS 실패 시 무시)
   b. <img> → data URL이면 직접 사용, 로드된 이미지면 canvas로 변환
   c. <svg> → SVG 전체를 computed style 인라인 적용 후 직렬화 (svg.ts)
   d. 아이콘 폰트 → canvas에 렌더링하여 PNG data URL로 캡처 (icons.ts)

3. 인라인 텍스트 병합 (text.ts)
   → 자식이 모두 인라인 텍스트 태그(span, strong, em 등)이고
     시각적 스타일(배경, 테두리)이 없으면 하나의 텍스트로 병합
   → 아이콘 폰트, flex/grid 컨테이너, 시각적 패딩이 있는 자식은 병합 대상에서 제외

4. 자식 요소 재귀 추출
   → HTMLElement, SVGSVGElement만 대상
   → null 결과(비가시 요소) 필터링

5. Pseudo-element 추출 (pseudo.ts)
   → ::before → 자식 목록 앞에 배치
   → ::after → 자식 목록 뒤에 배치

6. Bounding Rect 계산
   → overflow:visible인 경우, 자식의 실제 위치로 부모 크기 확장
   → scrollWidth/scrollHeight로 클리핑된 콘텐츠 크기 반영
   → 무한 스크롤 보호: 최대 10,000px 제한
   → 확장된 크기를 styles.width/height에도 반영
```

### 반환 구조 (ExtractedNode)

```typescript
{
  id: string,              // "node-{timestamp}-{random7}"
  tagName: string,         // 소문자 (예: "div", "svg", "::before")
  className: string,       // 클래스명 (SVG의 경우 baseVal 처리)
  textContent: string,     // 직접 텍스트 노드만 (<br> → \n)
  attributes: Record<string, string>,  // class, style 제외
  styles: ComputedStyles,  // 40+ CSS 속성
  boundingRect: { x, y, width, height },
  children: ExtractedNode[],
  svgString?: string,      // SVG 전용
  imageDataUrl?: string,   // img/canvas/아이콘 폰트 전용
  isPseudo?: boolean,      // pseudo-element 전용
}
```

---

## 스타일 추출: extractStyles()

**파일:** `extractor/styles.ts`

`CSSStyleDeclaration`에서 40개 이상의 속성을 추출하여 `ComputedStyles`로 변환합니다.

### 추출 속성 목록

| 카테고리 | 속성들 |
|----------|--------|
| **레이아웃** | display, position, flexDirection, justifyContent, alignItems, alignSelf, flexWrap, gap, rowGap, columnGap, borderSpacingX/Y |
| **Flex 아이템** | flexGrow, flexShrink, flexBasis |
| **크기** | width, height, minWidth, minHeight, maxWidth, maxHeight |
| **패딩** | paddingTop/Right/Bottom/Left |
| **마진** | marginTop/Right/Bottom/Left |
| **배경** | backgroundColor (RGBA), backgroundImage |
| **테두리 두께** | borderTop/Right/Bottom/LeftWidth |
| **테두리 색상** | borderTop/Right/Bottom/LeftColor (RGBA, width=0이면 투명) |
| **테두리 라운드** | borderTopLeft/TopRight/BottomRight/BottomLeftRadius |
| **텍스트** | color (RGBA), fontSize, fontFamily, fontWeight, fontStyle, textAlign, textDecoration, lineHeight, letterSpacing, whiteSpace, textOverflow, verticalAlign |
| **Grid** | gridTemplateColumns/Rows, gridAutoFlow, gridColumn/RowStart/End |
| **기타** | opacity, overflow, boxShadow, transform |

색상 값은 `parseColor()`로 `RGBA` (0~1 범위, Figma 호환) 형식으로 변환됩니다.

---

## 가시성 판단: isElementVisible()

**파일:** `extractor/visibility.ts`

다음 조건 중 하나라도 해당하면 **비가시**(false):

| 조건 | 설명 |
|------|------|
| `display: none` | 렌더링 안 됨 |
| `visibility: hidden` | 공간 차지하지만 안 보임 |
| `opacity: 0` | 완전 투명 |
| `width: 0` 또는 `height: 0` | 크기 없음 (body/html 제외) |
| `clip: rect(0,0,0,0)` | 접근성 hidden 패턴 (sr-only) |
| `clipPath: inset(50%)` | 접근성 hidden 패턴 |
| 화면 밖 배치 | absolute/fixed에서 right < -5000 또는 bottom < -5000 |

---

## 텍스트 병합: isAllInlineTextContent() / getFullInlineTextContent()

**파일:** `extractor/text.ts`

`<p>Hello <strong>world</strong></p>` 같은 구조에서 `strong`을 별도 노드로 분리하지 않고 "Hello world"라는 하나의 텍스트로 병합합니다.

### 병합 대상 태그

`span`, `strong`, `em`, `b`, `i`, `a`, `br`, `code`, `small`, `sub`, `sup`, `mark`, `abbr`, `cite`, `q`, `time`, `kbd`, `var`, `samp`

### 병합 거부 조건

- 알려진 아이콘 폰트 클래스/font-family를 가진 요소
- textContent 비어있는데 시각적 크기가 있는 요소 (장식 요소)
- flex/grid 컨테이너 (`display: flex/inline-flex/grid/inline-grid`)
- 배경색이 있는 요소 (transparent 제외)
- 테두리가 있는 요소 (borderWidth > 0)
- 패딩이 큰 요소 (paddingTop/Bottom > 2px)
- 재귀적으로 자식도 모두 인라인이어야 함

---

## 아이콘 폰트 처리: isIconFontElement() / captureIconAsImage()

**파일:** `extractor/icons.ts`

Font Awesome, Material Icons 등 CSS pseudo-element로 글리프를 렌더링하는 아이콘 폰트를 감지하고 이미지로 캡처합니다.

### 감지 기준

1. **클래스명 패턴:** `fab`, `fas`, `fa-`, `icon-`, `material-icons`, `bi-`, `glyphicon`, `argo-icon`, `mdi-`, `ri-`, `ti-`, `feather-`
2. **font-family:** Font Awesome, Material Icons, Bootstrap Icons, Glyphicons, IcoMoon, RemixIcon, Tabler
3. **구조:** `<i>` 또는 `<span>` 태그이고, textContent 비어있으면서 `::before`에 content가 있음

### 캡처 로직

1. `::before`의 content에서 글리프 문자 추출 (Material Icons는 textContent 사용)
2. 2x 스케일 canvas 생성 (retina 대응)
3. `::before`의 fontFamily로 글리프 렌더링
4. `canvas.toDataURL('image/png')` 반환

---

## Pseudo-element 추출: extractPseudoElement()

**파일:** `extractor/pseudo.ts`

`::before`와 `::after` pseudo-element를 감지하여 `ExtractedNode`로 변환합니다.

### 크기 측정 방법

1. CSS `width`/`height`가 명시되어 있으면 직접 사용
2. 없으면 **프로브 span** 방식:
   - 임시 span 생성
   - pseudo의 font, padding, border 등 스타일 복사
   - content 텍스트 설정
   - DOM에 삽입 → `getBoundingClientRect()`로 실측
   - DOM에서 제거

### 무시되는 pseudo-element

- `content: none | normal | ""`
- `display: none`

---

## SVG 처리: serializeSvgWithComputedStyles()

**파일:** `extractor/svg.ts`

Figma의 `createNodeFromSvg()`는 CSS 클래스 스타일을 해석하지 못하므로, computed styles를 SVG inline 속성으로 변환합니다.

### 처리 과정

1. SVG 요소 deep clone
2. `viewBox`, `width`, `height`가 없으면 `getBoundingClientRect()`에서 보정 (ReactFlow 등 CSS 전용 크기 대응)
3. 루트 + 모든 자식 요소에 computed style 인라인 적용:
   - 색상: `fill`, `stroke`, `stroke-width`
   - 불투명도: `opacity`, `fill-opacity`, `stroke-opacity`
   - 기하학: `cx`/`cy`/`r` (circle), `rx`/`ry` (ellipse), `x`/`y`/`width`/`height` (rect)
   - 변환: `transform`
   - 가시성: `visibility`, `display:none` → `visibility:hidden`
4. `outerHTML` 반환

---

## Discovery API

**파일:** `discovery/core.ts`

페이지 내 DOM 요소를 탐색하는 유틸리티입니다. 추출 전에 대상 요소를 찾는 데 사용합니다.

### findByText(text, tagName?)

텍스트 내용으로 요소를 찾습니다. **가장 깊은(가장 구체적인) 매칭 요소**를 반환합니다.

1. `tagName` 또는 `*`로 전체 요소 순회
2. `textContent.includes(text)` 매칭
3. 자식 중 `textContent.trim() === text`인 가장 깊은 요소 우선 반환
4. 정확 매칭 없으면 자식 3개 이하인 부모 반환

### findByAlt(altText)

`img[alt="정확매칭"]` → `img[alt*="부분매칭"]` 순으로 검색합니다.

### findForm(action?)

`action` 지정 시 `form[action*="..."]` 검색, 없으면 첫 번째 form 반환.

### findContainer(options)

지정된 크기 범위의 컨테이너를 **부모 방향으로 탐색**합니다.

```typescript
findContainer({
  minWidth: 300,
  maxWidth: 800,
  fromElement: '.my-button'  // 이 요소부터 부모로 올라감
})
```

### getPageStructure()

페이지 전체 구조를 요약합니다:

| 필드 | 내용 |
|------|------|
| `title` | `document.title` |
| `url` | `window.location.href` |
| `viewport` | 뷰포트 크기 |
| `forms` | form 요소 (최대 5개) |
| `images` | alt 있는 img (최대 10개) |
| `buttons` | button, submit, [role=button] (최대 10개) |
| `links` | a 태그 수 |
| `mainContent` | main/article/[role=main], 없으면 가장 큰 div |

`mainContent` 휴리스틱: `main`/`article`/`[role=main]`이 없으면, 모든 div 중 면적이 가장 크면서 `width > 300`, `height > 200`, `width < 화면의 95%`인 요소를 선택합니다.

---

## Bulk 추출 API

### extractAll(selector)

`querySelectorAll(selector)` 결과를 모두 `extractElement()`로 변환합니다.

### extractVisible(options?)

뷰포트 내 보이는 **컴포넌트**를 자동 추출합니다.

**컴포넌트 판단 기준 (22개 셀렉터):**
- 시맨틱: `button`, `input`, `select`, `textarea`, `a[href]`, `nav`, `header`, `footer`, `aside`, `article`, `section > *`
- ARIA role: `button`, `navigation`, `dialog`, `tablist`, `alert`
- 클래스 패턴: `card`, `badge`, `chip`, `avatar`, `modal`, `dropdown`, `tooltip`, `tab`

**필터 조건:** 최소 크기(기본 20x20px) + 뷰포트 내 위치

---

## 디자인 토큰 추출: getDesignTokens()

CSS 커스텀 프로퍼티(`--변수`)를 추출합니다.

### 수집 순서

1. 인라인 style에서 `--*` 변수 수집
2. 스타일시트에서 해당 요소에 매칭되는 규칙의 `--*` 변수 수집 (`:root`, `html` 포함)
3. `getComputedStyle()`의 resolved 값으로 덮어쓰기

CORS 제한된 외부 스타일시트는 자동으로 스킵됩니다.

---

## 유틸리티 함수

**파일:** `extractor/utils.ts`

| 함수 | 설명 |
|------|------|
| `generateId()` | `"node-{timestamp}-{random7}"` 형식 ID 생성 |
| `parseSize(value)` | CSS 크기 문자열 → 숫자 (`"16px"` → `16`, `"auto"` → `0`) |
| `parseAutoSize(value)` | `"auto"`면 문자열 `"auto"` 반환, 나머지는 숫자 |
| `parseBorderSpacing(value)` | `"8px 4px"` → `{ x: 8, y: 4 }` |
| `getClassName(element)` | SVG의 `className.baseVal` 처리 포함 |
| `getDirectTextContent(element)` | 직접 자식 텍스트 노드만 수집 (`<br>` → `\n`) |
| `getAttributes(element)` | `class`와 `style` 제외한 HTML 속성 수집 |
