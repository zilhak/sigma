# 패키지 구성

Sigma는 Bun Workspace 기반 모노레포로, 4개의 패키지로 구성됩니다.

```
packages/
├── server/              # @sigma/server — 중앙 서버
├── figma-plugin/        # @sigma/figma-plugin — Figma Plugin
├── chrome-extension/    # @sigma/chrome-extension — Chrome Extension
└── shared/              # @sigma/shared — 공통 타입/로직/임베드 스크립트
```

---

## @sigma/server

중앙 허브 서버. HTTP API, WebSocket, MCP 서버를 하나의 프로세스로 통합 제공합니다.

**주요 의존성:** Hono, @modelcontextprotocol/sdk, ws, sharp

### 소스 구조

```
src/
├── index.ts                  # 부트스트랩 (HTTP + WS + MCP 통합)
├── http/
│   └── server.ts             # Hono REST API
├── websocket/
│   └── server.ts             # Figma Plugin WebSocket 통신
├── mcp/
│   ├── server.ts             # MCP 서버 인스턴스 + 세션 관리
│   ├── router.ts             # /api/mcp 라우팅
│   ├── tool-definitions.ts   # 129개 MCP 도구 스키마 정의
│   ├── tool-handler.ts       # Record 기반 핸들러 라우터
│   ├── helpers.ts            # 공통 헬퍼 (인증, 검증)
│   ├── hangul-escape.ts      # 한글 \uXXXX 손조립 오타 감지 (도구 호출 경로 전체에 배선)
│   ├── spec-presets.ts       # 내장 스펙 프리셋 (anno/wire)
│   └── handlers/
│       ├── auth.ts           # 토큰 로그인/바인딩/상태
│       ├── figma.ts          # Figma 노드 생성/조작 명령 전달
│       ├── storage.ts        # 추출 데이터 저장/조회
│       ├── scripts.ts        # 임베드 스크립트 경로 정보
│       ├── management.ts     # 스토리지 통계/정리/상태
│       ├── lint.ts           # sigma_lint (scope/configMode 해석 + 실행)
│       └── component-spec.ts # 컴포넌트 스펙 등록/사용
├── lint/                     # 서버측 lint 지원
│   ├── resolve-config.ts     # config 출처 3순위 + configMode 병합
│   ├── load-config.ts        # config 파일 로드/검증
│   ├── enrich.ts             # 노드 상세 보강 (fills/opacity 등)
│   ├── suppress.ts           # 노드 단위 lint 억제 (lint-ignore sharedPluginData 해석)
│   ├── run-custom-rule.ts    # predicate 규칙 Worker 격리 실행
│   └── report.ts             # scope:file 결과 → markdown 리포트
├── image/
│   └── process.ts            # 이미지 후처리
├── auth/
│   └── token.ts              # SigmaTokenStore (stk-{hex}, 10분 만료)
├── storage/
│   ├── index.ts              # 파일 스토리지 (~/.sigma/)
│   └── component-specs.ts    # 컴포넌트 스펙 레지스트리
├── scripts/
│   └── registry.ts           # 임베드 스크립트 경로 레지스트리
└── dashboard/                # 웹 대시보드 HTML
```

### 핵심 기능

- **HTTP API**: 헬스체크, 추출 데이터 CRUD, Figma 상태/임포트
- **WebSocket**: Plugin 연결 관리, 1MB 청킹, 비동기 명령 대기 (PendingCommand)
- **MCP**: 129개 도구를 stdio와 Streamable HTTP 두 가지 방식으로 제공
- **토큰 관리**: `stk-{16자리 hex}`, 10분 만료 (사용 시 자동 갱신), 100회마다 자동 정리
- **스토리지**: TTL 7일, 100MB 초과 시 50MB로 자동 축소

---

## @sigma/figma-plugin

Figma Desktop App에서 실행되는 플러그인. 서버로부터 받은 명령을 Figma API로 실행합니다.

### 소스 구조

