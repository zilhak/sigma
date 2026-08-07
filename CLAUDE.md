# Sigma - Modular Design-to-Code Bridge

**목표: Figma Plugin API의 모든 기능을 MCP 도구로 노출하여, AI Agent가 Figma를 완전히 제어할 수 있게 한다.**

웹 컴포넌트를 추출하고 Figma와 AI Agent가 상호작용할 수 있는 모듈형 시스템.
각 모듈은 독립적으로 동작하면서도, 로컬 서버를 중심으로 연결되면 자동화 파이프라인이 된다.

Figma Plugin API가 제공하는 모든 기능 — 노드 생성/조작, 스타일/변수, 컴포넌트, 프로토타이핑, 페이지 관리, Team Library 등 — 을 MCP 도구로 1:1 매핑하는 것이 최종 목표다. 현재 129개 도구(모두 `sigma_*` 접두사)와 73개 modify 메서드가 구현되어 있다.

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
| **Diff 스크립트** | `window.__sigma_diff__` API로 ExtractedNode 비교, 스냅샷 관리 | `dist/diff.standalone.js` |

---

## Claude Code 작업 지침

### MCP 서버 재시작 금지 (CRITICAL)

**절대로 Sigma MCP 서버를 재시작하지 마라.**

Claude Code에서 MCP 서버를 종료하거나 재시작하면:
1. Agent와 MCP 서버의 연결이 끊어짐
2. 재연결 방법이 **존재하지 않음**
3. Sigma MCP 도구들은 세션이 끝날 때까지 사용 불가

서버 코드를 수정했다면 → 사용자에게 Claude Code 재시작을 안내하거나, 터미널에서 직접 서버 재시작 후 `/mcp`로 재연결하도록 유도.

### MCP 도구 설계 규약 (도구 추가·수정 시 필참)

MCP 도구를 **새로 만들거나 이름/스키마를 바꾸거나 정리(그룹화)** 할 때는 반드시
[`docs/tool-conventions.md`](docs/tool-conventions.md)를 먼저 참조하고 그 규칙을 따른다.
- 네이밍: 모든 도구 `sigma_` 접두사, 고정 동사 사전(`get_`/`list_`/`delete_` 등), 이름은 사실과 일치
- 그룹화: "동질이면 묶고(`method` 패턴), 이질이면 쪼갠다". 배치 전용 도구 신설 금지(배열 입력으로)
- 스키마: 열거 필드는 `enum` 필수, 색상 `{r,g,b,a}`, `validateFigmaAccess` 사용
- 도구를 추가/변경하면 `docs/mcp-tools.md`·`README.md`·이 파일의 도구 표도 함께 갱신

### 사용자 포커스 불변 (뷰·페이지·선택) — CRITICAL

**어떤 도구도 부작용으로 사용자의 페이지/뷰/선택 포커스를 바꾸지 않는다.**
MCP 도구는 에이전트가 호출하는 것이고, 그 시각 Figma 화면을 보고 있는 것은 사람이다.
작업 결과를 보여주려고 화면을 옮기면 사람의 작업 흐름을 끊는 부작용만 남는다.

- **동작과 뷰 설정은 별개의 2단계다.** 노드를 만들거나 고치는 도구는 절대 `figma.viewport.*`,
  `figma.currentPage`, `currentPage.selection` 을 건드리지 않는다.
- **포커스를 바꿔도 되는 경우는 셋뿐이다:**
  1. 포커스 변경 자체가 목적인 도구 — `sigma_set_viewport`, `sigma_switch_page`, `sigma_set_selection`(선택만; 뷰는 `zoomToFit:true` 명시 시에만)
  2. 포커스 정보를 **읽는** 도구 — `sigma_get_viewport`, `sigma_get_selection`, `sigma_get_selection_details`, `sigma_get_document_info`
  3. **사람이 플러그인 UI에서 직접** 실행한 동작 — 개체 탭 붙여넣기(`focusView: true`로 명시 전달), 일반 탭의 좌표/노드 ID 이동 버튼
- **`figma.currentPage` 를 동작 대상으로 삼지 않는다.** 대상 페이지는 항상 바인딩 `pageId`
  → `getTargetPage(pageId)` 로 정한다. `figma.createX()` 가 노드를 활성 page 에 자동 append
  하더라도, `placeNode(node, parentId, targetPage)` 로 직접 재배치한다
  (`node-ops/create.ts`). 활성 page 를 전환해 맞추는 방식은 금지.
- **`nodeId` 를 "현재 선택"으로 폴백하지 않는다.** 같은 호출이 캔버스 선택 상태에 따라 다른
  결과를 내면 재현이 불가능하다. 대상 노드는 인자로 명시받는다.

새 도구를 추가할 때 이 규칙을 어기는지 자문한다: "이 도구가 사람이 보던 화면을 움직이는가?"

### 멀티에이전트 동시 작업 (지원) — 깨뜨리지 말 것

여러 에이전트가 같은 Figma 파일에서 **동시에** 작업할 수 있다. 이는 아래 성질들이 유지되는
한에서 성립하므로, 새 코드가 이 중 하나라도 깨면 동시 작업 보장이 무너진다.

| 성질 | 근거 위치 |
|------|-----------|
| 토큰·바인딩이 토큰별 격리 | `auth/token.ts` (`Map<string, SigmaTokenData>`) |
| 명령이 고유 `commandId`로 다중화 (응답 교차 없음) | `websocket/server.ts` `pendingCommands` + `code.ts`의 commandId 클로저 캡처 |
| 대상 페이지는 바인딩 `pageId`로 결정 (활성 page 무관) | `getTargetPage` · `placeNode` |
| 포커스(페이지/뷰/선택)를 부작용으로 바꾸지 않음 | 위 "사용자 포커스 불변" 절 |
| 청크 버퍼가 `commandId`별로 분리 | `ui-state.ts` `chunkBuffers` Map |
| 자동 배치가 전역 상태를 쓰지 않음 (페이지 스캔 기반) | `converter/frame.ts` `getAutoPosition` |

**금지 패턴**: 명령 간에 공유되는 모듈 전역 가변 상태를 새로 만들지 않는다. 특히
"마지막으로 ~한 것"을 기억하는 전역은 동시 작업에서 서로를 덮어쓴다
(`lastCreatedFrame`이 정확히 그 이유로 제거됐다). 상태가 필요하면 `commandId`나
`pageId`로 키를 나눈다.

**남는 한계**(문서로 안내하고, 코드로 막지 않는다): 같은 노드를 동시에 수정하면 마지막
쓰기가 이긴다(Figma 특성) · `sigma_trigger_undo`/`sigma_commit_undo`는 문서 전역이라
동시 작업 중 사용 금지 · `position` 미지정 자동 배치는 호출 시점 페이지 내용 기준.

