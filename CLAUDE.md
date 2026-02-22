# Sigma - Modular Design-to-Code Bridge

웹 컴포넌트를 추출하고 Figma와 AI Agent가 상호작용할 수 있는 모듈형 시스템.
각 모듈은 독립적으로 동작하면서도, 로컬 서버를 중심으로 연결되면 자동화 파이프라인이 된다.

---

## 유비쿼터스 언어

| 용어 | 정의 | 패키지 |
|------|------|--------|
| **Sigma 플러그인** | Figma Plugin — JSON/HTML을 Figma 프레임으로 변환 | `@sigma/figma-plugin` |
| **Sigma 서버** | 중앙 서버 — MCP, HTTP API, WebSocket 통신 허브 | `@sigma/server` |
| **Sigma 확장** | Chrome Extension — 웹 컴포넌트 추출 (사용자 수동) | `@sigma/chrome-extension` |
| **Sigma 임베드 스크립트** | `addScriptTag()`로 주입하는 자체 완결형 JS 번들. AI Agent/Playwright 자동화용 | `@sigma/shared` → `dist/` |
| **추출 스크립트** | `window.__sigma__` API로 DOM → ExtractedNode JSON 추출 | `dist/extractor.standalone.js` |
| **Storybook 스크립트** | `window.__sigma_storybook__` API로 story 목록 조회, SPA 전환, 추출+서버 저장 | `dist/storybook.standalone.js` |

---

## Claude Code 작업 지침

### MCP 서버 재시작 금지 (CRITICAL)

**절대로 Sigma MCP 서버를 재시작하지 마라.**

Claude Code에서 MCP 서버를 종료하거나 재시작하면:
1. Agent와 MCP 서버의 연결이 끊어짐
2. 재연결 방법이 **존재하지 않음**
3. Sigma MCP 도구들은 세션이 끝날 때까지 사용 불가

서버 코드를 수정했다면 → 사용자에게 Claude Code 재시작을 안내하거나, 터미널에서 직접 서버 재시작 후 `/mcp`로 재연결하도록 유도.

### Figma Plugin 코드 제약

Figma Plugin의 `code.ts`는 Figma Sandbox에서 실행된다:
- `??` (nullish coalescing) 사용 금지 → 삼항 연산자로 대체
- `?.` (optional chaining)은 사용 가능
- 브라우저 API (DOM, fetch 등) 접근 불가 — 이는 `ui.ts` (iframe) 에서만 가능

### 임시 파일 저장 규칙

Claude가 생성하는 모든 임시 파일, 스크린샷, 작업 문서는 **프로젝트 루트의 `.claude/` 폴더**에 저장한다. 이 폴더는 global gitignore에 등록되어 소스코드에 포함되지 않음.

### 시각적 결과 검증 프로토콜

시각적 변환 작업(웹→Figma 등)의 결과를 검증할 때:

1. **사전 준비**: 핵심 요소 목록 작성
2. **원본-결과 병렬 비교**: 반드시 원본/결과 스크린샷을 나란히 비교
3. **체크리스트 검증**: 각 요소에 PASS/FAIL만 사용
4. **결과 보고**: 표 형식으로 보고, "성공적으로 완료" 같은 모호한 표현 금지

단순 속성 변경(크기, 위치 등)은 `sigma_get_tree`로 데이터 기반 확인. 스크린샷은 시각적 품질 검증이 필요할 때만 사용.

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              AI Agent                                    │
│                         (Claude Code + MCP)                              │
│                                                                          │
│  ┌──────────────────┐              ┌──────────────────┐                 │
│  │   Playwright MCP │              │    Sigma MCP     │                 │
│  │  (브라우저 제어)  │              │  (데이터 + Figma) │                 │
│  └────────┬─────────┘              └────────┬─────────┘                 │
└───────────│────────────────────────────────│────────────────────────────┘
            │                                │
            │ 브라우저 직접 조종              │ stdio
            ▼                                ▼
