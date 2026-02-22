# Sigma

웹 컴포넌트를 추출하여 Figma로 가져오는 모듈형 Design-to-Code Bridge

## 개요

**목표: Figma Plugin API의 모든 기능을 MCP 도구로 노출하여, AI Agent가 Figma를 완전히 제어할 수 있게 한다.**

```
Web Page → Chrome Extension → Local Server → Figma Plugin → Figma
                                   ↑
                              AI Agent (MCP)
```

**핵심 철학:** 서로 연동하면 최고의 효율, 따로따로도 사용 가능

Sigma는 Figma Plugin API가 제공하는 모든 기능을 MCP(Model Context Protocol) 도구로 1:1 매핑하여, AI Agent가 프로그래밍 방식으로 Figma를 완전히 제어할 수 있는 브릿지 시스템입니다. 현재 84개의 MCP 도구가 구현되어 있으며, Figma Plugin API의 전체 커버리지를 향해 지속 확장 중입니다.

## 모듈 구성

| 모듈 | 역할 |
|------|------|
| **Chrome Extension** | 웹페이지에서 컴포넌트 선택 및 추출 |
| **Local Server** | 중앙 허브, MCP 서버, HTTP/WebSocket API |
| **Figma Plugin** | JSON 데이터를 Figma 프레임으로 변환 |
| **Shared** | 추출 로직, 타입, 임베드 스크립트 (공통 패키지) |

---

## 컴포넌트 추출 기능

웹 컴포넌트 추출은 두 가지 방식으로 수행합니다:

| 방식 | 사용 주체 | 용도 |
|------|-----------|------|
| **Sigma 확장** (Chrome Extension) | 사용자 (수동) | UI로 직접 컴포넌트 선택하여 추출 |
| **Sigma 임베드 스크립트** (추출 스크립트) | AI Agent / Playwright | 자동화된 컴포넌트 추출 |

두 방식 모두 `packages/shared/src/extractor/core.ts`의 동일한 추출 로직을 사용합니다.

### 추출되는 정보

| 항목 | 설명 |
|------|------|
| **DOM 구조** | tagName, className, children (재귀적 추출) |
| **Computed Styles** | display, flexbox, padding, margin, colors, fonts 등 40+ 속성 |
| **Bounding Rect** | x, y, width, height |
| **텍스트** | 직접 텍스트 콘텐츠 (자식 제외) |
| **SVG** | inline SVG는 `svgString`으로 전체 마크업 캡처 |

### Chrome Extension (수동)

1. Extension 아이콘 클릭 → 팝업 열기
2. **[선택 모드]** 클릭 → 웹페이지에서 컴포넌트 hover/클릭
3. 추출 완료 후:
   - **[복사]**: 클립보드에 JSON 복사 (서버 없이 사용 가능)
   - **[서버 전송]**: 서버로 POST → Figma로 자동 전송

### AI Agent 자동화 시 (Sigma 임베드 스크립트)

Playwright로 브라우저를 조작할 때는 **Sigma 임베드 스크립트**(추출 스크립트)를 사용합니다:

```
❌ 잘못된 방법: page.evaluate()로 직접 DOM 추출 로직 작성
✅ 올바른 방법: Sigma MCP의 get_playwright_scripts로 임베드 스크립트 경로 확인
               → page.addScriptTag()로 inject
               → window.__sigma__.extract() 호출
```

`packages/shared/dist/extractor.standalone.js`가 빌드된 추출 스크립트입니다. Extension 설치 없이 자동화 가능합니다.

### 임베드 스크립트 (3종)

Playwright `addScriptTag()`으로 inject하여 사용하는 자체 완결형 JS 번들:

| 스크립트 | 전역 객체 | 용도 |
|----------|----------|------|
| `extractor.standalone.js` | `window.__sigma__` | DOM → ExtractedNode 추출, 요소 탐색 (Discovery API) |
| `storybook.standalone.js` | `window.__sigma_storybook__` | Story 목록 조회, SPA 전환, 추출+서버 저장 |
| `diff.standalone.js` | `window.__sigma_diff__` | ExtractedNode 비교, 스냅샷 관리 |

**추출 스크립트 주요 API:**
- `extract(selector)` / `extractAll(selector)` / `extractVisible()` — 요소 추출
- `findByText(text)` / `findByAlt(alt)` / `findForm()` / `findContainer()` — 요소 탐색 (Discovery)
- `getPageStructure()` / `getDesignTokens()` — 페이지 구조/디자인 토큰