### Figma Plugin 코드 제약

Figma Plugin의 `code.ts`는 Figma Sandbox에서 실행된다:
- `??` (nullish coalescing) 사용 금지 → 삼항 연산자로 대체
- `?.` (optional chaining)은 사용 가능
- 브라우저 API (DOM, fetch 등) 접근 불가 — 이는 `ui.ts` (iframe) 에서만 가능
- `ui.ts` iframe에서 클립보드 사용 시 `document.execCommand('copy')` 동기 호출 필수 — 상세: [`docs/figma-plugin-clipboard.md`](docs/figma-plugin-clipboard.md)

### 시각적 결과 검증 프로토콜

시각적 변환 작업(웹→Figma 등)의 결과를 검증할 때:

1. **사전 준비**: 핵심 요소 목록 작성
2. **원본-결과 병렬 비교**: 반드시 원본/결과 스크린샷을 나란히 비교
3. **체크리스트 검증**: 각 요소에 PASS/FAIL만 사용
4. **결과 보고**: 표 형식으로 보고, "성공적으로 완료" 같은 모호한 표현 금지

단순 속성 변경(크기, 위치 등)은 `sigma_get_tree`로 데이터 기반 확인. 스크린샷은 시각적 품질 검증이 필요할 때만 사용.

### 커밋 · 버전 규칙

**커밋 시점 — 작업 1건 완료 = 즉시 커밋 (묻지 않는다)**
- **작업(사용자가 요청한 한 단위) 을 끝냈으면 그 자리에서 곧바로 커밋한다.** "커밋할까요?"라고 **묻지 않는다** — 이 규칙이 이미 답이다. 사용자가 별도로 요청하지 않아도 커밋은 작업 완료 절차의 일부다.
- 완료 판정은 **검증까지** 포함한다: 빌드·타입체크·테스트가 통과한 상태에서 커밋한다. 실패 중이면 커밋하지 말고 먼저 고친다.
- 작업 하나가 여러 축(플러그인/서버/shared/문서)을 건드려도 **한 작업이면 한 커밋**으로 묶는다. 반대로 성격이 다른 작업 여러 개를 한 커밋에 섞지 않는다.
- 버그 재현·디버깅용 **임시 변경(되돌릴 예정)은 커밋하지 않는다.**
- **이미 있던 남의 미커밋 변경이 작업 트리에 섞여 있으면** 그것까지 끌어들여 커밋하지 말고, 사용자에게 함께 커밋해도 되는지 확인한다 (이 경우만 예외적으로 물어본다).
- 커밋 메시지는 Conventional Commits + 한국어 설명 (`fix(converter): …`, `feat(plugin): …`). `Co-Authored-By` 등 트레일러는 넣지 않는다.
- **`push`는 자동으로 하지 않는다.** 커밋까지만 하고, 원격 push는 사용자가 명시적으로 요청할 때만 수행한다.

**버전 (2단계: `major.minor`)**
- 버전은 **2단계**만 쓴다 (patch 자리 없음). 예: `1.0` → `1.1` → `1.2`.
- 버전 추적 축은 **플러그인**(`packages/figma-plugin/package.json`)과 **서버**(`packages/server/package.json`) 둘뿐이다.
- **커밋 1건마다 해당 축의 minor를 1씩 올린다:**
  - 플러그인만 변경 → 플러그인 minor +1
  - 서버만 변경 → 서버 minor +1
  - 두 축을 함께 변경 → 두 버전 모두 +1
  - **문서만** 변경 → 버전 변경 없음
  - **빌드/인프라(Docker 등) 전용** 변경 → 버전 변경 없음
  - **테스트 전용** 변경 (`__tests__/` 만 추가·수정) → 버전 변경 없음
- 공용 패키지(`packages/shared`) 변경은 **두 축(플러그인·서버)을 모두 +1** 한다 (shared는 양쪽에 반영되므로). `shared`·`chrome-extension`의 package.json 버전 자체는 규칙 추적 대상이 아니다.
- 과거 버전 히스토리는 무시하고 **현재(`1.0`)부터** 시작한다.

**버전 문자열은 코드에 손으로 적지 않는다 — 두 축이 따로 있다**

이 저장소에 나타나는 버전은 성격이 다른 **두 종류**이며, 섞으면 안 된다.

| 축 | 무엇 | 출처 | 언제 오르나 |
|---|---|---|---|
| **A. 패키지 판** | 서버 배너·`GET /api/version`·MCP `serverInfo.version`, 플러그인 UI 헤더, 확장 popup·`manifest.version` | 각 패키지의 `package.json` 에서 **자동 유도** | 위 커밋 규칙대로 커밋마다 |
| **B. 스크립트 API 계약** | `window.__sigma__` / `__sigma_storybook__` / `__sigma_diff__` 의 `version`, 확장 `injected.ts` 의 `INJECTED_API_VERSION` | 해당 파일의 **상수 리터럴** | API 시그니처·반환 모양이 바뀔 때만 |

- A 는 **어디서도 하드코딩하지 않는다.** 서버는 `packages/server/src/version.ts` 의 `SERVER_VERSION`,
  플러그인·확장은 각 `build.ts` 가 자기 `package.json` 을 읽어 빌드 시 주입한다.
  `packages/chrome-extension/src/manifest.json` 의 `version` 은 빌드가 덮어쓰는 **자리표시자(`0.0.0`)** 이므로 손으로 고치지 말 것.