┌───────────────────────────┐    ┌────────────────────────────────────────┐
│      Chrome Browser       │    │            Local Server                 │
│  ┌─────────────────────┐  │    │         http://localhost:19832           │
│  │   Chrome Extension  │  │    │                                         │
│  │  (컴포넌트 추출)     │──────────▶  HTTP API / WebSocket / MCP         │
│  └─────────────────────┘  │POST│                                         │
│  ┌─────────────────────┐  │    │         File Storage                    │
│  │     Web Page        │  │    │         ~/.sigma/extracted/              │
│  └─────────────────────┘  │    └────────────────────────────│───────────┘
└───────────────────────────┘                                 │ WebSocket
                                                              ▼
                                              ┌────────────────────────────┐
                                              │       Figma Plugin         │
                                              │   (JSON → Figma Frame)     │
                                              └────────────────────────────┘
```

**통신 흐름:**
- **Extension → Server**: Extension이 서버로 데이터를 단방향 Push (POST)
- **Playwright → Browser**: Playwright MCP가 브라우저를 직접 조종
- **Server ↔ Figma Plugin**: WebSocket 양방향 통신 (명령 전달 + 결과 응답)
- **Agent → Server**: MCP (stdio)로 도구 호출

---

## Sigma MCP 도구 목록

### 인증 (토큰 발급 → 바인딩 → 작업)

| 도구 | 설명 | 필수 인자 |
|------|------|-----------|
| `sigma_login` | 토큰 발급 (10분 유효, 사용 시 갱신) | — |
| `sigma_logout` | 토큰 삭제 | `token` |
| `sigma_bind` | 토큰을 특정 플러그인+페이지에 바인딩 | `token`, `pluginId`, `pageId` |
| `sigma_status` | 토큰 상태 및 바인딩 정보 확인 | `token` |

### 플러그인/페이지 정보

| 도구 | 설명 | 필수 인자 |
|------|------|-----------|
| `sigma_list_plugins` | 연결된 Figma Plugin 목록 | — |
| `sigma_list_pages` | 플러그인의 페이지 목록 | `pluginId` |

### 노드 생성 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_create_frame` | ExtractedNode JSON/HTML로 프레임 생성 | `token` | `data`, `format`, `name`, `position` |
| `sigma_import_file` | 서버에 저장된 데이터로 프레임 생성 | `token`, `id` | `name`, `position` |
| `sigma_create_rectangle` | 사각형 생성 | `token`, `x`, `y`, `width`, `height` | `name`, `fillColor`, `strokeColor`, `strokeWeight`, `cornerRadius`, `parentId` |
| `sigma_create_text` | 텍스트 노드 생성 (폰트 자동 로드) | `token`, `x`, `y`, `text` | `name`, `fontSize`, `fontFamily`, `fontWeight`, `fontColor`, `textAlignHorizontal`, `parentId` |
| `sigma_create_empty_frame` | 빈 프레임 생성 (Auto Layout 지원) | `token`, `x`, `y`, `width`, `height` | `name`, `layoutMode`, `padding*`, `itemSpacing`, `fillColor`, `cornerRadius`, `layoutWrap`, `counterAxisSpacing`, `layoutSizing*`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `parentId` |
| `sigma_create_section` | Section 생성 | `token`, `name` | `position`, `size`, `children`, `fills` |
| `sigma_create_component_instance` | 컴포넌트 인스턴스 생성 (로컬/라이브러리) | `token`, `componentKey`, `x`, `y` | `parentId` |

### 노드 조작 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_modify_node` | 노드에 개별 메서드 실행 | `token`, `nodeId`, `method` | `args` |
| `sigma_batch_modify` | 여러 노드에 modify 일괄 실행 | `token`, `operations` | — |
| `sigma_update_frame` | 프레임 내용을 새 데이터로 전체 교체 | `token`, `nodeId` | `data`, `format`, `name` |
| `sigma_delete_frame` | 프레임 삭제 | `token`, `nodeId` | — |
| `sigma_batch_delete` | 여러 노드 일괄 삭제 | `token`, `nodeIds` | — |
| `sigma_move_node` | 노드를 다른 부모로 이동 (reparent) | `token`, `nodeId`, `parentId` | `index` |
| `sigma_clone_node` | 노드 복제 | `token`, `nodeId` | `parentId`, `position`, `name` |
| `sigma_set_multiple_text_contents` | 여러 텍스트 노드 내용 일괄 변경 | `token`, `items` | — |

