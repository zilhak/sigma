# Figma Plugin 구조화 계획

## 현재 구조 분석

### 파일별 라인 수
| 파일 | 라인 수 | 상태 |
|------|---------|------|
| `code.ts` | 2,499 | **심각** - 즉시 분리 필요 |
| `ui.ts` | 719 | **과대** - 분리 필요 |
| `ui.html` | - | 유지 |

### code.ts 관심사 분석 (2,499줄)

현재 하나의 파일에 **8개 이상의 관심사**가 혼재:

1. **파일/페이지 관리** (약 100줄)
   - `getStoredFileKey()`, `saveFileKey()`
   - `getAllPages()`, `getPageById()`, `getTargetPage()`
   - `sendFileInfo()`

2. **메시지 핸들러** (약 300줄)
   - `figma.ui.onmessage` - 거대한 switch문
   - create-from-json, create-from-html, get-frames 등

3. **JSON→Figma 변환 핵심** (약 200줄)
   - `createFrameFromJSON()`
   - `createFigmaNode()`

4. **텍스트 처리** (약 100줄)
   - `isTextOnlyElement()`
   - `createTextNode()`

5. **특수 요소 처리** (약 200줄)
   - `createPseudoElementNode()`
   - `createSvgNode()`, `resolveCssVariablesInSvg()`
   - `createImagePlaceholder()`

6. **스타일 적용 함수들** (약 400줄)
   - `applySizingMode()`
   - `applyLayoutMode()`
   - `applyAlignment()`
   - `applyPadding()`
   - `applyBackground()`
   - `applyBorder()`
   - `applyCornerRadius()`
   - `applyBoxShadow()`
   - `parseBoxShadows()`, `parseSingleShadow()`
   - `parseColorFromCSS()`, `createSolidPaint()`

7. **HTML 파싱** (약 500줄)
   - `createFrameFromHTML()`
   - `parseHTML()`, `parseElement()`
   - `extractClass()`, `extractAttributes()`
   - `parseInlineStyles()`, `applyStyleProperty()`
   - `parseCSSColor()`, `parseSpacing()`
   - `createDefaultStyles()`

8. **Figma→JSON 추출** (약 400줄)
   - `extractNodeToJSON()`
   - `getTagNameFromNode()`
   - `extractTextStyles()`
   - `extractLayoutStyles()`
   - `extractFillStyles()`
   - `extractStrokeStyles()`
   - `extractCornerStyles()`
   - `extractEffectStyles()`

---

## 제안 구조

```
packages/figma-plugin/
├── src/
│   ├── code.ts                    # 진입점 (메시지 라우팅만)
│   ├── ui.ts                      # UI 진입점
│   ├── ui.html
│   │
│   ├── core/                      # 핵심 로직
│   │   ├── page-manager.ts        # 페이지/파일 관리
│   │   └── message-handler.ts     # 메시지 핸들러 (라우팅)
│   │
│   ├── converter/                 # JSON → Figma 변환
│   │   ├── index.ts               # createFrameFromJSON
│   │   ├── node-factory.ts        # createFigmaNode
│   │   ├── text.ts                # 텍스트 노드 생성
│   │   ├── svg.ts                 # SVG 처리
│   │   ├── image.ts               # 이미지 플레이스홀더
│   │   └── pseudo.ts              # Pseudo element
│   │
│   ├── styles/                    # 스타일 적용
│   │   ├── index.ts               # 스타일 적용 통합
│   │   ├── layout.ts              # layoutMode, sizing, alignment
│   │   ├── background.ts          # 배경, 테두리
│   │   ├── effects.ts             # 그림자, 모서리
│   │   └── color.ts               # 색상 파싱
│   │
│   ├── parser/                    # HTML 파싱
│   │   ├── index.ts               # createFrameFromHTML
│   │   ├── html-parser.ts         # parseHTML, parseElement
│   │   ├── style-parser.ts        # parseInlineStyles
│   │   └── default-styles.ts      # 기본 스타일
│   │
│   ├── extractor/                 # Figma → JSON 추출
│   │   ├── index.ts               # extractNodeToJSON
│   │   ├── text-extractor.ts      # 텍스트 스타일 추출
│   │   ├── layout-extractor.ts    # 레이아웃 스타일 추출
│   │   └── visual-extractor.ts    # fill, stroke, corner, effect
│   │
│   ├── ui/                        # UI 로직 분리
│   │   ├── index.ts               # UI 진입점
│   │   ├── connection.ts          # WebSocket 연결 관리
│   │   ├── handlers.ts            # 서버 메시지 핸들러
│   │   └── state.ts               # UI 상태 관리
│   │
│   └── types/                     # 로컬 타입
│       └── index.ts
│
├── build.ts
├── manifest.json
└── package.json
```

---

## 모듈별 책임

### `code.ts` (진입점)
```typescript
// 최소한의 초기화 및 메시지 라우팅
import { handleMessage } from './core/message-handler';
import { sendFileInfo } from './core/page-manager';

figma.showUI(__html__, { width: 400, height: 500 });
sendFileInfo();

figma.ui.onmessage = handleMessage;

figma.on('currentpagechange', sendFileInfo);
figma.on('documentchange', sendFileInfo);
```

### `core/message-handler.ts`
```typescript
// 메시지 타입별 라우팅
import { createFrameFromJSON } from '../converter';
import { createFrameFromHTML } from '../parser';
import { extractNodeToJSON } from '../extractor';

export async function handleMessage(msg: PluginMessage): Promise<void> {
  switch (msg.type) {
    case 'create-from-json':
      return handleCreateFromJSON(msg);
    case 'create-from-html':
      return handleCreateFromHTML(msg);
    // ...
  }
}
```