- B 는 리빌드했다고 올리지 않는다. 이 값으로 분기하는 소비자가 있어서, 판번호가 흔들리면 그쪽이 깨진다.
- `@sigma/shared` 에 **공용 VERSION 상수를 되살리지 말 것.** 추적 축이 플러그인·서버 둘로 갈라져 있어
  하나의 값은 최소 한쪽에서 반드시 틀린다(실제로 `'v1.0'` 이 양쪽 모두와 어긋난 채 굳어 있었다).

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
            │ 브라우저 직접 조종              │ stdio / HTTP
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
- **Agent → Server**: MCP (stdio 또는 Streamable HTTP)로 도구 호출

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
| `sigma_create_frame` | ExtractedNode JSON/HTML로 프레임 생성 | `token` | `data`, `html`, `format`, `name`, `position` |
| `sigma_import_saved` | 서버에 저장된 데이터로 프레임 생성 | `token`, `id` | `name`, `position` |
| `sigma_create_rectangle` | 사각형 생성 | `token`, `x`, `y`, `width`, `height` | `name`, `fillColor`, `strokeColor`, `strokeWeight`, `cornerRadius`, `parentId` |
| `sigma_create_text` | 텍스트 노드 생성 (폰트 자동 로드) | `token`, `x`, `y`, `text` | `name`, `fontSize`, `fontFamily`, `fontWeight`, `fontColor`, `textAlignHorizontal`, `parentId` |
| `sigma_create_empty_frame` | 빈 프레임 생성 (Auto Layout 지원) | `token`, `x`, `y`, `width`, `height` | `name`, `layoutMode`, `padding*`, `itemSpacing`, `fillColor`, `cornerRadius`, `layoutWrap`, `counterAxisSpacing`, `layoutSizing*`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `parentId` |
| `sigma_create_section` | Section 생성 | `token`, `name` | `position`, `size`, `children`, `fills` |
| `sigma_create_component_instance` | 컴포넌트 인스턴스 생성 (로컬/라이브러리) | `token`, `componentKey`, `x`, `y` | `parentId` |
| `sigma_create_ellipse` | 타원/원 생성 | `token`, `x`, `y`, `width`, `height` | `name`, `fillColor`, `strokeColor`, `strokeWeight`, `arcData`, `parentId` |
| `sigma_create_polygon` | 다각형 생성 | `token`, `x`, `y`, `width`, `height` | `name`, `pointCount`, `fillColor`, `strokeColor`, `strokeWeight`, `parentId` |
| `sigma_create_star` | 별 생성 | `token`, `x`, `y`, `width`, `height` | `name`, `pointCount`, `innerRadius`, `fillColor`, `strokeColor`, `strokeWeight`, `parentId` |
| `sigma_create_line` | 선 생성 | `token`, `x`, `y`, `length` | `name`, `strokeColor`, `strokeWeight`, `rotation`, `parentId` |
| `sigma_create_vector` | 벡터 노드 생성 (SVG path) | `token`, `x`, `y`, `width`, `height` | `name`, `fillColor`, `strokeColor`, `strokeWeight`, `vectorPaths`, `parentId` |
| `sigma_create_image` | 이미지 노드 생성 (base64) | `token`, `x`, `y`, `width`, `height`, `imageData` | `name`, `parentId`, `scaleMode`, `cornerRadius` |
| `sigma_create_node_from_svg` | SVG 문자열을 Figma 노드로 변환 | `token`, `svgString` | `x`, `y`, `name`, `parentId` |
| `sigma_create_component` | 새 컴포넌트 노드 생성 | `token`, `x`, `y`, `width`, `height` | `name`, `parentId` |

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
| `sigma_group_nodes` | 여러 노드를 그룹으로 묶기 | `token`, `nodeIds` | `name` |
| `sigma_ungroup` | 그룹 해제 | `token`, `nodeId` | — |
| `sigma_flatten` | 여러 노드를 하나의 벡터로 평탄화 | `token`, `nodeIds` | `name` |
| `sigma_boolean_operation` | Boolean 연산 (Union, Subtract, Intersect, Exclude) | `token`, `nodeIds`, `operation` | `name` |
| `sigma_lint` | config 기반 빌트인 24종(기본 ON 15종 = 기하 8+구조/이름/가시성 6+occlusion 1, opt-in 9종) + 커스텀 규칙(JSON/predicate) 검사, 안전 자동수정(`apply:true`) | `token` | `config`, `configPath`, `scope`, `configMode`, `nodeId`, `path`, `apply`, `treeNodeLimit`, `treeTimeoutMs` |

> **공간 규약(빌트인 기하 8종)**: 계층은 Section → Frame → 콘텐츠로 균일. 형제 섹션/프레임 non-overlap · **이웃 섹션 간 ≥80px 간격**(section_gap — 라벨이 경계 가림 방지, `gap` 조절) · 섹션 안 프레임 ≥20px 여백(`padding` 조절) · 섹션 직속은 FRAME/SECTION 만(COMPONENT/GROUP·인스턴스는 프레임 안, anno/wire 예외) · **트리상 자식이면 좌표상으로도 부모 안**(모든 컨테이너가 자식 로컬좌표 → 부모 로컬박스 0,0~W,H 기준, 섹션도 동일, 배치형만·리프 제외). `resize`로 프레임/섹션을 키우면 형제를 덮을 수 있으니 변형 후 `sigma_lint`로 회귀 검사. **찾기 쉬움 2종(opt-in, 페이지 루트 전용)**: `content_spread`(본진에서 떨어진 이상치 — zoom-to-fit을 삼켜 "내용을 못 찾는" 원인, `maxGap` 기본 3000px) · `origin_anchor`(최상위 섹션 중 하나는 원점 `tolerance` 이내에서 시작, 기본 100px) — 둘 다 `nodeId`/`path` 서브트리 검사에선 실행 안 됨. 빌트인 24종 전체 목록·파라미터(opt-in 9종: `raw_node`·`annotation_layer`·`instance_default_name`·`content_spread`·`origin_anchor`·`instance_resized_from_spec`·`annotation_marker_pair`·`annotation_marker_gap`·`font_not_default`), 커스텀 규칙(JSON 선언적/JS predicate) 스키마, `scope`(`page`/`file`)·`configMode`(`merge` 기본/`per-page`/`uniform`)와 md 리포트, `configPath`의 Docker 배포 주의사항은 **[`docs/lint/`](docs/lint/README.md)**(룰별 상세는 `docs/lint/rules/<id>.md`) 참조. 엔진은 `packages/shared/src/lint/`(순수 함수, 유닛테스트), 서버측 config 해석/리포트는 `packages/server/src/lint/`.

**`sigma_modify_node` 지원 메서드:**
- **Basic**: rename, resize, move, setOpacity, setVisible, setLocked, remove
- **Visual**: setFills, setSolidFill, setStrokes, setStrokeWeight, setCornerRadius, setCornerRadii, setEffects, setBlendMode, setCornerSmoothing, setDashPattern, setMask, setGradientFill, setImageFill
- **Stroke Advanced**: setStrokeAlign, setStrokeCap, setStrokeJoin, setIndividualStrokeWeights
- **Transform**: setRotation
- **Layout (Frame)**: setLayoutMode, setPadding, setItemSpacing, setClipsContent, setPrimaryAxisSizingMode, setCounterAxisSizingMode, setPrimaryAxisAlignItems, setCounterAxisAlignItems, setLayoutWrap, setCounterAxisSpacing, setLayoutSizing, setOverflowDirection
- **Layout (Child)**: setLayoutAlign, setLayoutGrow, setLayoutPositioning
- **Constraints**: setConstraints, setMinWidth, setMaxWidth, setMinHeight, setMaxHeight
- **Text**: setCharacters, setFontSize, setTextAlignHorizontal, setTextAlignVertical, setFontFamily, setFontWeight, setTextAutoResize, setLineHeight, setLetterSpacing, setParagraphSpacing, setParagraphIndent, setTextCase, setTextTruncation, setMaxLines
- **Rich Text (Range)**: setRangeFontSize, setRangeFontName, setRangeFills, setRangeTextDecoration, setRangeLineHeight, setRangeLetterSpacing, setRangeHyperlink, setRangeListOptions, setRangeIndentation
- **Plugin Data**: setPluginData, getPluginData, getPluginDataKeys, setSharedPluginData, getSharedPluginData