```
src/
├── code.ts                   # Plugin 메인 (Figma Sandbox) — 중앙 디스패처
├── ui.ts                     # Plugin UI 진입점 (iframe)
├── ui.html                   # UI 템플릿
├── utils.ts                  # createSolidPaint, createDefaultStyles
├── converter/                # JSON/HTML → Figma 변환
│   ├── frame.ts              # 프레임 생성/업데이트
│   ├── node-creator.ts       # 노드 생성
│   ├── special-nodes.ts      # SVG/이미지/입력/의사요소
│   ├── styles.ts             # CSS → Figma 스타일
│   ├── layout.ts             # Flexbox 레이아웃
│   ├── grid.ts               # CSS Grid 레이아웃
│   ├── html-parser.ts        # HTML → ExtractedNode 파싱
│   └── font-loader.ts        # 폰트 로드/폴백
├── node-ops/                 # Figma 노드 조작 (73개 modify 메서드)
│   ├── modify.ts             # 노드 속성 수정
│   ├── create.ts             # 도형/텍스트/프레임/이미지 생성
│   ├── query.ts              # 노드 정보 조회
│   ├── batch.ts              # 배치 작업
│   ├── selection.ts          # 선택 관리 + 뷰포트
│   ├── components.ts         # 컴포넌트/인스턴스
│   ├── component-spec.ts     # 스펙 기반 컴포넌트 빌드/사용
│   ├── library.ts            # Team Library 조회/임포트
│   ├── figjam.ts             # FigJam 스티키/커넥터
│   ├── annotations.ts        # 주석
│   ├── prototyping.ts        # 프로토타이핑/인터랙션
│   ├── hyperlink.ts          # 노드 간 상호 이동 링크 (slot 인지)
│   ├── frames.ts             # 프레임 목록/삭제
│   ├── removal.ts            # 삭제 되읽기 검증 (메인 COMPONENT 는 remove() 후에도 조회됨)
│   ├── section.ts            # Section 생성
│   ├── move.ts               # 이동/복제/그룹/언그룹/평탄화
│   ├── boolean.ts            # Boolean 연산
│   ├── styles.ts             # 스타일 CRUD
│   ├── variables.ts          # 변수/컬렉션
│   ├── export.ts             # 이미지 export
│   ├── tree.ts               # 트리 탐색/검색
│   └── page.ts               # 페이지 관리
├── extractor/                # Figma → JSON/HTML 역추출
│   ├── extract.ts            # Figma 노드 → ExtractedNode
│   └── html-export.ts        # ExtractedNode → HTML
├── testing/
│   └── roundtrip.ts          # 추출→재생성 라운드트립 테스트
└── ui/                       # Plugin UI 모듈
    ├── constants.ts           # 메시지 타입 상수
    ├── ui-state.ts            # 공유 상태 + DOM 업데이트
    ├── chunk-handler.ts       # 청크 수신 관리
    ├── bridge-server.ts       # 서버→플러그인 메시지
    └── bridge-plugin.ts       # 플러그인→서버 메시지
```

### 실행 환경 제약

| 환경 | 파일 | 사용 가능 | 사용 불가 |
|------|------|-----------|-----------|
| Figma Sandbox | `code.ts` | `figma.*` API, `?.` | `??`, DOM, fetch |
| iframe | `ui.ts` | 브라우저 API, fetch, WebSocket | `figma.*` API |

**`??` (Nullish Coalescing) 연산자는 절대 사용 금지** — Figma Sandbox에서 인식하지 못합니다. 삼항 연산자로 대체해야 합니다.

---

## @sigma/chrome-extension

Chrome Extension (Manifest V3). 사용자가 수동으로 웹 컴포넌트를 선택/추출합니다.

### 소스 구조

```
src/
├── background.ts             # Service Worker
├── content.ts                # Content Script 라우터
├── injected.ts               # 페이지 inject 스크립트
├── content/
│   ├── overlay.ts            # 오버레이 UI 공통
│   ├── select-mode.ts        # 단일 컴포넌트 선택
│   ├── batch-mode.ts         # 배치 선택
│   └── playwright.ts         # Playwright 자동화 지원
├── popup/                    # Popup UI
└── icons/                    # 아이콘
```

### 동작 흐름

1. Extension 팝업에서 선택/배치 모드 활성화
2. `content.ts`가 웹페이지에 `injected.ts` 실행
3. `@sigma/shared`의 `extractElement()` 호출 → ExtractedNode 생성
4. 결과를 **클립보드 복사** 또는 **서버 POST** (`http://localhost:19832/api/extracted`)

**권한:** `activeTab`, `scripting`, `storage`, `clipboardWrite`, `<all_urls>`

---

## @sigma/shared