**`sigma_modify_node` 지원 메서드:**
- **Basic**: rename, resize, move, setOpacity, setVisible, setLocked, remove
- **Visual**: setFills, setSolidFill, setStrokes, setStrokeWeight, setCornerRadius, setCornerRadii, setEffects, setBlendMode, setCornerSmoothing, setDashPattern, setMask
- **Transform**: setRotation
- **Layout (Frame)**: setLayoutMode, setPadding, setItemSpacing, setClipsContent, setPrimaryAxisSizingMode, setCounterAxisSizingMode, setPrimaryAxisAlignItems, setCounterAxisAlignItems, setLayoutWrap, setCounterAxisSpacing, setLayoutSizing
- **Layout (Child)**: setLayoutAlign, setLayoutGrow, setLayoutPositioning
- **Constraints**: setConstraints, setMinWidth, setMaxWidth, setMinHeight, setMaxHeight
- **Text**: setCharacters, setFontSize, setTextAlignHorizontal, setTextAlignVertical, setFontFamily, setFontWeight, setTextAutoResize, setLineHeight, setLetterSpacing
- **Rich Text (Range)**: setRangeFontSize, setRangeFontName, setRangeFills, setRangeTextDecoration, setRangeLineHeight, setRangeLetterSpacing

### 조회/검색 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_frames` | 페이지의 모든 프레임 위치/크기 조회 | `token` | — |
| `sigma_find_node` | 경로/이름으로 노드 검색 | `token`, `path` | `type` |
| `sigma_get_tree` | 문서 계층 구조 탐색 | `token` | `nodeId`, `path`, `depth`, `filter`, `limit` |
| `sigma_get_node_info` | 노드 상세 정보 조회 (fills, strokes, text, layout) | `token`, `nodeId` | — |
| `sigma_get_nodes_info` | 여러 노드 상세 정보 일괄 조회 | `token`, `nodeIds` | — |
| `sigma_get_document_info` | 문서 정보 (파일명, 페이지 목록) | `token` | — |
| `sigma_get_styles` | 로컬 스타일 조회 (Paint, Text, Effect, Grid) | `token` | — |
| `sigma_get_selection` | 현재 선택된 노드 목록 | `token` | — |
| `sigma_set_selection` | 특정 노드 선택 + 뷰포트 이동 | `token`, `nodeIds` | `zoomToFit` |
| `sigma_read_my_design` | 현재 선택된 노드의 상세 정보 조회 | `token` | — |
| `sigma_scan_text_nodes` | 하위 모든 텍스트 노드 스캔 | `token`, `nodeId` | — |
| `sigma_scan_nodes_by_types` | 하위에서 특정 타입 노드 스캔 | `token`, `nodeId`, `types` | — |

### 컴포넌트 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_local_components` | 로컬 컴포넌트 목록 (key, name, 크기) | `token` | — |
| `sigma_get_instance_overrides` | 인스턴스의 오버라이드 속성 조회 | `token` | `nodeId` |
| `sigma_set_instance_overrides` | 인스턴스 오버라이드 설정 | `token`, `nodeId`, `overrides` | — |

### 주석 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_annotations` | 노드의 주석 목록 조회 | `token` | `nodeId` |
| `sigma_set_annotation` | 노드에 주석 추가 | `token`, `nodeId`, `label` | `labelType` |
| `sigma_set_multiple_annotations` | 여러 노드에 주석 일괄 추가 | `token`, `items` | — |

### 프로토타이핑 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_reactions` | 노드의 인터랙션 목록 조회 | `token` | `nodeId` |
| `sigma_add_reaction` | 노드에 인터랙션 추가 (클릭→이동, 호버→팝업 등) | `token`, `nodeId`, `trigger`, `action` | `destinationId`, `url`, `transition`, `preserveScrollPosition` |
| `sigma_remove_reactions` | 노드의 인터랙션 제거 | `token`, `nodeId` | `triggerType` |