### 조회/검색 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_find_node` | 경로/이름으로 노드 검색, 또는 `where`로 속성 조건 검색 (예: width>1000 전부) | `token` | `path`, `type`, `where`, `nodeId`, `limit` |
| `sigma_get_tree` | 문서 계층 구조 탐색 (`fields:"geometry"`=좌표 전용 축약) | `token` | `nodeId`, `path`, `depth`, `filter`, `limit`, `fields` |
| `sigma_get_node_info` | 노드 상세 정보 조회 (fills, strokes, text, layout — TEXT 는 `hyperlinks` 포함) | `token`, `nodeId` | — |
| `sigma_get_nodes_info` | 여러 노드 상세 정보 일괄 조회 | `token`, `nodeIds` | — |
| `sigma_get_document_info` | 문서 정보 (파일명, 페이지 목록) | `token` | — |
| `sigma_get_styles` | 로컬 스타일 조회 (Paint, Text, Effect, Grid) | `token` | — |
| `sigma_get_selection` | 현재 선택된 노드 목록 | `token` | — |
| `sigma_set_selection` | 특정 노드 선택 (화면은 그대로 — 뷰까지 옮기려면 `zoomToFit:true`) | `token`, `nodeIds` | `zoomToFit` |
| `sigma_get_viewport` | 현재 뷰포트 정보 조회 (center, zoom, bounds) | `token` | — |
| `sigma_set_viewport` | 뷰포트 직접 설정 (center+zoom 또는 nodeIds로 이동) | `token` | `center`, `zoom`, `nodeIds` |
| `sigma_get_selection_details` | 현재 선택된 노드의 상세 정보 조회 | `token` | — |
| `sigma_scan_text_nodes` | 하위 모든 텍스트 노드 스캔 | `token`, `nodeId` | — |
| `sigma_scan_nodes_by_types` | 하위에서 특정 타입 노드 스캔 | `token`, `nodeId`, `types` | — |
| `sigma_list_fonts` | 사용 가능한 폰트 목록 조회 | `token` | — |
| `sigma_get_css` | 노드의 CSS 속성 추출 | `token`, `nodeId` | — |

> **`sigma_get_tree` 의 `fields` (좌표 전용 축약)**: `all`(기본)은 노드마다 `fullPath` + `meta`(visible·locked·layoutMode·characters(≤100자)·layoutSizing·description)를 함께 싣는다. `fields:"geometry"` 는 이 둘을 빼고 `id·name·type·boundingBox·childCount·children` + **`absolute`**(페이지 절대좌표 좌상단)만 준다 — 위치 보정처럼 좌표만 필요한 작업에서 payload 를 줄이기 위함.
> - **좌표계 분업**: `boundingBox` 는 **직속 부모 로컬좌표**(섹션도 자식 원점을 새로 잡는다) → 실제 수정(`modify_node` move/resize)은 이 값으로. `absolute` 는 페이지 절대좌표 → 다른 컨테이너에 든 노드끼리 겹침·거리 판단은 이 값으로. 로컬좌표끼리 비교하면 오판한다.
>
> **`sigma_find_node` 의 `where` (속성 조건 검색)**: `path`(경로로 하나 찾기)와 상호배타. `select`(type/namePattern)로 대상을 좁히고 `checks` 배열로 조건을 건다(**AND 결합**, OR은 호출을 나눈다). 연산자는 `sigma_lint` 커스텀 규칙과 **동일한 5개**(`equals`/`range`/`regex`/`oneOf`/`exists`)이며 엔진도 같은 코드(`shared/src/lint/json-rule.ts` `queryNodes`)를 재사용한다 — 연산자를 늘리지 않는다.
> - **비용**: `id·name·type·x·y·width·height·childCount·visible·locked` 만 쓰면 트리 조회 1회. 그 밖의 필드(`fills`·`opacity`·`cornerRadius`·`characters`·`fontSize`·`layoutMode`·`layoutSizing*`·`strokes`·`strokeWeight`·`description`)는 상세 조회 왕복이 1회 추가된다(응답 `enriched`로 확인).
> - 범위는 바인딩 페이지 전체(`nodeId`로 하위 한정), 결과는 `limit`(기본 200) 초과 시 `truncated: true`.
> - 반환된 `nodeId` 배열을 `sigma_batch_modify`/`sigma_batch_delete`에 그대로 넘겨 일괄 처리한다.

### 컴포넌트 스펙 (스펙 기반 컴포넌트)