모든 패키지가 공유하는 타입, 상수, 추출 로직, 임베드 스크립트 번들을 제공합니다.

### 소스 구조

```
src/
├── index.ts                  # 공개 API (타입, 상수, 색상 유틸)
├── types.ts                  # 핵심 공유 타입 (ExtractedNode, ComputedStyles 등)
├── constants.ts              # 포트, URL, 경로 상수
├── colors.ts                 # parseColor(), rgbaToString()
├── extractor/                # 추출 로직 (Single Source of Truth)
│   ├── core.ts               # extractElement() + 고수준 함수
│   ├── styles.ts             # 계산 스타일 → ExtractedNode 스타일
│   ├── text.ts               # 텍스트 노드 추출
│   ├── svg.ts                # SVG 처리
│   ├── icons.ts              # 아이콘 폰트/이미지 처리
│   ├── pseudo.ts             # ::before/::after 의사요소
│   ├── visibility.ts         # 가시성 판정
│   ├── utils.ts              # 공통 유틸
│   └── index.ts
├── lint/                     # Lint 엔진 (순수 함수, 유닛테스트)
│   ├── engine.ts             # 규칙 실행/집계 + 자동수정 계획
│   ├── types.ts              # LintConfig, BuiltinRuleId(20종) 등
│   ├── geometric.ts          # 기하 8종 (좌표 기반)
│   ├── simple-rules.ts       # 구조/이름/가시성 6종 + raw_node
│   ├── occlusion.ts          # fully_occluded_sibling
│   ├── page-rules.ts         # 페이지 루트 전용 (content_spread, origin_anchor)
│   ├── spec-instance.ts      # 스펙 인스턴스 크기 (instance_resized_from_spec)
│   ├── annotation-marker.ts  # 기획 주석 마커↔범례 짝·거리 (룰 2종)
│   ├── font.ts               # 파일 기본 폰트와 다른 TEXT (font_not_default)
│   ├── json-rule.ts          # JSON 선언적 커스텀 규칙
│   └── tree-utils.ts         # 트리 순회 헬퍼
├── component-spec/           # 컴포넌트 스펙 시스템
│   ├── types.ts              # ComponentSpecRecord, ComponentParam 등
│   ├── validate.ts           # 스펙 HTML 검증 (CSS 화이트리스트, slot 규칙, 박스모델 경고)
│   ├── policy.ts             # 파일별 스펙 등록 정책 (순수 함수)
│   └── index.ts
├── enhancer/                 # CDP 보강 레이어
│   ├── core.ts               # enhance(cdp, node, options)
│   ├── font.ts               # 플랫폼 실제 폰트 해석
│   ├── types.ts              # CDPClient, EnhanceOptions
│   └── index.ts
├── discovery/                # 요소 탐색 API
│   ├── core.ts               # findByText, findByAlt, findForm 등
│   └── index.ts
├── storybook/                # Storybook 자동화
│   ├── core.ts               # getStories, navigateToStory 등
│   └── index.ts
├── diff/                     # 컴포넌트 비교
│   ├── core.ts               # diffNodes, diffSummary
│   ├── snapshots.ts          # 스냅샷 저장/비교
│   └── index.ts
├── extractor-standalone-entry.ts   # → dist/extractor.standalone.js
├── storybook-standalone-entry.ts   # → dist/storybook.standalone.js
└── diff-standalone-entry.ts        # → dist/diff.standalone.js
```

### 임베드 스크립트 (3종)

esbuild로 빌드되어 `dist/`에 생성되는 자체 완결형 JS 번들. Playwright의 `addScriptTag()`로 웹페이지에 inject하여 사용합니다.

| 빌드 결과물 | 전역 API | 용도 |
|-------------|----------|------|
| `extractor.standalone.js` | `window.__sigma__` | DOM 추출, 요소 탐색 |
| `storybook.standalone.js` | `window.__sigma_storybook__` | Story 조회, SPA 전환, 추출+저장 |
| `diff.standalone.js` | `window.__sigma_diff__` | ExtractedNode 비교, 스냅샷 |

상세 API는 [embed-scripts.md](./embed-scripts.md) 참조.

### 핵심 상수

```typescript
HTTP_PORT = 19832
WEBSOCKET_PORT = 19831
SERVER_URL = "http://localhost:19832"
WEBSOCKET_URL = "ws://localhost:19831"
STORAGE_PATH = "~/.sigma"
```
