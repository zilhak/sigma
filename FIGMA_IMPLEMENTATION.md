# Figma Plugin 구현 가이드

> **⚠️ 빠른 구현을 위한 베이스 문서**
>
> 이 문서의 내용은 최종 형상이 아닙니다. 우선 빠르게 동작하는 버전을 구현하고,
> 실제 사용하면서 성능과 품질을 보며 점진적으로 개선할 예정입니다.
>
> 참조: `/Users/ljh/workspace/etc/figma-plugin-test`

---

## ExtractedNode 타입 정의

Extension에서 추출하고 Figma Plugin으로 전달되는 JSON 스키마:

```typescript
interface ExtractedNode {
  id: string;                          // 고유 식별자
  tagName: string;                     // HTML 태그 (div, button, span 등)
  className: string;                   // CSS 클래스
  textContent: string;                 // 텍스트 내용 (자식 태그 없는 경우)
  attributes: Record<string, string>;  // HTML 속성 (src, href 등)

  styles: ComputedStyles;              // 계산된 CSS 속성

  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  children: ExtractedNode[];           // 자식 노드 (재귀 구조)
}

interface ComputedStyles {
  // 레이아웃
  display: string;
  position: string;
  flexDirection: string;
  justifyContent: string;
  alignItems: string;
  flexWrap: string;
  gap: number;

  // 크기
  width: number | "auto";
  height: number | "auto";
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;

  // 여백
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;

  // 배경
  backgroundColor: RGBA | null;
  backgroundImage: string | null;

  // 테두리
  borderTopWidth: number;
  borderRightWidth: number;
  borderBottomWidth: number;
  borderLeftWidth: number;
  borderTopColor: RGBA | null;
  borderRightColor: RGBA | null;
  borderBottomColor: RGBA | null;
  borderLeftColor: RGBA | null;
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

  // 기타
  opacity: number;
  overflow: string;
  boxShadow: string;
  transform: string;
}

interface RGBA {
  r: number;  // 0-1 범위
  g: number;  // 0-1 범위
  b: number;  // 0-1 범위
  a: number;  // 0-1 범위
}
```

---

## CSS → Figma 속성 매핑

### 레이아웃 매핑

| CSS display | Figma layoutMode |
|-------------|------------------|
| `flex` + `flex-direction: row` | `HORIZONTAL` |
| `flex` + `flex-direction: column` | `VERTICAL` |
| `block` (기본) | `VERTICAL` |
| `inline`, `inline-block` | `HORIZONTAL` |

### 정렬 매핑

| CSS | Figma |
|-----|-------|
| `justify-content: center` | `primaryAxisAlignItems = "CENTER"` |
| `justify-content: flex-end` | `primaryAxisAlignItems = "MAX"` |
| `justify-content: space-between` | `primaryAxisAlignItems = "SPACE_BETWEEN"` |
| `align-items: center` | `counterAxisAlignItems = "CENTER"` |
| `align-items: flex-end` | `counterAxisAlignItems = "MAX"` |

### 스타일 매핑

| CSS | Figma API |
|-----|-----------|
| `background-color` | `frame.fills = [{ type: "SOLID", color: {r,g,b}, opacity }]` |
| `border-*` | `frame.strokes`, `frame.strokeWeight` |
| `border-radius` | `frame.topLeftRadius`, `topRightRadius`, ... |
| `box-shadow` | `frame.effects = [{ type: "DROP_SHADOW", ... }]` |
| `opacity` | `frame.opacity` |
| `padding-*` | `frame.paddingTop`, `paddingRight`, ... |
| `gap` | `frame.itemSpacing` |

---

## 컬러 변환

CSS 색상 문자열을 Figma RGBA로 변환:

```typescript
// CSS: "rgb(255, 128, 0)" → Figma: { r: 1, g: 0.5, b: 0, a: 1 }
// 0-255 범위를 0-1 범위로 변환

function parseColor(colorStr: string): RGBA | null {
  // HEX: #fff, #ffffff
  // RGB: rgb(255, 128, 0)
  // RGBA: rgba(255, 128, 0, 0.5)
  // Named: white, black, transparent
}
```

---

## 핵심 Figma API

```typescript
// 프레임 생성
const frame = figma.createFrame();
frame.resize(width, height);
frame.layoutMode = "VERTICAL" | "HORIZONTAL";

// 레이아웃
frame.primaryAxisAlignItems = "CENTER" | "MIN" | "MAX" | "SPACE_BETWEEN";
frame.counterAxisAlignItems = "CENTER" | "MIN" | "MAX";
frame.itemSpacing = gap;
frame.paddingTop = value;

// 스타일
frame.fills = [{ type: "SOLID", color: { r, g, b }, opacity }];
frame.strokes = [{ type: "SOLID", color: { r, g, b } }];
frame.strokeWeight = borderWidth;
frame.cornerRadius = radius;
frame.effects = [{ type: "DROP_SHADOW", ... }];

// 텍스트
const text = figma.createText();
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
text.characters = "텍스트";
text.fontSize = 16;
text.fills = [{ type: "SOLID", color: { r, g, b } }];

// 페이지 추가
figma.currentPage.appendChild(frame);
```

---

## 현재 제한사항 (추후 개선 예정)

| 항목 | 현재 상태 | 개선 방향 |
|------|----------|----------|
| 폰트 | Inter 하드코딩 | 폰트 매핑 테이블 또는 자동 감지 |
| 이미지 | placeholder 대체 | 이미지 URL 다운로드 후 삽입 |
| SVG | placeholder 대체 | SVG 파싱 후 벡터 노드 생성 |
| 그라디언트 | 미지원 | `GRADIENT_LINEAR` 등 지원 |
| CSS Grid | flex로 처리 | Grid 레이아웃 매핑 |
| transform | 무시 | rotation, scale 매핑 |
| 다중 box-shadow | 첫 번째만 | 배열로 여러 효과 적용 |
| 가변 폰트 | 미지원 | fontVariationAxes 사용 |

---

## 변환 흐름

```
1. Extension: DOM 요소 선택
       ↓
2. Extension: getComputedStyle()로 스타일 추출
       ↓
3. Extension: ExtractedNode 트리 생성
       ↓
4. Server: JSON 저장 (또는 클립보드 복사)
       ↓
5. Figma Plugin: JSON 수신
       ↓
6. Figma Plugin: 재귀적으로 Figma 노드 생성
       ↓
7. Figma: 프레임이 캔버스에 추가됨
```

---

## 참고 구현

상세 구현은 다음 파일 참조:
- `figma-plugin-test/packages/figma-plugin/src/code.ts` — 메인 변환 로직
- `figma-plugin-test/packages/shared/src/index.ts` — 타입 정의 및 유틸리티
- `figma-plugin-test/packages/chrome-extension/src/content.ts` — DOM 추출 로직