엄격한 규칙의 HTML(단일 루트, inline style, CSS 화이트리스트)로 컴포넌트를 등록하면,
에이전트가 Figma 내부를 탐색하지 않고 alias + props만으로 인스턴스를 삽입할 수 있다.
텍스트 파라미터는 `<span data-sigma-slot="이름">기본값</span>`으로 선언 → Figma TEXT 속성으로 승격.

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_create_component_spec` | 스펙 HTML로 컴포넌트 등록 (검증 위반 시 거부) | `token`, `alias`, `description` + (`html` 또는 `htmlPath`) | `htmlPath`(파일에서 HTML 읽기, `html`과 상호배타 — base64 이미지처럼 본문이 큰 스펙은 인자로 옮기다 깨지면 등록은 통과하고 렌더만 실패), `namespace`, `position`, `overwrite`(in-place 갱신→인스턴스 전파), `validateOnly`(토큰 불필요 dry-run) |
| `sigma_list_component_specs` | 스펙 카탈로그 조회 (alias 지정 시 HTML 원문 포함 상세) | — | `alias`, `namespace` |
| `sigma_create_component_spec_instance` | alias + props로 인스턴스 생성 (넘침 시 warnings) | `token`, `alias` | `namespace`, `props`, `x`, `y`, `width`, `height`, `parentId` |
| `sigma_set_component_spec_instance_props` | 기존 인스턴스의 param 재설정 | `token`, `nodeId`, `props` | — |
| `sigma_import_spec_preset` | 내장 프리셋 등록 (annotation: anno/4종, wireframe: wire/5종) | `token`, `preset` | `overwrite` |
| `sigma_delete_component_spec` | 레지스트리에서 스펙 삭제 (Figma 노드는 유지) | `alias` | `namespace` |

> **파일별 등록 정책(`componentSpec.warn`)**: 문서 노드에 저장된 lint config의 `componentSpec.warn`(`aliasPattern?`/`htmlPattern?`/`unlessDescription?`/`message`/`namespace?` — 앞의 둘 중 **최소 하나 필수**, 둘 다 주면 AND)에 alias나 **스펙 HTML 내용**이 걸리면 `sigma_create_component_spec`의 등록·`overwrite` 갱신 응답에 `policyWarnings`가 실린다 — **경고만이고 등록을 막지 않는다**. 설정은 `sigma_set_page_data({ pageId: "document", key: "lint", ... })`. `validateOnly`(토큰 없는 dry-run)는 대상 파일을 특정할 수 없어 검사하지 않는다. **한계**: 게이트는 sigma 도구 경로만 덮고(사람이 Figma에서 직접 만든 컴포넌트는 안 걸림), 레지스트리는 서버 전역이라 다른 파일에 바인딩해 등록하면 우회된다 — 실수 방지용이지 강제 수단이 아니다. 상세는 [`docs/component-spec.md`](docs/component-spec.md) §파일별 등록 정책.

### 컴포넌트 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_local_components` | 로컬 컴포넌트 목록 (key, name, 크기) | `token` | — |
| `sigma_get_instance_overrides` | 인스턴스의 오버라이드 속성 조회 | `token`, `nodeId` | — |
| `sigma_set_instance_overrides` | 인스턴스 오버라이드 설정 | `token`, `nodeId`, `overrides` | — |
| `sigma_convert_to_component` | 프레임을 컴포넌트로 변환 | `token`, `nodeId` | — |
| `sigma_create_component_set` | 컴포넌트들을 Variants 세트로 결합 | `token`, `componentIds` | `name` |
| `sigma_add_component_property` | 컴포넌트에 속성 추가 | `token`, `nodeId`, `propertyName`, `propertyType`, `defaultValue` | — |
| `sigma_edit_component_property` | 컴포넌트 속성 수정 | `token`, `nodeId`, `propertyName`, `newValues` | — |
| `sigma_delete_component_property` | 컴포넌트 속성 삭제 | `token`, `nodeId`, `propertyName` | — |
| `sigma_get_component_properties` | 컴포넌트 속성 정의 조회 | `token`, `nodeId` | — |
| `sigma_detach_instance` | 인스턴스를 일반 프레임으로 분리 | `token`, `nodeId` | — |
| `sigma_swap_component` | 인스턴스의 컴포넌트 교체 | `token`, `nodeId`, `newComponentKey` | — |

### 주석 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_annotations` | 노드의 주석 목록 조회 | `token`, `nodeId` | — |
| `sigma_set_annotation` | 노드에 주석 추가 | `token`, `nodeId`, `label` | `labelType` |
| `sigma_set_multiple_annotations` | 여러 노드에 주석 일괄 추가 | `token`, `items` | — |
| `sigma_create_annotation_layer` | 섹션에 기획 레이어(anno/wire 인스턴스를 담는 투명 오버레이 프레임) 생성 + pluginData `role="annotation-layer"` 태깅 | `token`, `sectionId` | `name` |

### 프로토타이핑 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_get_reactions` | 노드의 인터랙션 목록 조회 | `token`, `nodeId` | — |
| `sigma_add_reaction` | 노드에 인터랙션 추가 (클릭→이동, 호버→팝업 등) | `token`, `nodeId`, `trigger`, `action` | `destinationId`, `url`, `transition`, `preserveScrollPosition` |
| `sigma_delete_reactions` | 노드의 인터랙션 제거 | `token`, `nodeId` | `triggerType` |

**trigger**: ON_CLICK, ON_HOVER, ON_PRESS, ON_DRAG, MOUSE_ENTER, MOUSE_LEAVE, AFTER_TIMEOUT
**action**: NAVIGATE(이동), OVERLAY(팝업), BACK(뒤로), CLOSE(닫기), OPEN_URL(외부 링크), SCROLL_TO(스크롤), SWAP(교체)

### 하이퍼링크 (노드 간 상호 이동, 토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_set_hyperlink` | 노드 쌍이 서로를 가리키는 링크 배선 (누르면 상대 노드로 뷰 이동) | `token`, `links` | `direction`, `slot`, `remove` |

> **reaction 과 다른 물건이다**: 프로토타입 reaction 은 재생 모드에서만 동작하지만 하이퍼링크는 **편집 캔버스에서 그대로 클릭**된다. 기획 주석 마커 ↔ 범례처럼 "번호를 누르면 설명과 화면을 오가는" 문서형 이동에 맞다. 같은 파일 안이라 fileKey 없이 노드 ID 만으로 동작한다(`setRangeHyperlink` 의 `nodeId` 인자 = `type:'NODE'` 링크).
> - **대상 텍스트는 slot 으로 찾는다**: 링크는 TEXT 에만 걸리는데 지정 대상은 보통 `anno/marker` 같은 인스턴스다. 스펙 등록 시 심어둔 slot pluginData(`sigma-slot`)로 판정하므로 **이름 규약이 생기지 않고**, 텍스트가 둘인 `anno/legend`(번호 `n` + 설명 `desc`)에서도 번호만 정확히 집는다. 순서 의존인 "첫 TEXT" 휴리스틱과 다른 점. 해석 순서 = TEXT 그대로 → slot 일치 → 하위 TEXT 가 유일 → 그 밖은 모호하므로 에러(가능한 slot 안내).
> - `direction`: `both`(기본) / `a_to_b` / `b_to_a`. 뷰포트 이동엔 뒤로가기가 없어 왕복하려면 양쪽에 다 걸어야 한다. 쌍 단위 부분 실패 허용(단 한 쌍 안에서는 양쪽 해석이 다 되어야 걸린다 — 반쪽 배선 방지).
> - 배선 검증은 응답 `aTextId`/`bTextId` → `sigma_get_node_info`(TEXT 는 `hyperlinks` 필드 반환). 외부 URL·부분 범위 링크는 이 도구가 아니라 `sigma_modify_node` 의 `setRangeHyperlink`.

### 이미지/추출 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_screenshot` | 노드를 이미지로 캡처하여 파일 저장 | `token`, `nodeId` | `format`, `scale`, `filename` |
| `sigma_extract_node` | Figma 노드를 지정 포맷(JSON/HTML)으로 추출 | `token`, `nodeId` | `format` |
| `sigma_test_roundtrip` | 노드를 지정 포맷으로 추출 → 재생성 라운드트립 테스트 | `token`, `nodeId` | `format` |

