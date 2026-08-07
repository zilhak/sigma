# 변환기 (Converter)

ExtractedNode JSON 또는 HTML 문자열을 Figma 노드로 변환하는 모듈입니다.

**소스:** `packages/figma-plugin/src/converter/`
**MCP 도구:** `sigma_create_frame`, `sigma_import_saved`, `sigma_update_frame`

---

## 소스 구조

```
converter/
├── frame.ts          # 프레임 생성/업데이트, 자동 배치
├── node-creator.ts   # ExtractedNode → Figma 노드 변환
├── special-nodes.ts  # SVG, 이미지, 입력 요소, pseudo-element
├── styles.ts         # CSS 스타일 → Figma 속성 변환
├── layout.ts         # Flexbox 레이아웃
├── grid.ts           # CSS Grid 레이아웃
├── html-parser.ts    # HTML 문자열 → ExtractedNode 파싱
└── index.ts          # Barrel export
```

---

## 변환 흐름

### JSON → Figma

```
sigma_create_frame(token, data: ExtractedNode)
  │
  ▼
createFrameFromJSON(node, name, position, pageId)
  │
  ├── 대상 페이지 결정 (pageId → getTargetPage)
  ├── 루트 Frame 생성
  ├── 자동 배치 위치 계산 (getAutoPosition)
  ├── ExtractedNode 재귀 변환 (createFigmaNode)
  │    ├── 일반 요소 → Frame + 스타일
  │    ├── 텍스트 → TextNode
  │    ├── SVG → createNodeFromSvg
  │    ├── 이미지 → Rectangle + imageFill
  │    └── pseudo-element → 텍스트/이미지
  └── 레이아웃 적용 (Flexbox / Grid)
```

### HTML → Figma

```
sigma_create_frame(token, html: string, format: 'html')
  │
  ▼
createFrameFromHTML(html, name, position, pageId)
  │
  ├── parseHTML(html) → ExtractedNode 변환
  └── createFrameFromJSON()과 동일 흐름
```

### 프레임 업데이트

```
sigma_update_frame(token, nodeId, data)
  │
  ▼
updateExistingFrame(nodeId, format, data, name)
  │
  ├── 기존 프레임의 자식 모두 삭제
  ├── 새 데이터로 재생성
  └── 프레임 이름 업데이트 (선택)
```

---

## 자동 배치 (frame.ts)

`position`이 지정되지 않으면 `getAutoPosition()`이 **대상 페이지의 현재 내용만 보고** 위치를 계산합니다:

```
1. 페이지에 노드가 있음?
   → x = 0, y = (기존 노드들의 최대 y+height) + 200
     (항상 세로로 아래에 쌓인다 — 가로 나열은 하지 않는다)

2. 빈 페이지?
   → (0, 0)
```

**전역 상태를 쓰지 않는 것이 의도된 설계입니다.** 과거에는 "마지막으로 생성한 프레임"을 전역
(`lastCreatedFrame`)으로 기억해 그 오른쪽에 놓았지만, 여러 에이전트가 같은 파일에서 동시에
작업하면 서로의 값을 덮어써 배치가 뒤엉킵니다. 그래서 제거하고 **매 호출마다 페이지를 스캔**하는
방식으로 바꿨습니다 (`CLAUDE.md` §멀티에이전트 동시 작업의 "금지 패턴" 참조).

그 결과 자동 배치는 **호출 시점의 페이지 내용에 의존**합니다 — 좌표를 확정해야 하면 `position`을
명시하세요.

---

## 노드 생성 (node-creator.ts)

`createFigmaNode()`는 ExtractedNode를 재귀적으로 Figma 노드로 변환합니다.

### 타입별 처리

| ExtractedNode 조건 | 생성되는 Figma 노드 |
|---------------------|---------------------|
| `svgString` 존재 | `figma.createNodeFromSvg()` |
| `imageDataUrl` 존재 | Rectangle + `imageFill` |
| `tagName === 'input'` 등 | special-nodes 처리 |
| `tagName === '::before/::after'` | 텍스트 또는 이미지 노드 |
| `textContent`만 존재 (자식 없음) | TextNode |
| 그 외 | Frame + 자식 재귀 |

### 스타일 적용 순서

