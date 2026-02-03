# Sigma - Modular Design-to-Code Bridge

웹 컴포넌트를 추출하고 Figma와 AI Agent가 상호작용할 수 있는 모듈형 시스템

## 핵심 철학

**"서로 연동하면 최고의 효율, 따로따로도 사용 가능"**

각 모듈은 독립적으로 동작하면서도, 로컬 서버를 중심으로 연결되면 강력한 자동화 파이프라인이 됨.

---

## 아키텍처 개요

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
            │ (navigate, click 등)           │
            ▼                                ▼
┌───────────────────────────┐    ┌────────────────────────────────────────┐
│      Chrome Browser       │    │            Local Server                 │
│  ┌─────────────────────┐  │    │         http://localhost:9801           │
│  │   Chrome Extension  │  │    │                                         │
│  │  ┌───────────────┐  │  │    │  ┌─────────────┐  ┌─────────────────┐  │
│  │  │ 컴포넌트 추출  │  │──────────▶│  HTTP API   │  │   WebSocket     │  │
│  │  │               │  │  │POST│  │  (REST)     │  │    Server       │  │
│  │  └───────────────┘  │  │    │  └──────┬──────┘  └────────┬────────┘  │
│  └─────────────────────┘  │    │         │                  │           │
│                           │    │   ┌─────┴──────┐           │           │
│  ┌─────────────────────┐  │    │   │   File     │           │           │
│  │     Web Page        │  │    │   │  Storage   │           │           │
│  │   (Storybook 등)    │  │    │   └────────────┘           │           │
│  └─────────────────────┘  │    │                            │           │
└───────────────────────────┘    └────────────────────────────│───────────┘
                                                              │
                                                         WebSocket
                                                              │
                                                              ▼
                                              ┌────────────────────────────┐
                                              │       Figma Plugin         │
                                              │   (JSON → Figma Frame)     │
                                              └────────────────────────────┘
```

**핵심 원칙:**
- **Extension → Server**: Extension이 서버로 데이터를 일방적으로 Push (서버는 Listen만)
- **Playwright → Browser**: MCP 자동화 시 Playwright가 브라우저/Extension을 직접 조종
- **Server → Figma**: 서버가 WebSocket으로 Figma Plugin에 명령 전달

---

## 통신 방식

### Extension → Server (단방향 Push)

Extension이 추출한 데이터를 서버로 전송. 서버는 명령을 보내지 않음.

```
┌─────────────┐                    ┌─────────────┐
│  Extension  │                    │   Server    │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  사용자가 추출 버튼 클릭          │
       │  (또는 Playwright가 클릭)        │
       │                                  │
       │  컴포넌트 추출 실행               │
       │                                  │
       │  POST /api/extracted             │
       │  { name, data, format }          │
       │─────────────────────────────────▶│
       │                                  │ 저장
       │         { success: true, id }    │
       │◀─────────────────────────────────│
       │                                  │
```

### Server → Figma Plugin (WebSocket)

서버가 Figma Plugin에 프레임 생성 명령 전달.

```
┌─────────────┐                    ┌─────────────┐
│Figma Plugin │                    │   Server    │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  GET /api/health (5초 폴링)      │
       │─────────────────────────────────▶│
       │         { status: "ok" }         │
       │◀─────────────────────────────────│
       │                                  │
       │  서버 발견! WebSocket 연결       │
       │  ws://localhost:9800             │
       │═════════════════════════════════▶│
       │                                  │
       │    { type: "CREATE_FRAME", ... } │
       │◀═════════════════════════════════│
       │                                  │
       │  프레임 생성 후 결과 응답         │
       │═════════════════════════════════▶│
       │                                  │
