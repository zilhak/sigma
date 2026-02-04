# Chrome Extension 구조화 계획

## 현재 구조 분석

### 파일별 라인 수
| 파일 | 라인 수 | 상태 |
|------|---------|------|
| `content.ts` | 764 | **과대** - 분리 필요 |
| `injected.ts` | 270 | 적정 |
| `background.ts` | 205 | 적정 |
| `popup/popup.ts` | 174 | 적정 |

### content.ts 관심사 분석

현재 `content.ts`에 뭉쳐있는 기능들:

1. **선택 모드 관리** (약 150줄)
   - `startSelectMode()`, `stopSelectMode()`
   - `createOverlay()`, `removeOverlay()`, `updateOverlay()`
   - `onMouseMove()`, `onClick()`, `onKeyDown()`

2. **DOM 추출 로직** (약 200줄)
   - `extractElement()`
   - `getClassName()`, `getDirectTextContent()`, `getAttributes()`
   - `isElementVisible()`

3. **스타일 추출** (약 150줄)
   - `extractStyles()`
   - `parseSize()`, `parseAutoSize()`
   - `resolveColorValue()`, `parseComputedLength()`

4. **SVG 처리** (약 100줄)
   - `serializeSvgWithComputedStyles()`
   - `applySvgComputedStyles()`

5. **Pseudo Element 처리** (약 100줄)
   - `extractPseudoElements()`
   - `extractPseudoElement()`
   - `extractPseudoStyles()`

6. **유틸리티** (약 50줄)
   - `generateId()`
   - 이벤트 리스너 설정

---

## 제안 구조

```
packages/chrome-extension/
├── src/
│   ├── background.ts              # Service Worker (유지)
│   ├── injected.ts                # 페이지 주입 API (유지)
│   │
│   ├── content/                   # Content Script 분리
│   │   ├── index.ts               # 진입점, 이벤트 리스너 설정
│   │   ├── select-mode.ts         # 선택 모드 관리
│   │   ├── overlay.ts             # 오버레이 UI
│   │   └── commands.ts            # 명령어 핸들러
│   │
│   ├── extractor/                 # 추출 로직
│   │   ├── index.ts               # extractElement 메인 함수
│   │   ├── styles.ts              # 스타일 추출
│   │   ├── svg.ts                 # SVG 직렬화
│   │   ├── pseudo.ts              # Pseudo element 처리
│   │   └── utils.ts               # 유틸리티 (parseSize 등)
│   │
│   ├── popup/                     # Popup UI (유지)
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── popup.css
│   │
│   └── types/                     # 로컬 타입 정의
│       └── index.ts
│
├── build.ts                       # esbuild 설정
├── manifest.json
└── package.json
```

---

## 모듈별 책임

### `content/index.ts`
```typescript
// 진입점 - 최소한의 초기화 코드만
import { setupCommandListeners } from './commands';
import { injectPageScript } from './inject';

injectPageScript();
setupCommandListeners();
```

### `content/select-mode.ts`
```typescript
// 선택 모드 상태 관리
export function startSelectMode(): void;
export function stopSelectMode(): void;
export function isSelectModeActive(): boolean;
```

### `content/overlay.ts`
```typescript
// 오버레이 UI 관리
export function createOverlay(): HTMLDivElement;
export function removeOverlay(): void;
export function updateOverlay(element: HTMLElement): void;
```

### `extractor/index.ts`
```typescript
// 메인 추출 함수
import { extractStyles } from './styles';
import { serializeSvg } from './svg';
import { extractPseudoElements } from './pseudo';

export function extractElement(element: HTMLElement | SVGElement): ExtractedNode | null;
```

### `extractor/styles.ts`
```typescript
// CSS 스타일 추출
export function extractStyles(style: CSSStyleDeclaration): ComputedStyles;
export function parseSize(value: string): number;
export function parseAutoSize(value: string): number | 'auto';
export function resolveColorValue(color: string): string;
```

### `extractor/svg.ts`
```typescript
// SVG 처리
export function serializeSvgWithComputedStyles(svg: SVGSVGElement): string;
export function applySvgComputedStyles(original: SVGElement, clone: SVGElement): void;
```

### `extractor/pseudo.ts`
```typescript
// Pseudo element 처리
export function extractPseudoElements(element: HTMLElement): ExtractedNode[];
export function extractPseudoElement(element: HTMLElement, pseudo: '::before' | '::after'): ExtractedNode | null;
```

---

## 빌드 설정 변경

### build.ts 수정사항

```typescript
// 현재: 단일 진입점
entryPoints: ['src/content.ts', 'src/background.ts', 'src/injected.ts']

// 변경 후: content는 index.ts에서 번들링
entryPoints: [
  'src/content/index.ts',  // 여러 파일을 번들링하여 단일 content.js 생성
  'src/background.ts',
  'src/injected.ts'
]
```

esbuild의 `bundle: true` 옵션으로 import된 모든 모듈이 단일 파일로 번들링됨.

---

## 마이그레이션 단계

### Phase 1: 폴더 구조 생성
```bash
mkdir -p src/content src/extractor src/types
```

### Phase 2: 파일 분리 (의존성 순서)
1. `src/extractor/utils.ts` - 의존성 없는 유틸리티
2. `src/extractor/styles.ts` - utils에 의존
3. `src/extractor/svg.ts` - styles에 의존
4. `src/extractor/pseudo.ts` - styles에 의존
5. `src/extractor/index.ts` - 위 모든 모듈 통합
6. `src/content/overlay.ts` - 독립적
7. `src/content/select-mode.ts` - overlay에 의존
8. `src/content/commands.ts` - extractor, select-mode에 의존
9. `src/content/index.ts` - 진입점

### Phase 3: 빌드 및 테스트
1. `bun run build`
2. Chrome에서 Extension 리로드
3. 추출 기능 테스트

---

## 예상 결과

| 파일 | 예상 라인 수 |
|------|-------------|
| `content/index.ts` | ~20 |
| `content/select-mode.ts` | ~50 |
| `content/overlay.ts` | ~60 |
| `content/commands.ts` | ~80 |
| `extractor/index.ts` | ~100 |
| `extractor/styles.ts` | ~150 |
| `extractor/svg.ts` | ~100 |
| `extractor/pseudo.ts` | ~100 |
| `extractor/utils.ts` | ~50 |

**목표: 모든 파일 150줄 이하**