**Storybook 스크립트 주요 API:**
- `getStories()` — story 목록 조회
- `navigateToStory(storyId)` — SPA story 전환 (page.goto 대신 사용 필수)
- `extractAndSave(name)` — 추출 + 서버 저장 (ID 반환)

**Diff 스크립트 주요 API:**
- `compare(nodeA, nodeB)` — 두 ExtractedNode 비교
- `snapshot(selector)` / `compareWithSnapshot(id, selector)` — 스냅샷 기반 비교

## 기술 스택

- **Runtime:** Bun
- **Language:** TypeScript
- **Server Framework:** Hono
- **MCP:** @modelcontextprotocol/sdk
- **Package Manager:** Bun workspace

## 설치

### 사전 요구사항

- [Bun](https://bun.sh/) v1.0+
- [Figma Desktop App](https://www.figma.com/downloads/) (Web 버전 미지원)

### 빌드 및 실행

```bash
# 1. 소스 클론
git clone https://github.com/zilhak/sigma.git
cd sigma

# 2. 의존성 설치
bun install

# 3. 전체 빌드 (서버 + 임베드 스크립트 + Figma Plugin)
bun run build

# 4. 서버 실행
bun run --filter @sigma/server start
```

### Figma Plugin 설치

1. Figma Desktop App 실행
2. Plugins → Development → **Import plugin from manifest**
3. `packages/figma-plugin/dist/manifest.json` 선택

### Chrome Extension 설치 (선택)

1. `chrome://extensions` → 개발자 모드 ON
2. **압축해제된 확장 프로그램을 로드합니다** 클릭
3. `packages/chrome-extension/dist` 폴더 선택

### 개발 모드

```bash
# 파일 변경 시 자동 재빌드 (watch)
bun dev
```

## 사용 방법

### 수동 (서버 없이)
1. Extension으로 컴포넌트 추출 → 클립보드 복사
2. Figma Plugin에서 JSON 붙여넣기 → 프레임 생성

### AI Agent 자동화 (Claude Code + MCP)

**MCP 서버 등록:**
```bash
claude mcp add --transport http sigma http://localhost:19832/api/mcp
```

**사용 예시:**
```
User: "Storybook에서 Badge 컴포넌트를 Figma에 가져와줘"

AI Agent:
1. [Sigma MCP] sigma_login → 토큰 발급
2. [Sigma MCP] sigma_list_plugins → pluginId 확인
3. [Sigma MCP] sigma_bind(token, pluginId, pageId) → 바인딩
4. [Playwright] 페이지 이동 + 추출 스크립트 inject
5. [Sigma MCP] sigma_create_frame(token, data) → Figma에 생성
```

**MCP 도구 (84개):**

| 분류 | 도구 | 설명 |
|------|------|------|
| 인증 | `sigma_login` / `sigma_logout` | 토큰 발급 / 삭제 |
| | `sigma_bind` / `sigma_status` | 플러그인+페이지 바인딩 / 상태 확인 |
| 정보 | `sigma_list_plugins` / `sigma_list_pages` | 플러그인 / 페이지 목록 |
| 생성 | `sigma_create_frame` | JSON/HTML 데이터로 프레임 생성 |
| | `sigma_import_file` | 저장된 컴포넌트를 Figma로 가져오기 |
| | `sigma_create_rectangle` / `sigma_create_text` | 사각형 / 텍스트 노드 생성 |
| | `sigma_create_empty_frame` / `sigma_create_section` | 빈 프레임 (Auto Layout) / Section 생성 |
| | `sigma_create_ellipse` / `sigma_create_polygon` | 타원 / 다각형 생성 |
| | `sigma_create_star` / `sigma_create_line` | 별 / 선 생성 |
| | `sigma_create_vector` / `sigma_create_image` | 벡터 (SVG path) / 이미지 (base64) 생성 |
| | `sigma_create_component_instance` | 컴포넌트 인스턴스 생성 |
| 조작 | `sigma_modify_node` | 노드 속성 변경 (53개 메서드) |
| | `sigma_batch_modify` | 여러 노드에 modify 일괄 실행 |
| | `sigma_update_frame` | 기존 프레임 내용 교체 |
| | `sigma_delete_frame` / `sigma_batch_delete` | 프레임 삭제 / 일괄 삭제 |
| | `sigma_move_node` / `sigma_clone_node` | 노드 이동 / 복제 |
| | `sigma_set_multiple_text_contents` | 여러 텍스트 노드 일괄 변경 |
| | `sigma_group_nodes` / `sigma_ungroup` | 그룹 묶기 / 해제 |
| | `sigma_flatten` / `sigma_boolean_operation` | 벡터 평탄화 / Boolean 연산 |
| 조회 | `sigma_find_node` / `sigma_get_tree` | 노드 검색 / 계층 탐색 |
| | `sigma_get_node_info` / `sigma_get_nodes_info` | 노드 상세 정보 (단일/배치) |
| | `sigma_get_frames` / `sigma_get_document_info` | 프레임 목록 / 문서 정보 |
| | `sigma_get_styles` / `sigma_get_selection` | 스타일 / 선택 노드 조회 |
| | `sigma_set_selection` / `sigma_read_my_design` | 노드 선택 / 선택 노드 상세 |
| | `sigma_get_viewport` / `sigma_set_viewport` | 뷰포트 조회 / 설정 |
| | `sigma_scan_text_nodes` / `sigma_scan_nodes_by_types` | 텍스트/타입별 노드 스캔 |
| 컴포넌트 | `sigma_get_local_components` | 로컬 컴포넌트 목록 |
| | `sigma_get_instance_overrides` / `sigma_set_instance_overrides` | 인스턴스 오버라이드 |
| 주석 | `sigma_get_annotations` / `sigma_set_annotation` | 주석 조회/추가 |
| | `sigma_set_multiple_annotations` | 주석 일괄 추가 |
| 프로토타입 | `sigma_get_reactions` / `sigma_add_reaction` | 인터랙션 조회/추가 |
| | `sigma_remove_reactions` | 인터랙션 제거 |
| 페이지 | `sigma_create_page` / `sigma_rename_page` | 페이지 생성 / 이름 변경 |
| | `sigma_switch_page` / `sigma_delete_page` | 페이지 전환 / 삭제 |
| 스타일 | `sigma_create_paint_style` / `sigma_create_text_style` | Paint / Text 스타일 생성 |
| | `sigma_create_effect_style` / `sigma_create_grid_style` | Effect / Grid 스타일 생성 |
| | `sigma_apply_style` / `sigma_delete_style` | 스타일 적용 / 삭제 |
| 변수 | `sigma_create_variable_collection` / `sigma_create_variable` | 변수 컬렉션 / 변수 생성 |
| | `sigma_get_variables` / `sigma_set_variable_value` | 변수 조회 / 값 설정 |
| | `sigma_bind_variable` / `sigma_add_variable_mode` | 변수 바인딩 / 모드 추가 |
| 이미지 | `sigma_screenshot` / `sigma_extract_node` | 캡처 / JSON·HTML 추출 |
| | `sigma_test_roundtrip` | 추출→재생성 라운드트립 테스트 |
| 데이터 | `save_extracted` / `load_extracted` | 추출 데이터 저장/로드 |
| | `list_saved` / `delete_extracted` | 저장된 컴포넌트 목록/삭제 |
| | `save_and_import` | 저장 + 즉시 Figma 임포트 |
| 스크립트 | `get_playwright_scripts` | 임베드 스크립트 경로 + API 정보 |
| 관리 | `server_status` / `sigma_storage_stats` | 서버 상태 / 스토리지 현황 |
| | `sigma_cleanup` / `list_screenshots` / `delete_screenshot` | 스토리지 정리 / 스크린샷 관리 |

전체 도구 목록 및 파라미터 상세는 [CLAUDE.md](./CLAUDE.md)를 참조하세요.

### Docker (선택 - 서버만)

> MCP(stdio)와 Playwright 스크립트 inject는 로컬 실행이 필요하므로, AI Agent 자동화를 사용하려면 위의 소스 빌드 방식을 권장합니다. Docker는 HTTP API + WebSocket 서버만 분리 실행할 때 사용합니다.

```bash
docker compose up -d
```

## 문서

상세 구현 계획 및 아키텍처는 [CLAUDE.md](./CLAUDE.md) 참조

## 포트

| 서비스 | 포트 |
|--------|------|
| HTTP Server | 19832 |
| WebSocket Server | 19831 |

## 제약 사항

- **Figma Plugin:** Desktop App 전용 (Web 버전 미지원)
- **서버:** localhost만 리스닝 (보안)

## License

MIT