```

---

## 모듈 상세

### 1. Chrome Extension

**목적:** 웹페이지에서 컴포넌트를 선택하여 구조화된 데이터로 추출

> **핵심 취지: "그 자체로도 쓸 수 있지만, 로컬 서버 설정하면 더 편리하다"**

#### 두 가지 독립적인 기능

| 기능 | 설명 | 서버 필요 |
|------|------|:---------:|
| **클립보드 복사** | 추출된 데이터를 클립보드에 복사 | ❌ |
| **서버 전송** | 추출된 데이터를 서버로 전송 | ✅ |

- 두 기능은 **완전히 별개의 액션**
- 서버가 떠있어도 클립보드 복사만 할 수 있음
- 사용자가 원하는 방식 선택

#### Popup UI 구성
```
┌─────────────────────────────┐
│  Sigma Component Extractor  │
├─────────────────────────────┤
│  [📋 복사]  [📤 서버 전송]   │  ← 별개 버튼
├─────────────────────────────┤
│  형식: ○ JSON  ○ HTML       │
├─────────────────────────────┤
│  서버: 🟢 연결됨             │  ← 상태 표시
└─────────────────────────────┘
```

#### 사용 흐름
1. 팝업 UI로 컴포넌트 선택 모드 활성화
2. 웹페이지에서 원하는 컴포넌트 클릭
3. 추출 완료 후:
   - **[복사]** 클릭 → 클립보드에 복사
   - **[서버 전송]** 클릭 → 서버로 POST (서버 연결 시에만 활성화)

#### 출력 형식

**HTML 형식** (범용, 다른 도구와 호환)
```html
<div style="display: inline-flex; background-color: rgb(0, 102, 255);
            padding: 4px 12px; border-radius: 9999px;">
  <span style="color: white; font-size: 14px; font-weight: 500;">
    Badge
  </span>
</div>
```

**JSON 형식** (Figma 최적화, 파싱 완료)
```json
{
  "tagName": "div",
  "className": "badge",
  "styles": {
    "display": "inline-flex",
    "backgroundColor": { "r": 0, "g": 0.4, "b": 1, "a": 1 },
    "paddingTop": 4,
    "paddingRight": 12,
    "borderRadius": 9999
  },
  "boundingRect": { "width": 72, "height": 28 },
  "children": [...]
}
```

#### manifest.json 설정
```json
{
  "manifest_version": 3,
  "name": "Sigma Component Extractor",
  "permissions": ["activeTab", "scripting", "storage", "clipboardWrite"],
  "host_permissions": [
    "<all_urls>",
    "http://localhost:9801/*"
  ]
}
```

#### Extension 통신 로직
```typescript
// popup.ts (또는 content.ts)
const SERVER_URL = 'http://localhost:9801';

let extractedData: ExtractedNode | null = null;
let serverConnected = false;

// 서버 상태 확인 (주기적으로 호출)
async function checkServerStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`);
    serverConnected = res.ok;
    updateUI(); // 서버 상태 UI 업데이트
    return serverConnected;
  } catch {
    serverConnected = false;
    updateUI();
    return false;
  }
}

// 추출 완료 시 데이터 저장 (아직 전송/복사 안 함)
function onExtractComplete(data: ExtractedNode) {
  extractedData = data;
  updateUI(); // 버튼 활성화
}

// [복사] 버튼 클릭 시 - 서버 상태와 무관하게 동작
async function onCopyClick() {
  if (!extractedData) return;

  const format = getSelectedFormat(); // 'json' | 'html'
  const text = format === 'json'
    ? JSON.stringify(extractedData, null, 2)
    : convertToHTML(extractedData);

  await navigator.clipboard.writeText(text);
  showToast('클립보드에 복사됨');
}

// [서버 전송] 버튼 클릭 시 - 서버 연결 시에만 활성화
async function onSendToServerClick() {
  if (!extractedData || !serverConnected) return;

  await fetch(`${SERVER_URL}/api/extracted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: getComponentName() || `component-${Date.now()}`,
      data: extractedData,
      format: getSelectedFormat(),
      timestamp: Date.now()
    })
  });

  showToast('서버로 전송됨');
}

