# 임베드 스크립트 API

Playwright의 `addScriptTag()`로 웹페이지에 inject하여 사용하는 자체 완결형 JS 번들입니다.
AI Agent가 브라우저를 자동화할 때 DOM 추출, Storybook 탐색, 컴포넌트 비교를 수행합니다.

## 스크립트 경로 확인

MCP 도구 `sigma_get_playwright_scripts`를 호출하면 각 스크립트의 경로와 API 정보를 반환합니다.

```javascript
// 스크립트 inject 예시
await page.addScriptTag({ path: '/path/to/extractor.standalone.js' });
```

**소스 위치:** `packages/shared/src/` → `packages/shared/dist/`에 빌드

> 각 스크립트의 내부 로직 상세는 개별 문서를 참조하세요:
> - [Extractor 스크립트 상세](scripts/extractor.md) — 추출 로직, 가시성 판단, 텍스트 병합, SVG 처리
> - [Storybook 스크립트 상세](scripts/storybook.md) — Channel API, SPA 전환, 추출+저장 워크플로우
> - [Diff 스크립트 상세](scripts/diff.md) — 비교 알고리즘, 스냅샷 저장소, 허용 오차

---

## Extractor — `window.__sigma__`

**파일:** `dist/extractor.standalone.js`
**소스:** `src/extractor/core.ts` + `src/discovery/core.ts`

DOM 요소를 ExtractedNode JSON으로 추출하고, 페이지 내 요소를 탐색합니다.

### 추출 API

| 메서드 | 설명 | 반환 |
|--------|------|------|
| `extract(selectorOrElement)` | CSS 선택자 또는 Element로 요소 추출 | `ExtractedNode` |
| `extractAt(x, y)` | 좌표로 요소 추출 | `ExtractedNode` |
| `extractAll(selector)` | 선택자 매칭 모든 요소 추출 | `ExtractedNode[]` |
| `extractVisible(options?)` | 화면에 보이는 요소 추출 | `ExtractedNode[]` |
| `extractAndSave(name, selectorOrElement, serverUrl?)` | 추출 + 서버 저장, 저장 결과 반환 | `Promise<SaveResult>` |

**extractVisible 옵션:**
```javascript
window.__sigma__.extractVisible({
  minWidth: 100,   // 최소 너비 (기본값 없음)
  minHeight: 100   // 최소 높이 (기본값 없음)
});
```

### 탐색 API (Discovery)

| 메서드 | 설명 | 반환 |
|--------|------|------|
| `findByText(text, tagName?)` | 텍스트 내용으로 요소 검색 (첫 매칭) | `ElementInfo \| null` |
| `findByAlt(altText)` | alt 텍스트로 요소 검색 (첫 매칭) | `ElementInfo \| null` |
| `findForm(action?)` | 폼 요소 검색 | `ElementInfo \| null` |
| `findContainer(options)` | 컨테이너 요소 검색 | `ElementInfo \| null` |
| `getElementInfo(selector)` | 요소 상세 정보 | `ElementInfo \| null` |
| `getPageStructure()` | 페이지 전체 구조 | `PageStructure` |
| `getDesignTokens(selectorOrElement?)` | CSS 변수 기반 디자인 토큰 | `Record<string, string>` |

### 사용 예시

```javascript
// 1. 스크립트 inject
await page.addScriptTag({ path: extractorPath });

// 2. 특정 요소 추출
const data = await page.evaluate(() =>
  window.__sigma__.extract('.my-component')
);

// 3. 텍스트로 요소 찾기 (첫 매칭 1건)
const element = await page.evaluate(() =>
  window.__sigma__.findByText('로그인')
);

// 4. 페이지 구조 파악
const structure = await page.evaluate(() =>
  window.__sigma__.getPageStructure()
);
```

---

## Storybook — `window.__sigma_storybook__`

**파일:** `dist/storybook.standalone.js`
**소스:** `src/storybook/core.ts`

Storybook에서 story를 탐색하고, SPA 방식으로 전환하며, 추출+서버 저장까지 수행합니다.

### API

| 메서드 | 실행 위치 | 설명 | 반환 |
|--------|-----------|------|------|
| `getStories(baseUrl?)` | 메인 프레임 | story 목록 조회 | `Story[]` |
| `navigateToStory(storyId, options?)` | 메인 프레임 | SPA story 전환 + 렌더링 대기 | `Promise<boolean>` |
| `waitForStoryRendered(timeout?)` | 메인 프레임 | 렌더링 완료 대기 | `Promise<boolean>` |
| `extractStory(selector?)` | iframe | ExtractedNode 추출 | `ExtractedNode` |
| `extractAndSave(name, serverUrl?, selector?)` | iframe | 추출 + 서버 저장 | `Promise<SaveResult>` |
| `getStoryRoot()` | iframe | story 루트 요소 | `Element` |
| `getCurrentStoryId()` | 메인 프레임 | 현재 story ID | `string` |
| `getStoryIframeUrl(storyId, baseUrl?)` | 메인 프레임 | story iframe URL 생성 | `string` |