### `converter/index.ts`
```typescript
// JSON → Figma 변환 메인
export async function createFrameFromJSON(
  node: ExtractedNode,
  name?: string,
  position?: Position,
  pageId?: string
): Promise<FrameNode>;
```

### `converter/node-factory.ts`
```typescript
// 노드 타입별 생성
import { createTextNode } from './text';
import { createSvgNode } from './svg';
import { createImagePlaceholder } from './image';

export async function createFigmaNode(
  node: ExtractedNode,
  isRoot: boolean
): Promise<FrameNode | TextNode | null>;
```

### `styles/layout.ts`
```typescript
// 레이아웃 관련 스타일
export function applySizingMode(frame: FrameNode, styles: ComputedStyles, isRoot: boolean): void;
export function applyLayoutMode(frame: FrameNode, styles: ComputedStyles): void;
export function applyAlignment(frame: FrameNode, styles: ComputedStyles): void;
export function applyPadding(frame: FrameNode, styles: ComputedStyles): void;
```

### `styles/background.ts`
```typescript
// 배경/테두리 스타일
export function applyBackground(frame: FrameNode, styles: ComputedStyles, isRoot: boolean): void;
export function applyBorder(frame: FrameNode, styles: ComputedStyles): void;
```

### `styles/effects.ts`
```typescript
// 효과 스타일
export function applyCornerRadius(frame: FrameNode, styles: ComputedStyles): void;
export function applyBoxShadow(frame: FrameNode, styles: ComputedStyles): void;
export function parseBoxShadows(shadowStr: string): DropShadowEffect[];
```

---

## UI 분리 (ui.ts 719줄)

### 현재 ui.ts 관심사
1. WebSocket 연결 관리
2. 서버 상태 폴링
3. 메시지 핸들러
4. UI 상태 업데이트

### 분리 후
```
ui/
├── index.ts          # 진입점 (~50줄)
├── connection.ts     # WebSocket 관리 (~200줄)
├── handlers.ts       # 메시지 핸들러 (~250줄)
└── state.ts          # UI 상태 관리 (~150줄)
```

---

## 빌드 설정 변경

### build.ts

```typescript
// 변경 전: 단일 파일
entryPoints: ['src/code.ts', 'src/ui.ts']

// 변경 후: 동일 (esbuild가 import를 따라 번들링)
entryPoints: ['src/code.ts', 'src/ui.ts']

// bundle: true 옵션으로 모든 import가 단일 파일로 번들링됨
```

---

## 마이그레이션 단계

### Phase 1: 폴더 구조 생성
```bash
mkdir -p src/core src/converter src/styles src/parser src/extractor src/ui src/types
```

### Phase 2: 의존성 없는 모듈부터 분리
1. `styles/color.ts` - 색상 파싱 유틸리티
2. `styles/effects.ts` - 그림자 파싱
3. `styles/background.ts` - 배경/테두리
4. `styles/layout.ts` - 레이아웃
5. `styles/index.ts` - 통합 export

### Phase 3: 변환기 분리
1. `converter/text.ts`
2. `converter/svg.ts`
3. `converter/image.ts`
4. `converter/pseudo.ts`
5. `converter/node-factory.ts`
6. `converter/index.ts`

### Phase 4: 파서 분리
1. `parser/default-styles.ts`
2. `parser/style-parser.ts`
3. `parser/html-parser.ts`
4. `parser/index.ts`

### Phase 5: 추출기 분리
1. `extractor/visual-extractor.ts`
2. `extractor/layout-extractor.ts`
3. `extractor/text-extractor.ts`
4. `extractor/index.ts`

### Phase 6: 코어 분리
1. `core/page-manager.ts`
2. `core/message-handler.ts`
3. `code.ts` 리팩토링

### Phase 7: UI 분리
1. `ui/state.ts`
2. `ui/connection.ts`
3. `ui/handlers.ts`
4. `ui/index.ts`

---

## 예상 결과

### code.ts 관련 파일들
| 파일 | 예상 라인 수 |
|------|-------------|
| `code.ts` | ~30 |
| `core/page-manager.ts` | ~100 |
| `core/message-handler.ts` | ~150 |
| `converter/index.ts` | ~80 |
| `converter/node-factory.ts` | ~120 |
| `converter/text.ts` | ~80 |
| `converter/svg.ts` | ~60 |
| `converter/image.ts` | ~50 |
| `converter/pseudo.ts` | ~80 |
| `styles/layout.ts` | ~150 |
| `styles/background.ts` | ~80 |
| `styles/effects.ts` | ~120 |
| `styles/color.ts` | ~80 |
| `parser/index.ts` | ~80 |
| `parser/html-parser.ts` | ~200 |
| `parser/style-parser.ts` | ~150 |
| `parser/default-styles.ts` | ~80 |
| `extractor/index.ts` | ~80 |
| `extractor/text-extractor.ts` | ~100 |
| `extractor/layout-extractor.ts` | ~80 |
| `extractor/visual-extractor.ts` | ~120 |

### ui.ts 관련 파일들
| 파일 | 예상 라인 수 |
|------|-------------|
| `ui/index.ts` | ~50 |
| `ui/connection.ts` | ~200 |
| `ui/handlers.ts` | ~250 |
| `ui/state.ts` | ~150 |

**목표: 모든 파일 200줄 이하**

---

## CLAUDE.md 제약사항 준수

분리 후에도 반드시 준수해야 할 사항:

1. **`??` 연산자 사용 금지** - 모든 파일에서
2. **esbuild target: 'es2017'** 유지
3. **code.ts에서 브라우저 API 사용 금지**
4. **ui.ts에서 figma.* API 사용 금지**