**trigger**: ON_CLICK, ON_HOVER, ON_PRESS, ON_DRAG, MOUSE_ENTER, MOUSE_LEAVE, AFTER_TIMEOUT
**action**: NAVIGATE(이동), OVERLAY(팝업), BACK(뒤로), CLOSE(닫기), OPEN_URL(외부 링크), SCROLL_TO(스크롤), SWAP(교체)

### 이미지/추출 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_screenshot` | 노드를 이미지로 캡처하여 파일 저장 | `token`, `nodeId` | `format`, `scale`, `filename` |
| `sigma_extract_node` | Figma 노드를 지정 포맷(JSON/HTML)으로 추출 | `token`, `nodeId` | `format` |
| `sigma_test_roundtrip` | 노드를 지정 포맷으로 추출 → 재생성 라운드트립 테스트 | `token`, `nodeId` | `format` |

### 데이터 저장/관리 (토큰 불필요)

| 도구 | 설명 | 필수 인자 |
|------|------|-----------|
| `save_extracted` | 추출 데이터 저장 | `name`, `data` |
| `list_saved` | 저장된 컴포넌트 목록 | — |
| `load_extracted` | 저장된 컴포넌트 로드 | `id` 또는 `name` |
| `delete_extracted` | 저장된 컴포넌트 삭제 | `id` |
| `save_and_import` | 저장 + 즉시 Figma 임포트 (토큰 필수) | `token`, `name` |

### 스크립트/스토리지/상태

| 도구 | 설명 |
|------|------|
| `get_playwright_scripts` | Sigma 임베드 스크립트 경로 + API 정보 반환 |
| `sigma_storage_stats` | 스토리지 용량 현황 (카테고리별) |
| `sigma_cleanup` | 스토리지 일괄 정리 (기간/카테고리 조건) |
| `list_screenshots` | 저장된 스크린샷 목록 |
| `delete_screenshot` | 스크린샷 삭제 |
| `server_status` | 서버 전체 상태 확인 |

---

## 컴포넌트 추출

### 두 가지 방식

| 방식 | 사용 주체 | 용도 |
|------|-----------|------|
| **Sigma 확장** (Chrome Extension) | 사용자 (수동) | UI로 컴포넌트 선택 → 클립보드 복사 또는 서버 전송 |
| **Sigma 임베드 스크립트** (Playwright) | AI Agent | 자동화된 컴포넌트 추출 |

### 임베드 스크립트 API

**추출 스크립트 (`extractor.standalone.js`):**
- `window.__sigma__.extract(selector)` — CSS 선택자로 요소 추출
- `window.__sigma__.extractAt(x, y)` — 좌표로 요소 추출
- `window.__sigma__.version` — 버전 문자열

**Storybook 스크립트 (`storybook.standalone.js`):**
- `getStories(baseUrl?)` — story 목록 조회 (메인 프레임)
- `navigateToStory(storyId, options?)` — SPA story 전환 + 렌더링 대기 (메인 프레임)
- `waitForStoryRendered(timeout?)` — 렌더링 완료 대기
- `extractStory(selector?)` — ExtractedNode 추출 (iframe)
- `extractAndSave(name, serverUrl?, selector?)` — 추출 + 서버 저장, ID 반환 (iframe)

### 추출 로직 직접 작성 금지

```javascript
// ❌ 직접 작성 금지
await page.evaluate(() => { function extractElement(el) { ... } });

// ✅ 반드시 Sigma 임베드 스크립트 사용
await page.addScriptTag({ path: '.../dist/extractor.standalone.js' });
const data = await page.evaluate(() => window.__sigma__.extract('...'));
```

스크립트 경로는 `get_playwright_scripts` 도구로 확인한다.

---

## Playwright 자동화 워크플로우

### 일반 웹페이지

