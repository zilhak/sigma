# Sigma

웹 컴포넌트를 추출하여 Figma로 가져오는 모듈형 Design-to-Code Bridge

## 개요

```
Web Page → Chrome Extension → Local Server → Figma Plugin → Figma
                                   ↑
                              AI Agent (MCP)
```

**핵심 철학:** 서로 연동하면 최고의 효율, 따로따로도 사용 가능

## 모듈 구성

| 모듈 | 역할 |
|------|------|
| **Chrome Extension** | 웹페이지에서 컴포넌트 선택 및 추출 |
| **Local Server** | 중앙 허브, MCP 서버, HTTP/WebSocket API |
| **Figma Plugin** | JSON 데이터를 Figma 프레임으로 변환 |

---

## 컴포넌트 추출 기능

웹 컴포넌트 추출은 두 가지 방식으로 수행합니다:

| 방식 | 사용 주체 | 용도 |
|------|-----------|------|
| **Chrome Extension** | 사용자 (수동) | UI로 직접 컴포넌트 선택하여 추출 |
| **Standalone Extractor** | AI Agent / Playwright | 자동화된 컴포넌트 추출 |

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

### AI Agent 자동화 시 (Standalone Extractor)

Playwright로 브라우저를 조작할 때는 **Standalone Extractor**를 사용합니다:

```
❌ 잘못된 방법: page.evaluate()로 직접 DOM 추출 로직 작성
✅ 올바른 방법: Sigma MCP의 get_playwright_scripts로 경로 확인
               → page.addScriptTag()로 inject
               → window.__sigma__.extract() 호출
```

`packages/shared/dist/extractor.standalone.js`가 빌드된 추출 스크립트입니다. Extension 설치 없이 자동화 가능합니다.

## 기술 스택

- **Runtime:** Bun
- **Language:** TypeScript
- **Server Framework:** Hono
- **MCP:** @modelcontextprotocol/sdk
- **Package Manager:** Bun workspace

## 빠른 시작

### 개발 환경

```bash
# 의존성 설치
bun install

# 개발 모드 (watch)
bun dev

# 서버만 실행
bun run --filter @sigma/server start
```

### 프로덕션 환경 (Docker)

```bash
# 서버 시작 (백그라운드, 자동 재시작)
docker compose up -d

# 로그 확인
docker compose logs -f sigma

# 서버 중지
docker compose down
```

> Docker Desktop의 "Start on login" 옵션과 함께 사용하면 컴퓨터 부팅 시 자동으로 서버가 시작됩니다.

## 사용 방법

### 수동 (서버 없이)
1. Extension으로 컴포넌트 추출 → 클립보드 복사
2. Figma Plugin에서 JSON 붙여넣기 → 프레임 생성

### AI Agent 자동화

**MCP 서버 등록 (Claude Code):**
```bash
claude mcp add --transport http sigma http://localhost:19832/api/mcp
```

**사용 예시:**
```
User: "Storybook에서 Badge 컴포넌트를 Figma에 가져와줘"

AI Agent:
1. [Playwright] 페이지 이동
2. [Sigma MCP] figma_create_frame()
```

**MCP 도구 목록:**
| 도구 | 설명 |
|------|------|
| `figma_status` | Figma 연결 상태 확인 |
| `figma_create_frame` | JSON 데이터로 Figma 프레임 생성 |
| `figma_get_frames` | Figma 현재 페이지의 프레임 목록 조회 |
| `figma_import_file` | 저장된 컴포넌트를 Figma로 가져오기 |
| `list_saved` | 저장된 컴포넌트 목록 |
| `save_extracted` | 컴포넌트 저장 |
| `get_playwright_scripts` | Playwright용 스크립트 경로 + API 정보 반환 |

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