### 페이지 관리 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_create_page` | 새 페이지 생성 | `token`, `name` | — |
| `sigma_rename_page` | 페이지 이름 변경 | `token`, `pageId`, `name` | — |
| `sigma_switch_page` | 페이지 전환 | `token`, `pageId` | — |
| `sigma_delete_page` | 페이지 삭제 (마지막 페이지 불가) | `token`, `pageId` | — |
| `sigma_reorder_page` | 페이지 순서 변경 | `token`, `pageId`, `index` | — |
| `sigma_set_page_data` | 페이지/문서 노드에 sigma 메타데이터 저장 | `token`, `key`, `value` | `pageId` |
| `sigma_get_page_data` | 저장된 메타데이터 조회 (`key` 미지정 시 전체 맵) | `token` | `key`, `pageId` |
| `sigma_delete_page_data` | 메타데이터 키 삭제 | `token`, `key` | `pageId` |
| `sigma_set_node_data` | 일반 노드에 sigma 메타데이터 저장 | `token`, `nodeId`, `key`, `value` | — |
| `sigma_get_node_data` | 노드 메타데이터 조회 (`key` 미지정 시 전체 맵) | `token`, `nodeId` | `key` |
| `sigma_delete_node_data` | 노드 메타데이터 키 삭제 | `token`, `nodeId`, `key` | — |

> **페이지/문서/노드 메타데이터**: PAGE/DOCUMENT 노드는 `sigma_modify_node` 가드로 막혀 있어 위 전용 도구로만 다룬다. 저장소는 그 노드의 `sharedPluginData`(namespace 고정 `"sigma"`)이며 `.fig`에 영속된다. `key`는 `^[a-zA-Z0-9_.-]+$`, `value`는 **유효한 JSON 문자열**. `pageId`는 미지정=바인딩 페이지 / 페이지 ID / `"document"`(문서 루트).
> - 예약 key **`"lint"`**(페이지/문서) = LintConfig. `sigma_lint`의 `per-page`/`merge` 모드가 참조하며, 플러그인 UI "페이지" 탭의 `lint 보기`/`lint 설정하기`가 같은 저장소를 편집한다. **문서(`pageId:"document"`)에 저장하면** 같은 JSON의 `componentSpec.warn`이 그 파일의 컴포넌트 스펙 등록 정책으로도 쓰인다(아래 컴포넌트 스펙 절).
> - 예약 key **`"lint-ignore"`**(일반 노드) = 그 노드만 룰 억제(inline suppress, `eslint-disable` 대응). `sigma_lint`가 위반 노드만 배치 조회해 걸러내고 `suppressed` 건수를 보고한다. 상세는 [`docs/lint/suppress.md`](docs/lint/suppress.md).

### 스타일 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_create_paint_style` | Paint(색상) 스타일 생성 | `token`, `name`, `paints` | `description` |
| `sigma_create_text_style` | Text 스타일 생성 | `token`, `name` | `fontSize`, `fontFamily`, `fontWeight`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration`, `description` |
| `sigma_create_effect_style` | Effect(그림자/블러) 스타일 생성 | `token`, `name`, `effects` | `description` |
| `sigma_create_grid_style` | Grid 스타일 생성 | `token`, `name`, `grids` | `description` |
| `sigma_apply_style` | 노드에 스타일 적용 | `token`, `nodeId`, `styleType`, `styleId` | — |
| `sigma_delete_style` | 스타일 삭제 | `token`, `styleId` | — |

### 변수 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_create_variable_collection` | 변수 컬렉션 생성 | `token`, `name` | — |
| `sigma_create_variable` | 변수 생성 (COLOR/FLOAT/STRING/BOOLEAN) | `token`, `name`, `collectionId`, `resolvedType` | — |
| `sigma_get_variables` | 로컬 변수/컬렉션 조회 | `token` | `type` |
| `sigma_set_variable_value` | 변수 모드별 값 설정 | `token`, `variableId`, `modeId`, `value` | — |
| `sigma_bind_variable` | 노드 속성에 변수 바인딩 | `token`, `nodeId`, `field`, `variableId` | — |
| `sigma_add_variable_mode` | 컬렉션에 모드 추가 (Light/Dark 등) | `token`, `collectionId`, `name` | — |
| `sigma_set_variable_scopes` | 변수 사용 범위 설정 | `token`, `variableId`, `scopes` | — |
| `sigma_set_variable_alias` | 변수 alias 설정 (다른 변수 참조) | `token`, `variableId`, `modeId`, `aliasTargetId` | — |
| `sigma_set_variable_code_syntax` | 변수 코드 구문 설정 | `token`, `variableId`, `platform`, `syntax` | — |
| `sigma_rename_variable` | 변수 이름 변경 | `token`, `variableId`, `name` | — |
| `sigma_delete_variable` | 변수 삭제 | `token`, `variableId` | — |

### Team Library (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_list_libraries` | 사용 가능한 Team Library 목록 조회 | `token` | — |
| `sigma_list_library_components` | 라이브러리 컴포넌트 목록 조회 | `token`, `libraryKey` | — |
| `sigma_list_library_variables` | 라이브러리 변수 컬렉션 목록 조회 | `token`, `collectionKey` | — |
| `sigma_import_library_component` | 라이브러리 컴포넌트 임포트 | `token`, `key` | — |
| `sigma_import_library_style` | 라이브러리 스타일 임포트 | `token`, `key` | — |

### 유틸리티 (토큰 필수)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_notify` | Figma UI에 알림 메시지 표시 | `token`, `message` | `options` |
| `sigma_commit_undo` | Undo 체크포인트 생성 | `token` | — |
| `sigma_trigger_undo` | Undo 실행 (마지막 작업 되돌리기) | `token` | — |
| `sigma_save_version` | 현재 상태를 버전 히스토리에 저장 | `token`, `title` | `description` |
| `sigma_set_export_settings` | 노드의 Export 설정 지정 | `token`, `nodeId`, `settings` | — |
| `sigma_get_export_settings` | 노드의 Export 설정 조회 | `token`, `nodeId` | — |

### FigJam (토큰 필수, FigJam 파일에서만 사용)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_create_sticky` | 스티키 노트 생성 | `token` | `text`, `x`, `y`, `parentId` |
| `sigma_create_connector` | 노드 간 연결선 생성 | `token`, `startNodeId`, `endNodeId` | `strokeColor`, `strokeWeight` |

### 데이터 저장/관리 (토큰 불필요)

