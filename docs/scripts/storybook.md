# Storybook 스크립트

**파일:** `dist/storybook.standalone.js` (v1.3.0)
**전역 API:** `window.__sigma_storybook__`
**소스:** `packages/shared/src/storybook/core.ts`
**엔트리:** `packages/shared/src/storybook-standalone-entry.ts`

Storybook 환경에서 story 목록 조회, SPA 방식 story 전환, 컴포넌트 추출+서버 저장을 지원하는 스크립트입니다.

> 이 스크립트는 내부적으로 `extractElement()`를 번들에 포함하므로, `extractor.standalone.js` 없이 독립 동작합니다.

---

## 실행 환경

Storybook은 **메인 프레임**과 **preview iframe** 두 개의 프레임으로 구성됩니다. 각 API는 실행 위치가 다릅니다.

| 실행 위치 | API | 설명 |
|-----------|-----|------|
| 메인 프레임 | `getStories()` | `/index.json`에서 story 목록 fetch |
| 메인 프레임 | `navigateToStory()` | Channel API로 SPA story 전환 |
| 메인 프레임 | `waitForStoryRendered()` | Channel 이벤트로 렌더링 완료 감지 |
| 메인 프레임 | `getCurrentStoryId()` | URL에서 story ID 추출 |
| 메인 프레임 | `getStoryIframeUrl()` | story iframe URL 생성 |
| iframe | `getStoryRoot()` | `#storybook-root` 컨테이너 반환 |
| iframe | `extractStory()` | 렌더링된 story → ExtractedNode 추출 |
| iframe | `extractAndSave()` | 추출 + 서버 저장 (ID 반환) |
| 양쪽 | `waitForStoryRendered()` | 메인=Channel, iframe=DOM 폴링 |

---

## API 상세

### getStories(baseUrl?)

Storybook의 `/index.json` 엔드포인트에서 story 목록을 조회합니다.

```typescript
const stories = await window.__sigma_storybook__.getStories();
// → StoryEntry[]
```

**반환 타입:**
```typescript
interface StoryEntry {
  id: string;          // "button--primary"
  title: string;       // "Button"
  name: string;        // "Primary"
  type: string;        // "story" | "docs"
  importPath?: string; // "./src/Button.stories.tsx"
  tags?: string[];     // ["autodocs"]
}
```

**로직:**
1. `{baseUrl}/index.json` fetch (기본: `window.location.origin`)
2. `StorybookIndex` 파싱 (`{ v: number, entries: Record<string, StoryEntry> }`)
3. `type === 'story'`만 필터링 (docs 제외)

---

### navigateToStory(storyId, options?)

Storybook Channel API를 통해 story를 SPA 방식으로 전환합니다.

```typescript
const success = await window.__sigma_storybook__.navigateToStory('button--primary', {
  timeout: 10000  // 기본값
});
```

**로직:**
1. `window.__STORYBOOK_ADDONS_CHANNEL__` 가져오기 (메인 프레임에서만 존재)
2. `storyRendered` 이벤트 대기 등록 (Promise + timeout)
3. `setCurrentStory` 이벤트 emit (`{ storyId }`)
4. `storyRendered` 이벤트 수신 시 `true` 반환, 타임아웃 시 `false` + 경고

**Channel API 동작 원리:**
- Storybook 7+에서 `__STORYBOOK_ADDONS_CHANNEL__`은 메인 프레임과 iframe 간 이벤트 버스
- `setCurrentStory` emit → Storybook이 iframe src를 변경 → 렌더링 완료 시 `storyRendered` emit

> **`page.goto()` 대신 반드시 이 함수를 사용해야 합니다.** `page.goto()`로 각 story 직접 이동 시 Chrome 렌더러 메모리가 폭발합니다 (40회 반복 시 4.4GB, CPU 100%).

---

### waitForStoryRendered(timeout?)

Story 렌더링 완료를 대기합니다. 실행 환경에 따라 다른 전략을 사용합니다.

```typescript
const rendered = await window.__sigma_storybook__.waitForStoryRendered(5000);
```