```
1. get_playwright_scripts → extractor.standalone.js 경로 확인
2. Playwright로 페이지 이동
3. addScriptTag로 스크립트 inject
4. window.__sigma__.extract() 호출
5. sigma_create_frame으로 Figma에 생성
```

### Storybook (SPA 방식 필수)

```
1. get_playwright_scripts → storybook.standalone.js 경로 확인
2. 메인 Storybook 페이지 로드 (1회만)
3. 메인 프레임에 스크립트 inject (1회만)
4. getStories() → story 목록 조회
5. 각 story마다:
   a. navigateToStory(storyId) → SPA 전환
   b. iframe에 스크립트 inject
   c. extractAndSave(name) → 서버에 저장 (ID 반환)
   d. sigma_import_file(token, id) → Figma에 생성
```

**Storybook에서 절대 하지 말 것:**
```javascript
// ❌ page.goto로 각 story 직접 이동 — Chrome 렌더러 메모리 폭발
for (const story of stories) {
  await page.goto(`http://localhost:6006/iframe.html?id=${story.id}`);
}

// ✅ navigateToStory로 SPA 전환 — 메인 프레임 유지
await page.evaluate((id) => window.__sigma_storybook__.navigateToStory(id), story.id);
```

### Playwright 기본 설정

- 창 크기: 1600 x 900
- 스크린샷 저장: `{프로젝트루트}/.claude/screenshots/`

---

## 프로젝트 구조

```
packages/
├── chrome-extension/          # Chrome Extension (Manifest V3)
│   └── src/
│       ├── background.ts      # Service Worker
│       ├── content.ts         # Content Script 라우터
│       ├── content/           # Content Script 모듈
│       │   ├── overlay.ts     # 오버레이 UI 공통
│       │   ├── select-mode.ts # 단일 선택
│       │   ├── batch-mode.ts  # 배치 선택
│       │   └── playwright.ts  # Playwright 자동화 지원
│       ├── injected.ts        # 페이지 inject 스크립트
│       └── popup/             # Popup UI
│
├── figma-plugin/              # Figma Plugin
│   └── src/
│       ├── code.ts            # Plugin Main (Figma Sandbox)
│       ├── ui.ts              # Plugin UI 진입점
│       ├── ui/                # UI 모듈
│       │   ├── constants.ts   # 메시지 타입 상수
│       │   ├── ui-state.ts    # 공유 상태 + DOM 업데이트
│       │   ├── chunk-handler.ts # 청크 전송 관리
│       │   ├── bridge-server.ts # 서버→플러그인 메시지
│       │   └── bridge-plugin.ts # 플러그인→서버 메시지
│       ├── converter/         # JSON/HTML → Figma 변환
│       │   ├── frame.ts       # 프레임 생성/업데이트
│       │   ├── node-creator.ts # 노드 생성
│       │   ├── special-nodes.ts # SVG/이미지/입력/의사요소
│       │   ├── styles.ts      # CSS → Figma 스타일
│       │   ├── layout.ts      # Flexbox 레이아웃
│       │   ├── grid.ts        # CSS Grid 레이아웃
│       │   ├── html-parser.ts # HTML → ExtractedNode 파싱
│       │   └── index.ts       # Barrel export
│       ├── node-ops/          # Figma 노드 조작
│       │   ├── frames.ts      # 프레임 목록/삭제
│       │   ├── section.ts     # Section 생성
│       │   ├── move.ts        # 이동/복제
│       │   ├── export.ts      # 이미지 export
│       │   ├── tree.ts        # 트리 탐색/검색
│       │   ├── modify.ts      # 노드 속성 수정
│       │   └── page.ts        # 페이지 관리
│       ├── extractor/         # Figma → JSON 역추출
│       └── utils.ts           # createSolidPaint, createDefaultStyles
│
├── server/                    # Local Server
│   └── src/
│       ├── index.ts           # 부트스트랩 (HTTP + WS + MCP 통합)
│       ├── http/server.ts     # Hono REST API
│       ├── dashboard/         # 웹 대시보드 HTML
│       ├── websocket/server.ts # Figma Plugin WebSocket 통신
│       ├── mcp/               # MCP Server
│       │   ├── server.ts      # MCP 서버 설정
│       │   ├── router.ts      # MCP 라우팅
│       │   ├── tool-definitions.ts # 도구 스키마 정의
│       │   ├── tool-handler.ts # Record 기반 핸들러 라우터
│       │   ├── helpers.ts     # 공통 헬퍼 (인증, 검증)
│       │   └── handlers/      # 도구 핸들러 모듈
│       │       ├── auth.ts    # 인증/바인딩
│       │       ├── figma.ts   # Figma 프레임/노드 조작
│       │       ├── storage.ts # 데이터 저장/조회
│       │       ├── scripts.ts # 스크립트 정보
│       │       └── management.ts # 스토리지/상태 관리
│       ├── scripts/registry.ts # 임베드 스크립트 레지스트리
│       ├── storage/index.ts   # 파일 스토리지
│       └── auth/token.ts      # 토큰 관리
│
└── shared/                    # 공유 패키지
    ├── src/
    │   ├── types.ts           # ExtractedNode 등 공통 타입
    │   ├── constants.ts       # 포트, URL, 경로 상수
    │   ├── colors.ts          # CSS 색상 파싱 (parseColor)
    │   ├── extractor/         # 추출 로직 (Single Source of Truth)
    │   │   ├── core.ts        # extractElement + 고수준 함수
    │   │   ├── svg.ts         # SVG 처리
    │   │   └── index.ts
    │   ├── storybook/         # Storybook 자동화
    │   │   ├── core.ts        # getStories, navigateToStory 등
    │   │   └── index.ts
    │   ├── diff/              # 컴포넌트 비교
    │   │   ├── core.ts        # diffNodes, diffSummary
    │   │   ├── snapshots.ts   # 스냅샷 저장/비교
    │   │   └── index.ts
    │   ├── extractor-standalone-entry.ts  # → dist/extractor.standalone.js
    │   ├── storybook-standalone-entry.ts  # → dist/storybook.standalone.js
    │   └── diff-standalone-entry.ts       # → dist/diff.standalone.js
    ├── build.ts               # esbuild 설정
    └── dist/                  # 빌드된 임베드 스크립트