| 도구 | 설명 | 필수 인자 | 선택 인자 |
|------|------|-----------|-----------|
| `sigma_save_extracted` | 추출 데이터 저장 | `name`, `data` | — |
| `sigma_list_saved` | 저장된 컴포넌트 목록 | — | — |
| `sigma_load_extracted` | 저장된 컴포넌트 로드 | `id` 또는 `name` | — |
| `sigma_delete_extracted` | 저장된 컴포넌트 삭제 | `id` | — |
| `sigma_save_and_import` | 저장 + 즉시 Figma 임포트 (토큰 필수) | `token`, `name` | `data`, `html`, `format` |

### 스크립트/스토리지/상태

| 도구 | 설명 |
|------|------|
| `sigma_get_playwright_scripts` | Sigma 임베드 스크립트 경로 + API 정보 반환 |
| `sigma_storage_stats` | 스토리지 용량 현황 (카테고리별) |
| `sigma_cleanup` | 스토리지 일괄 정리 (기간/카테고리 조건 — `extracted`/`screenshots`/`reports`/`all`) |
| `sigma_list_screenshots` | 저장된 스크린샷 목록 |
| `sigma_delete_screenshot` | 스크린샷 삭제 |
| `sigma_server_status` | 서버 전체 상태 확인 |

---

## 컴포넌트 추출

### 두 가지 방식

| 방식 | 사용 주체 | 용도 |
|------|-----------|------|
| **Sigma 확장** (Chrome Extension) | 사용자 (수동) | UI로 컴포넌트 선택 → 클립보드 복사 또는 서버 전송 |
| **Sigma 임베드 스크립트** (Playwright) | AI Agent | 자동화된 컴포넌트 추출 |

### 임베드 스크립트 API

**추출 스크립트 (`extractor.standalone.js`) — `window.__sigma__`:**
- `extract(selectorOrElement)` — CSS 선택자 또는 Element로 요소 추출
- `extractAt(x, y)` — 좌표로 요소 추출
- `extractAll(selector)` — 선택자에 매칭되는 모든 요소 추출
- `extractVisible(options?)` — 화면에 보이는 요소 추출 (`minWidth`, `minHeight` 옵션)
- `extractAndSave(name, selectorOrElement, serverUrl?)` — 추출 + 서버 저장 (저장 결과 반환)
- `findByAlt(altText)` — alt 텍스트로 요소 검색
- `findByText(text, tagName?)` — 텍스트 내용으로 요소 검색
- `findForm(action?)` — 폼 요소 검색
- `findContainer(options)` — 컨테이너 요소 검색
- `getElementInfo(selector)` — 요소의 상세 정보 조회
- `getPageStructure()` — 페이지 전체 구조 조회
- `getDesignTokens(selectorOrElement?)` — CSS 변수 기반 디자인 토큰 추출
- `version` — 버전 문자열

**Storybook 스크립트 (`storybook.standalone.js`) — `window.__sigma_storybook__`:**
- `getStories(baseUrl?)` — story 목록 조회 (메인 프레임)
- `navigateToStory(storyId, options?)` — SPA story 전환 + 렌더링 대기 (메인 프레임)
- `waitForStoryRendered(timeout?)` — 렌더링 완료 대기
- `extractStory(selector?)` — ExtractedNode 추출 (iframe)
- `extractAndSave(name, serverUrl?, selector?)` — 추출 + 서버 저장, `{success, id?, error?}` 반환 (iframe)
- `getStoryRoot()` — story 루트 요소 반환
- `getCurrentStoryId()` — 현재 표시 중인 story ID
- `getStoryIframeUrl(storyId, baseUrl?)` — story iframe URL 생성
- `version` — 버전 문자열

**Diff 스크립트 (`diff.standalone.js`) — `window.__sigma_diff__`:**
- `compare(nodeA, nodeB)` — 두 ExtractedNode 비교, 차이점 반환
- `snapshot(selectorOrNode)` — 요소/노드의 스냅샷 저장
- `compareWithSnapshot(snapshotId, selectorOrNode)` — 저장된 스냅샷과 현재 상태 비교
- `listSnapshots()` — 저장된 스냅샷 목록 조회
- `deleteSnapshot(id)` — 스냅샷 삭제
- `clearSnapshots()` — 모든 스냅샷 삭제
- `version` — 버전 문자열

### 추출 로직 직접 작성 금지

```javascript
// ❌ 직접 작성 금지
await page.evaluate(() => { function extractElement(el) { ... } });

// ✅ 반드시 Sigma 임베드 스크립트 사용
await page.addScriptTag({ path: '.../dist/extractor.standalone.js' });
const data = await page.evaluate(() => window.__sigma__.extract('...'));
```

스크립트 경로는 `sigma_get_playwright_scripts` 도구로 확인한다.

---

## Playwright 자동화 워크플로우

### 일반 웹페이지

```
1. sigma_get_playwright_scripts → extractor.standalone.js 경로 확인
2. Playwright로 페이지 이동
3. addScriptTag로 스크립트 inject
4. window.__sigma__.extract() 호출
5. sigma_create_frame으로 Figma에 생성
```

### Storybook (SPA 방식 필수)