// UI 업데이트
function updateUI() {
  // 서버 전송 버튼: 서버 연결 시에만 활성화
  sendButton.disabled = !serverConnected || !extractedData;

  // 복사 버튼: 데이터 있으면 항상 활성화
  copyButton.disabled = !extractedData;

  // 서버 상태 표시
  statusIndicator.className = serverConnected ? 'connected' : 'disconnected';
}

// 5초마다 서버 상태 확인
setInterval(checkServerStatus, 5000);
```

---

### 2. Local Server

**목적:** 데이터 저장소 + MCP 브릿지 + Figma 통신 허브

#### 구성 요소

| 컴포넌트 | 역할 | 포트/프로토콜 |
|----------|------|---------------|
| MCP Server | AI Agent와 통신 | stdio |
| HTTP Server | REST API + Dashboard | http://localhost:9801 |
| WebSocket Server | Figma Plugin 통신 | ws://localhost:9800 |
| File Storage | 추출 데이터 저장/관리 | ~/.sigma/extracted/ |

#### HTTP API 엔드포인트

```
HTTP Server (localhost:9801)
│
├── 상태 확인
│   └── GET  /api/health                 # 서버 상태
│
├── 데이터 관리 (Extension → Server)
│   ├── GET  /api/extracted              # 저장된 데이터 목록
│   ├── GET  /api/extracted/:id          # 특정 데이터 조회
│   ├── POST /api/extracted              # 새 데이터 저장 (Extension이 호출)
│   └── DELETE /api/extracted/:id        # 데이터 삭제
│
├── Figma 통신
│   └── POST /api/figma/create           # Figma로 프레임 생성 요청
│
└── Dashboard
    └── GET  /                           # Web UI
```

#### MCP Tools

```typescript
const mcpTools = [
  // === 데이터 관리 ===
  {
    name: "list_extracted",
    description: "저장된 추출 데이터 목록 조회",
    parameters: {}
  },
  {
    name: "get_extracted",
    description: "특정 추출 데이터 조회",
    parameters: {
      id: { type: "string" }
    }
  },
  {
    name: "delete_extracted",
    description: "추출 데이터 삭제",
    parameters: {
      id: { type: "string" }
    }
  },

  // === Figma 제어 ===
  {
    name: "figma_status",
    description: "Figma Plugin 연결 상태 확인",
    parameters: {}
  },
  {
    name: "figma_create_frame",
    description: "저장된 데이터로 Figma에 프레임 생성",
    parameters: {
      id: { type: "string", description: "추출 데이터 ID" },
      name: { type: "string", optional: true, description: "Figma 프레임 이름" }
    }
  },
  {
    name: "figma_create_from_data",
    description: "JSON 데이터로 Figma에 프레임 직접 생성",
    parameters: {
      data: { type: "object", description: "ExtractedNode JSON" },
      name: { type: "string", optional: true }
    }
  }
];
```

**Note:** Extension 제어 Tools는 없음. Playwright MCP가 브라우저를 직접 제어.

#### 디렉토리 구조
```
~/.sigma/
├── config.json           # 서버 설정
├── extracted/            # 추출된 데이터 저장
│   ├── button-primary.json
│   ├── badge-success.json
│   └── card-default.json
└── logs/                 # 로그 파일
    └── server.log
```

---

### 3. Figma Plugin

**목적:** JSON 데이터를 Figma 프레임으로 변환

> 📄 **구현 상세:** [FIGMA_IMPLEMENTATION.md](./FIGMA_IMPLEMENTATION.md)
>
> ExtractedNode 타입 정의, CSS→Figma 매핑, Figma API 사용법 등은 별도 문서 참조

> **Target: Figma Desktop App Only**
>
> 이 플러그인은 **Figma Desktop App 전용**입니다. Figma Web 버전은 브라우저 샌드박스 환경에서 localhost 접근이 불가능하므로 지원하지 않습니다. Desktop App의 Electron 환경에서는 localhost WebSocket/HTTP 연결이 정상 동작합니다.

#### 독립 사용 (Standalone)
- 플러그인 UI에서 JSON 직접 붙여넣기
- 가져오기 버튼으로 Figma 프레임 생성

#### 서버 연동 시

**연결 프로세스:**
```
1. Plugin UI 로드
       ↓