```

## 기술 스택

| 모듈 | 기술 |
|------|------|
| Chrome Extension | TypeScript, Manifest V3 |
| Local Server | Bun, TypeScript, Hono, @modelcontextprotocol/sdk |
| Figma Plugin | TypeScript, Figma Plugin API |
| Shared | TypeScript, esbuild (→ standalone 번들) |
| Package Manager | Bun workspace (monorepo) |

## 포트

| 서비스 | 포트 | 프로토콜 |
|--------|------|----------|
| HTTP Server | 19832 | HTTP |
| WebSocket Server | 19831 | WebSocket |
| MCP Server | — | stdio |

## 개발 명령어

```bash
bun install                                    # 의존성 설치
bun dev                                        # 전체 개발 모드
bun run build                                  # 전체 빌드
bun run --filter @sigma/server start           # 서버 실행 (production)
bun run --filter @sigma/server dev             # 서버 개발 모드
bun run --filter @sigma/figma-plugin dev       # Plugin 개발 모드
bun run --filter @sigma/chrome-extension dev   # Extension 개발 모드
```

- **Extension 로드**: chrome://extensions → 개발자 모드 → `packages/chrome-extension/dist` 로드
- **Figma Plugin 로드**: Figma → Plugins → Development → `packages/figma-plugin/manifest.json` 선택

## Docker 배포

Sigma 서버를 Docker로 실행하여 시스템 부팅 시 자동 시작 가능.

```bash
docker compose up -d          # 서버 시작 (백그라운드)
docker compose logs -f sigma  # 로그 확인
docker compose down           # 서버 중지
docker compose up -d --build  # 코드 변경 후 재빌드
```

`restart: always` 정책으로 Docker Desktop 시작 시 자동 실행.
`~/.sigma` 데이터는 Docker volume으로 영속화.