```
1. sigma_get_playwright_scripts → storybook.standalone.js 경로 확인
2. 메인 Storybook 페이지 로드 (1회만)
3. 메인 프레임에 스크립트 inject (1회만)
4. getStories() → story 목록 조회
5. 각 story마다:
   a. navigateToStory(storyId) → SPA 전환
   b. iframe에 storybook 스크립트 inject (extractor 별도 주입 불필요 — 번들이 자기완결적)
   c. extractAndSave(name) → 서버에 저장 (`{success, id}` 반환 — `success` 확인 후 `id` 사용)
   d. sigma_import_saved(token, id) → Figma에 생성
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
│       │   ├── font-loader.ts # 폰트 로드/폴백
│       │   └── index.ts       # Barrel export
│       ├── node-ops/          # Figma 노드 조작
│       │   ├── index.ts       # Barrel export
│       │   ├── modify.ts      # 노드 속성 수정 (73개 메서드)
│       │   ├── create.ts      # 사각형/텍스트/빈 프레임/타원/다각형/별/선/벡터/이미지 생성
│       │   ├── query.ts       # 노드 정보 조회 (단일/배치/문서/스타일)
│       │   ├── batch.ts       # 배치 작업 (스캔/일괄수정/일괄삭제)
│       │   ├── selection.ts   # 선택 관리 (get/set) + 뷰포트
│       │   ├── components.ts  # 컴포넌트/인스턴스 관리
│       │   ├── component-spec.ts # 스펙 기반 컴포넌트 빌드/사용
│       │   ├── annotations.ts # 주석 관리
│       │   ├── prototyping.ts # 프로토타이핑/인터랙션
│       │   ├── hyperlink.ts   # 노드 간 상호 이동 링크 (slot 인지)
│       │   ├── frames.ts      # 프레임 목록/삭제
│       │   ├── removal.ts     # 삭제 되읽기 검증 (메인 COMPONENT 는 remove() 후에도 조회됨)
│       │   ├── section.ts     # Section 생성
│       │   ├── move.ts        # 이동/복제/그룹/언그룹/평탄화
│       │   ├── boolean.ts     # Boolean 연산 (Union/Subtract/Intersect/Exclude)
│       │   ├── styles.ts      # 스타일 CRUD (Paint/Text/Effect/Grid)
│       │   ├── variables.ts   # 변수/컬렉션 관리
│       │   ├── export.ts      # 이미지 export
│       │   ├── tree.ts        # 트리 탐색/검색
│       │   ├── page.ts        # 페이지 관리
│       │   ├── library.ts     # Team Library 조회/임포트
│       │   └── figjam.ts      # FigJam 스티키/커넥터
│       ├── extractor/         # Figma → JSON/HTML 역추출
│       │   ├── extract.ts     # Figma 노드 → ExtractedNode JSON
│       │   ├── html-export.ts # ExtractedNode → HTML 변환
│       │   └── index.ts       # Barrel export
│       ├── testing/roundtrip.ts # 추출→재생성 라운드트립 테스트
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
│       │   ├── hangul-escape.ts # 한글 \uXXXX 손조립 오타 감지 (도구 호출 경로 전체에 배선)
│       │   ├── spec-presets.ts # 내장 스펙 프리셋 (anno/wire)
│       │   └── handlers/      # 도구 핸들러 모듈
│       │       ├── auth.ts    # 인증/바인딩
│       │       ├── figma.ts   # Figma 프레임/노드 조작
│       │       ├── storage.ts # 데이터 저장/조회
│       │       ├── scripts.ts # 스크립트 정보
│       │       ├── management.ts # 스토리지/상태 관리
│       │       ├── lint.ts    # sigma_lint (scope/configMode 해석 + 실행)
│       │       └── component-spec.ts # 컴포넌트 스펙 등록/사용
│       ├── lint/               # 서버측 lint 지원
│       │   ├── resolve-config.ts # config 출처 3순위 + configMode 병합
│       │   ├── load-config.ts  # config 파일 로드/검증
│       │   ├── enrich.ts       # 노드 상세 보강 (fills/opacity 등)
│       │   ├── suppress.ts     # 노드 단위 lint 억제 (lint-ignore sharedPluginData 해석)
│       │   ├── run-custom-rule.ts # predicate 규칙 Worker 격리 실행
│       │   └── report.ts       # scope:file 결과 → markdown 리포트
│       ├── image/process.ts    # 이미지 후처리
│       ├── scripts/registry.ts # 임베드 스크립트 레지스트리
│       ├── storage/index.ts   # 파일 스토리지
│       ├── storage/component-specs.ts # 컴포넌트 스펙 레지스트리 (~/.sigma/component-specs)
│       └── auth/token.ts      # 토큰 관리
│
└── shared/                    # 공유 패키지
    ├── src/
    │   ├── types.ts           # ExtractedNode 등 공통 타입
    │   ├── constants.ts       # 포트, URL, 경로 상수
    │   ├── colors.ts          # CSS 색상 파싱 (parseColor)
    │   ├── extractor/         # 추출 로직 (Single Source of Truth)
    │   │   ├── core.ts        # extractElement + 고수준 함수
    │   │   ├── styles.ts      # 계산 스타일 → ExtractedNode 스타일
    │   │   ├── text.ts        # 텍스트 노드 추출
    │   │   ├── svg.ts         # SVG 처리
    │   │   ├── icons.ts       # 아이콘 폰트/이미지 처리
    │   │   ├── pseudo.ts      # ::before/::after 의사요소
    │   │   ├── visibility.ts  # 가시성 판정
    │   │   ├── utils.ts       # 공통 유틸
    │   │   └── index.ts
    │   ├── lint/              # Lint 엔진 (순수 함수, 유닛테스트)
    │   │   ├── engine.ts      # 규칙 실행/집계 + 자동수정 계획
    │   │   ├── types.ts       # LintConfig, BuiltinRuleId 등
    │   │   ├── geometric.ts   # 기하 8종 (좌표 기반)
    │   │   ├── simple-rules.ts # 구조/이름/가시성 6종 + raw_node
    │   │   ├── occlusion.ts   # fully_occluded_sibling
    │   │   ├── page-rules.ts  # 페이지 루트 전용 (content_spread, origin_anchor)
    │   │   ├── spec-instance.ts # 스펙 인스턴스 크기 (instance_resized_from_spec)
    │   │   ├── annotation-marker.ts # 기획 주석 마커↔범례 짝·거리 (룰 2종)
    │   │   ├── font.ts        # 파일 기본 폰트와 다른 TEXT (font_not_default)
    │   │   ├── json-rule.ts   # JSON 선언적 커스텀 규칙
    │   │   └── tree-utils.ts  # 트리 순회 헬퍼
    │   ├── enhancer/          # CDP 보강 레이어 (추출 결과를 CDP로 보강)
    │   │   ├── core.ts        # enhance(cdp, node, options)
    │   │   ├── font.ts        # 플랫폼 실제 폰트 해석
    │   │   ├── types.ts       # CDPClient, EnhanceOptions
    │   │   └── index.ts
    │   ├── discovery/         # 요소 탐색 API
    │   │   ├── core.ts        # findByText, findByAlt, findForm, findContainer, getPageStructure
    │   │   └── index.ts
    │   ├── storybook/         # Storybook 자동화
    │   │   ├── core.ts        # getStories, navigateToStory 등
    │   │   └── index.ts
    │   ├── diff/              # 컴포넌트 비교
    │   │   ├── core.ts        # diffNodes, diffSummary
    │   │   ├── snapshots.ts   # 스냅샷 저장/비교
    │   │   └── index.ts
    │   ├── component-spec/    # 컴포넌트 스펙 시스템
    │   │   ├── types.ts       # ComponentSpecRecord, ComponentParam 등
    │   │   ├── validate.ts    # 스펙 HTML 검증 (CSS 화이트리스트, slot 규칙, 박스모델 경고)
    │   │   ├── policy.ts      # 파일별 스펙 등록 정책 (순수 함수)
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
| MCP Server | 19832 (`/api/mcp`) | stdio / Streamable HTTP |

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
