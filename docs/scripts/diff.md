# Diff 스크립트

**파일:** `dist/diff.standalone.js` (v1.0.0)
**전역 API:** `window.__sigma_diff__`
**소스:** `packages/shared/src/diff/core.ts` + `packages/shared/src/diff/snapshots.ts`
**엔트리:** `packages/shared/src/diff-standalone-entry.ts`

두 `ExtractedNode`를 구조적으로 비교하거나, 스냅샷을 저장하여 시점 간 변화를 추적하는 스크립트입니다.

> **의존성:** `extractElement()`를 번들에 포함하므로 독립 동작하지만, CSS 선택자로 스냅샷을 찍을 때 내부적으로 추출 로직을 사용합니다.

---

## 소스 모듈 구성

```
diff/
├── core.ts        # compare(), compareNodes(), 스타일/크기/속성/자식 비교
├── snapshots.ts   # saveSnapshot(), compareWithSnapshot(), 스냅샷 CRUD
└── index.ts       # Barrel export
```

---

## API 상세

### compare(nodeA, nodeB)

두 `ExtractedNode`의 구조적 차이를 비교합니다.

```typescript
const result = window.__sigma_diff__.compare(nodeA, nodeB);
// → DiffResult
```

**반환 타입:**
```typescript
interface DiffResult {
  equal: boolean;           // 차이 없음 여부
  differences: Difference[];
  summary: {
    added: number;          // 추가된 요소/속성 수
    removed: number;        // 제거된 요소/속성 수
    changed: number;        // 변경된 속성 수
    structure: number;      // 구조 변경 (태그, 자식 수) 수
  };
}

interface Difference {
  path: string;             // 예: "<div> > [0].styles.fontSize"
  type: 'added' | 'removed' | 'changed' | 'structure';
  description: string;      // 한국어 설명
  oldValue?: unknown;
  newValue?: unknown;
}
```

---

### snapshot(selectorOrNode)

현재 상태를 스냅샷으로 저장합니다.

```typescript
// CSS 선택자로 요소를 추출하여 저장
const snapId = window.__sigma_diff__.snapshot('.my-component');

// 또는 이미 추출된 ExtractedNode를 직접 저장
const snapId = window.__sigma_diff__.snapshot(extractedNode);
```

**반환:** `string` (스냅샷 ID, 형식: `snap-{counter}-{timestamp}`) 또는 `null` (요소 못 찾음)

**로직:**
1. 문자열이면 `document.querySelector()` → `extractElement()`로 추출
2. `ExtractedNode`면 직접 사용
3. 인메모리 `Map<string, Snapshot>`에 저장

---

### compareWithSnapshot(snapshotId, selectorOrNode)

이전 스냅샷과 현재 상태를 비교합니다.

```typescript
const diff = window.__sigma_diff__.compareWithSnapshot(snapId, '.my-component');
```

**로직:**
1. `snapshots.get(snapshotId)`로 이전 스냅샷 조회
2. 현재 상태 추출 (선택자면 DOM에서 추출, ExtractedNode면 직접 사용)
3. `compare(snap.node, currentNode)` 호출

---

### listSnapshots()

저장된 스냅샷 목록을 반환합니다.

```typescript
const list = window.__sigma_diff__.listSnapshots();
// → [{ id: "snap-1-...", selector: ".my-component", timestamp: 1711... }, ...]
```

---

### deleteSnapshot(id) / clearSnapshots()

```typescript
window.__sigma_diff__.deleteSnapshot('snap-1-...');  // 개별 삭제 → boolean
window.__sigma_diff__.clearSnapshots();               // 전체 삭제
```

---

## 비교 로직 상세

### compareNodes() — 재귀 비교

노드 하나를 비교할 때 아래 순서로 검사합니다:

```
1. 태그 변경 (tagName)
   → type: "structure", "태그 변경: <div> → <span>"

2. 텍스트 변경 (textContent)
   → type: "changed", 최대 100자까지 표시

3. 클래스 변경 (className)
   → type: "changed"

4. 스타일 비교 (compareStyles)
   → 22개 핵심 속성만 비교

5. 크기 변경 (compareBoundingRect)
   → 1px 이상 차이 시 보고

6. 위치 변경
   → 1px 이상 차이 시 보고

7. 속성 비교 (compareAttributes)
   → style, class 제외한 HTML 속성
   → 추가/제거/변경 감지

8. 자식 노드 비교 (compareChildren)
   → 인덱스 기반 1:1 매칭
   → 수가 다르면 structure 차이 기록
   → 각 자식에 대해 재귀 compareNodes()
```

### compareStyles() — 비교 대상 속성 (22개)

| 카테고리 | 속성 |
|----------|------|
| 레이아웃 | `display`, `position`, `flexDirection`, `justifyContent`, `alignItems`, `gap` |
| 간격 | `paddingTop/Right/Bottom/Left`, `marginTop/Right/Bottom/Left` |
| 색상 | `backgroundColor`, `color` |
| 텍스트 | `fontSize`, `fontFamily`, `fontWeight` |
| 테두리 | `borderTopWidth`, `borderTopLeftRadius` |
| 기타 | `opacity`, `boxShadow` |

> 40개 이상 추출되는 전체 속성 중 시각적으로 중요한 22개만 비교합니다.

### 값 비교 로직: isEqual()

| 타입 | 비교 방법 |
|------|-----------|
| 원시값 | `===` |
| RGBA 객체 | 각 채널(r,g,b,a) 차이 < 0.01 |
| 숫자 | 차이 < 0.5 (소수점 오차 허용) |
| 그 외 객체 | `false` (불일치) |

### 크기/위치 비교

- **크기:** `width`/`height` 차이 > 1px 시 보고
- **위치:** `x`/`y` 차이 > 1px 시 보고
- 값은 `Math.round()`로 정수 표시

---

## 스냅샷 저장소

**파일:** `diff/snapshots.ts`

스냅샷은 **인메모리 `Map`**에 저장됩니다. 페이지를 새로고침하면 사라집니다.

```typescript
interface Snapshot {
  id: string;              // "snap-{counter}-{timestamp}"
  selector: string;        // CSS 선택자 또는 className 기반 레이블
  timestamp: number;       // Date.now()
  node: ExtractedNode;     // 추출된 노드 전체 트리
}
```

- counter는 0부터 시작, `clearSnapshots()` 시 리셋
- selector는 입력이 문자열이면 그대로, ExtractedNode면 className 기반으로 생성

---

## 사용 예시

### 코드 변경 전후 비교

```javascript
// 1. 스크립트 inject
await page.addScriptTag({ path: extractorPath });
await page.addScriptTag({ path: diffPath });

// 2. 변경 전 스냅샷
const snapId = await page.evaluate(() =>
  window.__sigma_diff__.snapshot('.login-form')
);

// 3. 코드 변경 적용 (CSS 수정, 컴포넌트 업데이트 등)
// ...

// 4. 변경 후 비교
const diff = await page.evaluate(
  (id) => window.__sigma_diff__.compareWithSnapshot(id, '.login-form'),
  snapId
);

console.log(diff.summary);
// → { added: 0, removed: 0, changed: 3, structure: 0 }

for (const d of diff.differences) {
  console.log(`${d.path}: ${d.description}`);
}
// → ".login-form.styles.backgroundColor: 스타일 변경: backgroundColor"
// → ".login-form > [0].size: 크기 변경: 200×40 → 240×48"
```

### 두 추출 결과 직접 비교

```javascript
const nodeA = await page.evaluate(() =>
  window.__sigma__.extract('.component-v1')
);
const nodeB = await page.evaluate(() =>
  window.__sigma__.extract('.component-v2')
);

const diff = await page.evaluate(
  (a, b) => window.__sigma_diff__.compare(a, b),
  nodeA, nodeB
);
```