2. 5초마다 GET /api/health 폴링
       ↓
3. 서버 응답 시 → WebSocket 연결
       ↓
4. 서버 명령 대기 (CREATE_FRAME 등)
       ↓
5. 연결 끊기면 → 다시 폴링으로 복귀
```

#### Plugin UI 통신 코드
```typescript
// figma-plugin/src/ui.ts
const HTTP_URL = 'http://localhost:9801';
const WS_URL = 'ws://localhost:9800';

let ws: WebSocket | null = null;
let pollingInterval: number | null = null;

function startServerDetection() {
  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${HTTP_URL}/api/health`);
      if (res.ok) {
        stopPolling();
        connectWebSocket();
      }
    } catch {
      updateStatus('서버 대기 중...', 'waiting');
    }
  }, 5000);
}

function connectWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    updateStatus('서버 연결됨', 'connected');
    ws.send(JSON.stringify({ type: 'REGISTER', client: 'figma-plugin' }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    updateStatus('연결 끊김', 'disconnected');
    ws = null;
    startServerDetection();
  };
}

function handleServerMessage(msg: any) {
  switch (msg.type) {
    case 'CREATE_FRAME':
      parent.postMessage({
        pluginMessage: {
          type: 'create-from-json',
          data: msg.data,
          name: msg.name
        }
      }, '*');

      ws?.send(JSON.stringify({
        type: 'RESULT',
        commandId: msg.commandId,
        success: true
      }));
      break;

    case 'PING':
      ws?.send(JSON.stringify({ type: 'PONG' }));
      break;
  }
}

startServerDetection();
```

---

### 4. Playwright 연동

**목적:** 브라우저 자동화 (별도 MCP)

MCP 자동화 시 Playwright가 브라우저와 Extension을 직접 조종.

```
AI Agent
    │
    ├── Playwright MCP ──→ 브라우저 제어
    │   │                  - navigate(url)
    │   │                  - click(selector)
    │   │                  - Extension 팝업 열기
    │   │                  - Extension 버튼 클릭
    │   │
    │   └──→ Extension이 추출 → 서버로 POST
    │
    └── Sigma MCP ──→ 저장된 데이터 조회 + Figma 제어
        │              - list_extracted()
        │              - figma_create_frame()
        │
        └──→ Figma Plugin이 프레임 생성
```

**Playwright로 Extension 제어하는 방법:**
```typescript
// Playwright에서 Extension 팝업 열기
await page.click('[data-testid="sigma-extension-icon"]');

// 추출 버튼 클릭
await page.click('[data-testid="extract-button"]');

// 또는 키보드 단축키
await page.keyboard.press('Alt+Shift+E');
```

---

## 사용 시나리오

### 시나리오 1: 수동 사용 (서버 없이)

```
1. Chrome Extension 아이콘 클릭
2. "선택 모드" 버튼 클릭
3. 웹페이지에서 원하는 컴포넌트 클릭
4. 추출된 JSON이 클립보드에 복사됨
5. Figma Plugin 열기
6. JSON 붙여넣기
7. "가져오기" 버튼 클릭
```

### 시나리오 2: 서버 사용 (반자동)

```
1. sigma 서버 실행: sigma start
2. Extension이 서버 연결 상태 표시
3. Extension으로 컴포넌트 추출 → 서버에 자동 저장됨
4. http://localhost:9801 대시보드에서 저장된 컴포넌트 확인
5. "Figma로 보내기" 클릭
6. Figma Plugin이 자동으로 프레임 생성
```

### 시나리오 3: AI Agent 완전 자동화

```
User: "Storybook에서 Badge 컴포넌트를 Figma에 가져와줘"

AI Agent:
1. [Playwright] navigate("http://localhost:6006/?path=/story/badge")
2. [Playwright] waitForSelector(".badge")
3. [Playwright] Extension 팝업 열기
4. [Playwright] 추출 버튼 클릭
   → Extension이 추출 후 서버로 POST
5. [Sigma] list_extracted()
   → 방금 저장된 컴포넌트 ID 확인
6. [Sigma] figma_create_frame({ id: "badge-xxx" })
   → Figma에 프레임 생성됨

AI: "Badge 컴포넌트를 Figma에 가져왔습니다!"
```

### 시나리오 4: 일괄 디자인 시스템 동기화

```
User: "Storybook의 모든 Button variant를 Figma로 동기화해줘"

AI Agent:
1. [Playwright] navigate("http://localhost:6006")
2. [Playwright] 사이드바에서 Button 스토리 목록 수집
3. for each variant in ["primary", "secondary", "outline", "ghost"]:
   - [Playwright] click(variant story)
   - [Playwright] Extension 추출 버튼 클릭
   - [Sigma] figma_create_frame({ id: 최신, name: `Button/${variant}` })
4. 완료

AI: "4개의 Button variant를 Figma에 동기화했습니다!"
```

---

## 프로젝트 구조

```
sigma/
├── packages/
│   ├── chrome-extension/         # Chrome Extension
│   │   ├── src/
│   │   │   ├── background.ts     # Service Worker
│   │   │   ├── content.ts        # Content Script (추출 로직)
│   │   │   ├── popup/            # Popup UI
│   │   │   │   ├── popup.html
│   │   │   │   ├── popup.ts
│   │   │   │   └── popup.css
│   │   │   └── extractor/        # 컴포넌트 추출 로직
│   │   │       ├── index.ts
│   │   │       ├── styles.ts     # getComputedStyle 처리
│   │   │       └── formats.ts    # HTML/JSON 변환
│   │   ├── manifest.json
│   │   └── package.json
│   │
│   ├── server/                   # Local Server
│   │   ├── src/
│   │   │   ├── index.ts          # 메인 엔트리
│   │   │   ├── mcp/              # MCP Server
│   │   │   │   ├── server.ts
│   │   │   │   └── tools.ts
│   │   │   ├── http/             # HTTP Server
│   │   │   │   ├── server.ts
│   │   │   │   └── routes/
│   │   │   │       ├── health.ts
│   │   │   │       ├── extracted.ts
│   │   │   │       └── figma.ts
│   │   │   ├── websocket/        # WebSocket Server
│   │   │   │   └── server.ts
│   │   │   ├── storage/          # File Storage
│   │   │   │   └── index.ts
│   │   │   └── dashboard/        # Web Dashboard
│   │   │       ├── index.html
│   │   │       └── assets/
│   │   └── package.json
│   │
│   ├── figma-plugin/             # Figma Plugin
│   │   ├── src/
│   │   │   ├── code.ts           # Plugin Main (Figma API)
│   │   │   ├── ui.ts             # Plugin UI
│   │   │   ├── ui.html
│   │   │   └── converter/        # JSON → Figma 변환
│   │   │       ├── index.ts
│   │   │       ├── frame.ts
│   │   │       ├── text.ts
│   │   │       └── styles.ts
│   │   ├── manifest.json
│   │   └── package.json
│   │
│   └── shared/                   # 공유 타입/유틸
│       ├── src/
│       │   ├── types.ts          # ExtractedNode 등 공통 타입
│       │   ├── utils.ts          # 공통 유틸리티
│       │   └── constants.ts      # 포트 번호 등 상수
│       └── package.json
│
├── CLAUDE.md                     # 아키텍처 및 구현 명세
├── FIGMA_IMPLEMENTATION.md       # Figma Plugin 구현 가이드 (JSON→Figma 변환)
├── README.md                     # 프로젝트 소개
├── package.json                  # 모노레포 설정
└── bunfig.toml                   # Bun 설정 (workspace 포함)
```

---

## 기술 스택

| 모듈 | 기술 |
|------|------|
| Chrome Extension | TypeScript, Chrome Extension Manifest V3 |
| Local Server | Bun, TypeScript, Hono, @modelcontextprotocol/sdk |
| Figma Plugin | TypeScript, Figma Plugin API |
| Shared | TypeScript |
| Build | esbuild (Extension/Plugin), Bun (Server) |
| Package Manager | Bun workspace |
| Dashboard | Vanilla JS 또는 Preact (경량) |

---

## 포트 및 프로토콜

| 서비스 | 포트 | 프로토콜 | 용도 |
|--------|------|----------|------|
| HTTP Server | 9801 | HTTP | REST API, Dashboard |
| WebSocket Server | 9800 | WebSocket | Figma Plugin 통신 |
| MCP Server | - | stdio | AI Agent 통신 |

---

## 설정 파일

### Server 설정
```json
// ~/.sigma/config.json
{
  "server": {
    "httpPort": 9801,
    "wsPort": 9800
  },
  "storage": {
    "path": "~/.sigma/extracted",
    "autoSave": true
  },
  "figma": {
    "pingInterval": 10000
  }
}
```

### Extension 설정 (storage.local)
```json
{
  "serverUrl": "http://localhost:9801",
  "defaultFormat": "json",
  "autoSendToServer": true
}
```

### Figma Plugin 설정
```json
{
  "serverHttpUrl": "http://localhost:9801",
  "serverWsUrl": "ws://localhost:9800",
  "pollingInterval": 5000
}
```

---

## 개발 명령어

```bash
# 의존성 설치
bun install

# 전체 개발 모드
bun dev

# 개별 패키지
bun run --filter @sigma/extension dev      # Extension (watch)
bun run --filter @sigma/server dev         # Server (watch)
bun run --filter @sigma/figma-plugin dev   # Figma Plugin (watch)

# 빌드
bun run build

# 서버 실행 (production)
bun run --filter @sigma/server start

# Extension 로드
# chrome://extensions → 개발자 모드 → packages/chrome-extension/dist 로드

# Figma Plugin 로드
# Figma → Plugins → Development → Import plugin from manifest
# → packages/figma-plugin/manifest.json 선택
```

---

## 개발 단계

### Phase 1: 기반 구축 (3-4일)
- [ ] Shared 패키지: ExtractedNode 타입 정의
- [ ] Extension: 컴포넌트 추출 + 클립보드 복사
- [ ] Extension: 서버 연결 시 자동 POST
- [ ] Figma Plugin: JSON 붙여넣기 → 프레임 생성
- [ ] 독립 사용 가능하게 완성

### Phase 2: Server 구현 (4-5일)
- [ ] HTTP Server + REST API
- [ ] WebSocket Server (Figma 통신)
- [ ] File Storage
- [ ] 간단한 Dashboard

### Phase 3: MCP 구현 (2-3일)
- [ ] MCP Server 기본 구조
- [ ] 데이터 관리 Tools
- [ ] Figma 제어 Tools

### Phase 4: 통합 및 문서화 (2일)
- [ ] Playwright + Sigma MCP 연동 테스트
- [ ] 에러 핸들링
- [ ] README 및 사용 가이드

**예상 총 기간: 약 2주**

---

## 보안 고려사항

1. **localhost만 허용**
   - 서버는 127.0.0.1에서만 리스닝
   - 외부 네트워크 접근 차단

2. **CORS 설정**
   ```typescript
   app.use(cors({
     origin: [
       /^chrome-extension:\/\//,
       'http://localhost:9801'
     ]
   }));
   ```

3. **Extension host_permissions**
   ```json
   "host_permissions": ["http://localhost:9801/*"]
   ```

4. **입력 검증**
   - POST /api/extracted 에서 데이터 스키마 검증
   - 파일명 sanitization (path traversal 방지)

---

## 향후 확장 가능성

- [ ] 디자인 토큰 추출 (CSS 변수 → Figma Variables)
- [ ] 반대 방향 동기화 (Figma → Code)
- [ ] 컴포넌트 버전 관리 및 diff
- [ ] 팀 협업 (클라우드 서버 옵션)
- [ ] VS Code Extension 연동
- [ ] 다른 디자인 도구 지원 (Sketch, Adobe XD)