| 환경 | 전략 | 감지 방법 |
|------|------|-----------|
| 메인 프레임 | Channel API | `storyRendered` 이벤트 수신 |
| iframe | DOM 폴링 | `#storybook-root.children.length > 0`이 될 때까지 `requestAnimationFrame` |

---

### extractStory(selector?)

현재 iframe에서 렌더링된 story를 `ExtractedNode`로 추출합니다.

```typescript
const node = window.__sigma_storybook__.extractStory();
// 또는 특정 셀렉터
const node = window.__sigma_storybook__.extractStory('.my-component');
```

**로직:**
1. `selector` 지정 시 해당 요소 선택
2. 미지정 시 `#storybook-root`의 **첫 번째 자식 요소** 선택
3. `extractElement()` 호출 (extractor core 공유)

---

### extractAndSave(name, serverUrl?, selector?)

Story를 추출하여 Sigma 서버에 저장하고, 저장된 ID를 반환합니다.

```typescript
const result = await window.__sigma_storybook__.extractAndSave(
  'Components/CCBadge/Default',
  'http://localhost:19832'  // 기본값
);
// → { success: true, id: "abc123" }
// → { success: false, error: "extraction failed" }
```

**로직:**
1. `extractStory(selector)` 호출
2. 실패 시 `{ success: false, error: "extraction failed" }` 반환
3. `POST {serverUrl}/api/extracted`로 JSON 전송:
   ```json
   { "name": "...", "data": ExtractedNode, "format": "json", "timestamp": ... }
   ```
4. 응답에서 `component.id` 추출하여 반환

**반환 타입:**
```typescript
interface SaveResult {
  success: boolean;
  id?: string;     // 서버에서 할당한 컴포넌트 ID
  error?: string;  // 실패 시 에러 메시지
}
```

---

### getStoryRoot()

Storybook iframe 내의 `#storybook-root` 컨테이너를 반환합니다.

```typescript
const root = window.__sigma_storybook__.getStoryRoot();
// → HTMLElement | null
```

---

### getCurrentStoryId()

현재 URL의 query parameter에서 story ID를 추출합니다.

```typescript
// URL: iframe.html?id=button--primary&viewMode=story
window.__sigma_storybook__.getCurrentStoryId();
// → "button--primary"
```

---

### getStoryIframeUrl(storyId, baseUrl?)

Story ID로 iframe URL을 생성합니다.

```typescript
window.__sigma_storybook__.getStoryIframeUrl('button--primary');
// → "http://localhost:6006/iframe.html?id=button--primary&viewMode=story"
```

---

## 전체 워크플로우

```javascript
// 1. 메인 Storybook 페이지 로드 (1회)
await page.goto('http://localhost:6006');

// 2. 메인 프레임에 스크립트 inject (1회)
await page.addScriptTag({ path: storybookPath });

// 3. story 목록 조회
const stories = await page.evaluate(() =>
  window.__sigma_storybook__.getStories()
);

// 4. 각 story 처리
for (const story of stories) {
  // 4-1. SPA 전환 (메인 프레임)
  await page.evaluate(
    (id) => window.__sigma_storybook__.navigateToStory(id),
    story.id
  );

  // 4-2. iframe 참조
  const iframe = page.frames().find(f => f.url().includes('iframe.html'));

  // 4-3. iframe에 스크립트 inject
  await iframe.addScriptTag({ path: storybookPath });

  // 4-4. 추출 + 서버 저장
  const result = await iframe.evaluate(
    (name) => window.__sigma_storybook__.extractAndSave(name),
    `${story.title}/${story.name}`
  );

  // 4-5. Figma에 임포트 (Sigma MCP)
  if (result.success) {
    // sigma_import_file(token, result.id)
  }
}
```

---

## 내부 헬퍼: waitForChannelEvent()

Channel API에서 특정 이벤트를 Promise로 대기하는 유틸리티입니다.

```typescript
function waitForChannelEvent(channel, event, timeout): Promise<boolean>
```

- `channel.on(event, callback)` 등록
- 이벤트 수신 시 `true` + cleanup
- 타임아웃 시 `false` + cleanup
- `navigateToStory()`와 `waitForStoryRendered()`에서 공용