```
1. Frame 생성 (figma.createFrame())
2. 크기 설정 (boundingRect.width/height)
3. 배경 (backgroundColor → fills)
4. 테두리 (borderWidth/Color → strokes)
5. 모서리 (borderRadius → cornerRadius)
6. 그림자 (boxShadow → effects)
7. 패딩 (padding)
8. 레이아웃 (Flexbox/Grid)
9. 자식 노드 재귀 생성
```

---

## 스타일 변환 (styles.ts)

CSS computed style에서 추출된 `ComputedStyles`를 Figma 속성으로 변환합니다.

| CSS 속성 | Figma 속성 | 변환 |
|----------|------------|------|
| `backgroundColor` | `fills` | RGBA → SolidPaint |
| `borderWidth` + `borderColor` | `strokes` + `strokeWeight` | 4면 개별 또는 통일 |
| `borderRadius` | `cornerRadius` | 4꼭지점 개별 또는 통일 |
| `boxShadow` | `effects` | DROP_SHADOW / INNER_SHADOW |
| `opacity` | `opacity` | 0~1 그대로 |
| `backgroundImage: linear-gradient` | `fills` | GradientPaint |
| `padding` | `paddingTop/Right/Bottom/Left` | Auto Layout용 |

---

## 레이아웃 변환 (layout.ts)

CSS Flexbox를 Figma Auto Layout으로 변환합니다.

| CSS | Figma Auto Layout |
|-----|-------------------|
| `display: flex` | `layoutMode = 'HORIZONTAL'/'VERTICAL'` |
| `flex-direction: row` | `layoutMode = 'HORIZONTAL'` |
| `flex-direction: column` | `layoutMode = 'VERTICAL'` |
| `justify-content` | `primaryAxisAlignItems` |
| `align-items` | `counterAxisAlignItems` |
| `gap` | `itemSpacing` |
| `flex-wrap: wrap` | `layoutWrap = 'WRAP'` |
| `flex-grow` | `layoutGrow` |
| `padding` | `paddingTop/Right/Bottom/Left` |

---

## Grid 변환 (grid.ts)

CSS Grid를 Figma에서 가용한 형태로 변환합니다. Figma는 CSS Grid를 네이티브 지원하지 않으므로, Auto Layout과 크기 제약으로 근사합니다.

---

## HTML 파서 (html-parser.ts)

HTML 문자열을 `ExtractedNode` 트리로 파싱합니다. Figma Sandbox는 `DOMParser`가 없으므로 **자체 파서**를 구현하여 사용합니다.

---

## 특수 노드 (special-nodes.ts)

| 요소 | 처리 |
|------|------|
| SVG | `figma.createNodeFromSvg(svgString)` → VectorNode |
| 이미지 | base64 → `figma.createImage()` → Rectangle의 `fills`에 ImagePaint |
| `<input>`, `<select>` | 외형을 Frame + TextNode로 모방 |
| `::before`, `::after` | content 문자열 → TextNode, 또는 이미지 데이터 → Rectangle |

### SVG enrichment

Plugin에서 `extractNodeToJSON()`으로 역추출 시 SVG 노드의 `svgString`이 비어있을 수 있습니다. 이 경우 `enrichSvgData()` 함수가 `exportAsync({ format: 'SVG' })`로 비동기 보충합니다.

---

## 역추출 (extractor/)

Figma 노드를 ExtractedNode JSON 또는 HTML로 변환하는 역방향 기능입니다.

**소스:** `packages/figma-plugin/src/extractor/`
**MCP 도구:** `sigma_extract_node`, `sigma_test_roundtrip`

| 파일 | 기능 |
|------|------|
| `extract.ts` | Figma 노드 → ExtractedNode JSON (재귀) |
| `html-export.ts` | ExtractedNode → HTML 문자열 변환 |

### 라운드트립 테스트

`sigma_test_roundtrip`은 노드를 추출한 뒤 즉시 재생성하여 변환 품질을 검증합니다:

```
원본 노드 → extractNodeToJSON → ExtractedNode → createFrameFromJSON → 복제 노드
```

결과 프레임은 `[Test-JSON] {원본이름}` 또는 `[Test-HTML] {원본이름}`으로 생성됩니다.