> **`SaveResult`는 문자열이 아닙니다** (`src/storybook/core.ts:125-129`):
> ```ts
> { success: boolean; id?: string; error?: string }
> ```
> 저장 ID는 `result.id`로 꺼냅니다. `sigma_import_saved(token, id)`에 반환값을 통째로 넘기면
> 객체가 전달돼 실패합니다. **`result.success === false`를 먼저 확인하고 `result.error`를 읽으세요** —
> 이걸 건너뛰면 저장 실패가 조용히 넘어갑니다.
>
> `navigateToStory`/`waitForStoryRendered`의 `boolean`도 같은 성격입니다. `false`는 렌더링 대기가
> 시간 안에 끝나지 않았다는 뜻이므로, 그 상태로 추출하면 빈 결과가 나옵니다.

### 사용 패턴 (SPA 방식 필수)

```javascript
// 1. 메인 Storybook 페이지 로드 (1회만)
await page.goto('http://localhost:6006');

// 2. 메인 프레임에 스크립트 inject (1회만)
await page.addScriptTag({ path: storybookPath });

// 3. story 목록 조회
const stories = await page.evaluate(() =>
  window.__sigma_storybook__.getStories()
);

// 4. 각 story 처리
for (const story of stories) {
  // SPA 전환 (page.goto 사용 금지!)
  await page.evaluate(
    (id) => window.__sigma_storybook__.navigateToStory(id),
    story.id
  );

  // iframe에서 추출 + 서버 저장
  const iframe = page.frameLocator('#storybook-preview-iframe');
  // iframe에는 storybook.standalone.js 만 inject 하면 된다 —
  // 이 번들은 추출기(extractElement)를 안에 품고 있어 자기완결적이다 (core.ts:9).
  // (대조: diff.standalone.js 는 extractor.standalone.js 선행 로드가 필요하다)
  const saved = await iframe.evaluate(() =>
    window.__sigma_storybook__.extractAndSave('ComponentName')
  );
  if (!saved.success) throw new Error(saved.error);

  // Figma에 임포트
  // sigma_import_saved(token, saved.id)
}
```

### 주의사항

```javascript
// ❌ page.goto로 각 story 직접 이동 — Chrome 렌더러 메모리 폭발 (40회 시 4.4GB)
for (const story of stories) {
  await page.goto(`http://localhost:6006/iframe.html?id=${story.id}`);
}

// ✅ navigateToStory로 SPA 전환 — 메인 프레임 유지
await page.evaluate(
  (id) => window.__sigma_storybook__.navigateToStory(id),
  story.id
);
```

---

## Diff — `window.__sigma_diff__`

**파일:** `dist/diff.standalone.js`
**소스:** `src/diff/core.ts` + `src/diff/snapshots.ts`

두 ExtractedNode를 비교하거나, 스냅샷을 저장하여 시점 간 변화를 추적합니다.

### API

| 메서드 | 설명 | 반환 |
|--------|------|------|
| `compare(nodeA, nodeB)` | 두 ExtractedNode 비교 | `DiffResult` |
| `snapshot(selectorOrNode)` | 요소/노드 스냅샷 저장 | `string` (snapshotId) |
| `compareWithSnapshot(snapshotId, selectorOrNode)` | 스냅샷과 현재 상태 비교 | `DiffResult` |
| `listSnapshots()` | 저장된 스냅샷 목록 | `SnapshotInfo[]` |
| `deleteSnapshot(id)` | 스냅샷 삭제 | `void` |
| `clearSnapshots()` | 모든 스냅샷 삭제 | `void` |

### 사용 예시

```javascript
// 1. 초기 상태 스냅샷
const snapshotId = await page.evaluate(() =>
  window.__sigma_diff__.snapshot('.my-component')
);

// 2. (사용자 조작 또는 코드 변경)

// 3. 변경 사항 비교
const diff = await page.evaluate(
  (id) => window.__sigma_diff__.compareWithSnapshot(id, '.my-component'),
  snapshotId
);
```

---

## 추출 로직 직접 작성 금지

임베드 스크립트를 사용하지 않고 `page.evaluate()`로 직접 DOM 추출 로직을 작성하는 것은 금지입니다.

```javascript
// ❌ 직접 작성 금지
await page.evaluate(() => {
  function extractElement(el) { /* ... */ }
});

// ✅ 반드시 임베드 스크립트 사용
await page.addScriptTag({ path: extractorPath });
const data = await page.evaluate(() => window.__sigma__.extract('.selector'));
```

이유:
- `@sigma/shared`의 추출 로직이 Single Source of Truth
- 40개 이상의 CSS 속성, SVG, 의사요소 등 edge case 처리 포함
- Extension과 Playwright 자동화가 동일한 결과를 보장
