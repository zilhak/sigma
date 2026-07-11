# 아키텍처

Sigma의 전체 시스템 구조와 모듈 간 통신 흐름을 설명합니다.

## 시스템 개요

Sigma는 4개의 모듈이 로컬 서버를 중심으로 연결되는 구조입니다. 각 모듈은 독립적으로 동작하면서도, 서버를 통해 연결되면 자동화 파이프라인이 됩니다.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              AI Agent                                   │
│                         (Claude Code + MCP)                             │
│                                                                         │
│  ┌──────────────────┐              ┌──────────────────┐                │
│  │   Playwright MCP │              │    Sigma MCP     │                │
│  │  (브라우저 제어)  │              │  (데이터 + Figma) │                │
│  └────────┬─────────┘              └────────┬─────────┘                │
└───────────│────────────────────────────────│───────────────────────────┘
            │                                │
            │ 브라우저 직접 조종              │ stdio / HTTP
            ▼                                ▼
┌───────────────────────────┐    ┌────────────────────────────────────────┐
│      Chrome Browser       │    │            Local Server                 │
│  ┌─────────────────────┐  │    │         http://localhost:19832          │
│  │   Chrome Extension  │  │    │                                        │
│  │  (컴포넌트 추출)    │──────────▶  HTTP API / WebSocket / MCP         │
│  └─────────────────────┘  │POST│                                        │
│  ┌─────────────────────┐  │    │         File Storage                   │
│  │     Web Page        │  │    │         ~/.sigma/extracted/             │
│  └─────────────────────┘  │    └────────────────────────│──────────────┘
└───────────────────────────┘                              │ WebSocket
                                                           ▼
                                              ┌────────────────────────────┐
                                              │       Figma Plugin         │
                                              │   (JSON → Figma Frame)     │
                                              └────────────────────────────┘
```

## 통신 프로토콜

| 경로 | 프로토콜 | 방향 | 설명 |
|------|----------|------|------|
| Agent → Server | MCP (stdio / Streamable HTTP) | 양방향 | AI Agent가 도구 호출 |
| Extension → Server | HTTP POST | 단방향 | 추출 데이터 전송 |
| Playwright → Browser | CDP | 양방향 | 브라우저 직접 조종 |
| Server ↔ Plugin | WebSocket | 양방향 | 명령 전달 + 결과 응답 |

## 포트 구성

| 서비스 | 포트 | 프로토콜 |
|--------|------|----------|
| HTTP Server + MCP | 19832 | HTTP (`/api/mcp` for MCP) |
| WebSocket Server | 19831 | WebSocket |

## 데이터 흐름

### 웹 → Figma (추출 파이프라인)

```
1. 웹페이지에서 DOM 요소 추출 (Extension 또는 Playwright + 임베드 스크립트)
2. ExtractedNode JSON 생성 (공통 추출 로직: @sigma/shared)
3. 서버로 전송 (HTTP POST 또는 MCP 도구 호출)
4. 서버가 WebSocket으로 Figma Plugin에 전달
5. Plugin이 JSON을 Figma 노드로 변환
```

### AI Agent 자동화 흐름

```
1. sigma_login → 토큰 발급
2. sigma_list_plugins → 연결된 Plugin 확인
3. sigma_bind(token, pluginId, pageId) → 바인딩
4. Playwright로 웹페이지 조작 + 임베드 스크립트로 추출
5. sigma_create_frame / sigma_import_saved → Figma에 생성
6. sigma_modify_node 등으로 추가 조작
```

## 핵심 데이터 타입

### ExtractedNode

DOM에서 추출된 요소를 표현하는 재귀적 트리 구조. 모든 추출/변환의 중심 타입입니다.

```typescript
interface ExtractedNode {
  tagName: string;
  className: string;
  children: ExtractedNode[];
  computedStyles: ComputedStyles;  // 40+ CSS 속성
  boundingRect: { x, y, width, height };
  textContent?: string;
  svgString?: string;
  // ...
}
```

### ComputedStyles

CSS computed style에서 추출한 40개 이상의 속성 (display, flexbox, grid, colors, fonts, borders 등).

## 서버 내부 구조

```
Server (index.ts)
├── HTTP API (Hono)            ← /api/health, /api/extracted, /api/figma/*
├── WebSocket Server           ← Plugin 연결 관리, 청킹 전송 (1MB 단위)
├── MCP Server                 ← 115개 도구 제공 (stdio + Streamable HTTP)
├── Auth (Token Store)         ← stk-{hex} 토큰, 10분 만료
├── Storage                    ← ~/.sigma/extracted/, screenshots/
└── Script Registry            ← 임베드 스크립트 경로 관리
```

### 부트스트랩 순서

```
startupCleanup()
  → FigmaWebSocketServer(:19831)
  → createHttpServer(wsServer)       // Hono app
  → createMcpRouter({wsServer})      // /api/mcp 마운트
  → HTTP server listen(:19832)
  → SIGINT/SIGTERM graceful shutdown
```

## Plugin 내부 구조

Figma Plugin은 두 개의 격리된 실행 환경으로 나뉩니다:

| 환경 | 파일 | 사용 가능 API | 역할 |
|------|------|---------------|------|
| Figma Sandbox | `code.ts` | `figma.*` API | 노드 생성/조작, Figma API 호출 |
| iframe | `ui.ts` | 브라우저 API, fetch, WebSocket | 서버 통신, UI 렌더링 |

두 환경 간 통신은 `postMessage`로만 가능합니다.

```
서버 ←(WebSocket)→ ui.ts ←(postMessage)→ code.ts ←(Figma API)→ Figma 캔버스
```

## 스토리지

| 경로 | 용도 | TTL |
|------|------|-----|
| `~/.sigma/extracted/` | 추출된 컴포넌트 JSON | 7일 |
| `~/.sigma/screenshots/` | 노드 캡처 이미지 | 7일 |

- 100MB 초과 시 자동으로 50MB까지 축소
- Docker 환경에서는 `SIGMA_HOST_DATA_DIR`로 경로 매핑
