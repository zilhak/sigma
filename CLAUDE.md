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
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ MCP (stdio)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Local Server                                   │
│                        http://localhost:9801                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  MCP Server │  │  HTTP API   │  │  WebSocket  │  │   Web UI    │    │
│  │   (stdio)   │  │  (REST)     │  │   Server    │  │  Dashboard  │    │
│  └─────────────┘  └──────┬──────┘  └──────┬──────┘  └─────────────┘    │
│                          │                │                             │
│                    ┌─────┴─────┐          │                             │
│                    │  Command  │          │                             │
│                    │   Queue   │          │                             │
│                    └───────────┘          │                             │
│                          │                │                             │
│                    ┌─────┴─────┐          │                             │
│                    │   File    │          │                             │
│                    │  Storage  │          │                             │
│                    └───────────┘          │                             │
└────────────────────────┬──────────────────┼─────────────────────────────┘
                         │                  │
              HTTP (Long Polling)      WebSocket
                         │                  │
                         ▼                  ▼
┌────────────────────────────────┐  ┌────────────────────────┐
│      Chrome Extension          │  │    Figma Plugin        │
│  ┌──────────────────────────┐  │  │  ┌──────────────────┐  │
│  │  Long Polling            │  │  │  │  WebSocket 연결  │  │
│  │  GET /api/ext/commands   │  │  │  │  폴링 → 감지 →   │  │
│  └──────────────────────────┘  │  │  │  WebSocket 전환  │  │
│  ┌──────────────────────────┐  │  │  └──────────────────┘  │
│  │  결과 전송               │  │  └────────────────────────┘
│  │  POST /api/ext/result    │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
             │
             ▼
┌────────────────────────────────┐
│     Web Page / Storybook       │
└────────────────────────────────┘
```

---

## 통신 방식

### HTTP Long Polling (Extension ↔ Server)

Native Messaging 대신 HTTP Long Polling 사용. 설치 복잡도를 대폭 낮추면서 거의 실시간 통신 가능.

```
┌─────────────┐                    ┌─────────────┐
│  Extension  │                    │   Server    │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  GET /api/ext/commands?wait=30   │
       │─────────────────────────────────▶│
       │                                  │ (명령 없으면 최대 30초 대기)
       │                                  │
       │         { command: {...} }       │
       │◀─────────────────────────────────│
       │                                  │
       │  명령 실행 (컴포넌트 추출 등)    │
       │                                  │
       │  POST /api/ext/result            │
       │─────────────────────────────────▶│
       │                                  │
       │         { success: true }        │
       │◀─────────────────────────────────│
       │                                  │
       │  즉시 다음 Long Polling 시작     │
       │─────────────────────────────────▶│
       │                                  │
```

### WebSocket (Figma Plugin ↔ Server)

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
       │  ◀═══ 양방향 실시간 통신 ═══▶   │
       │                                  │
```

---

## 모듈 상세

### 1. Chrome Extension

**목적:** 웹페이지에서 컴포넌트를 선택하여 구조화된 데이터로 추출

#### 독립 사용 (Standalone)
- 팝업 UI로 컴포넌트 선택 모드 활성화
- 추출된 데이터를 클립보드에 복사
- HTML 또는 JSON 형식 선택 가능

#### 서버 연동 시
- Long Polling으로 서버 명령 대기
- 서버의 명령을 받아 자동 추출
- 추출 결과를 서버로 직접 전송

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
// background.ts
const SERVER_URL = 'http://localhost:9801';
let isConnected = false;

async function startLongPolling() {
  while (true) {
    try {
      // 30초 대기하는 Long Polling
      const res = await fetch(`${SERVER_URL}/api/ext/commands?wait=30`);
      const { command } = await res.json();

      if (command) {
        isConnected = true;
        const result = await executeCommand(command);

        await fetch(`${SERVER_URL}/api/ext/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commandId: command.id,
            result
          })
        });
      }
    } catch (error) {
      isConnected = false;
      await sleep(5000); // 서버 없으면 5초 후 재시도
    }
  }
}

async function executeCommand(command: Command) {
  switch (command.type) {
    case 'EXTRACT':
      return await extractComponent(command.params);
    case 'SET_FORMAT':
      return setOutputFormat(command.params.format);
    case 'GET_STATUS':
      return { connected: true, format: currentFormat };
  }
}

// Extension 시작 시 Long Polling 시작
startLongPolling();
```

---

### 2. Local Server

**목적:** 모든 모듈의 중앙 허브, MCP 서버 역할

#### 구성 요소

| 컴포넌트 | 역할 | 포트/프로토콜 |
|----------|------|---------------|
| MCP Server | AI Agent와 통신 | stdio |
| HTTP Server | REST API + Long Polling + Dashboard | http://localhost:9801 |
| WebSocket Server | Figma Plugin 실시간 통신 | ws://localhost:9800 |
| File Storage | 추출 데이터 저장/관리 | ~/.sigma/extracted/ |

#### HTTP API 엔드포인트

```
HTTP Server (localhost:9801)
│
├── Extension 통신
│   ├── GET  /api/ext/commands?wait=30   # Long Polling (명령 대기)
│   └── POST /api/ext/result             # 결과 전송
│
├── Figma 통신
│   ├── GET  /api/health                 # 서버 상태 (Figma 폴링용)
│   └── POST /api/figma/import           # Figma로 데이터 전송
│
├── 데이터 관리
│   ├── GET  /api/extracted              # 저장된 데이터 목록
│   ├── GET  /api/extracted/:id          # 특정 데이터 조회
│   ├── POST /api/extracted              # 새 데이터 저장
│   └── DELETE /api/extracted/:id        # 데이터 삭제
│
└── Dashboard
    └── GET  /                           # Web UI
```

#### Command Queue 구현
```typescript
// server/src/command-queue.ts
interface Command {
  id: string;
  type: 'EXTRACT' | 'SET_FORMAT' | 'GET_STATUS';
  params?: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: number;
  resolvePromise?: (result: any) => void;
  rejectPromise?: (error: any) => void;
}

class CommandQueue {
  private commands = new Map<string, Command>();
  private waitingRequests: Array<(cmd: Command | null) => void> = [];

  // MCP에서 명령 추가
  async addCommand(type: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const command: Command = {
        id: crypto.randomUUID(),
        type: type as Command['type'],
        params,
        status: 'pending',
        createdAt: Date.now(),
        resolvePromise: resolve,
        rejectPromise: reject
      };

      this.commands.set(command.id, command);

      // 대기 중인 Long Polling 요청에 즉시 전달
      if (this.waitingRequests.length > 0) {
        const respond = this.waitingRequests.shift()!;
        command.status = 'processing';
        respond(command);
      }
    });
  }

  // Extension Long Polling
  async getNextCommand(timeoutMs: number = 30000): Promise<Command | null> {
    // 대기 중인 명령 있으면 즉시 반환
    const pending = [...this.commands.values()]
      .find(cmd => cmd.status === 'pending');

    if (pending) {
      pending.status = 'processing';
      return pending;
    }

    // 없으면 대기
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const idx = this.waitingRequests.indexOf(resolve);
        if (idx > -1) this.waitingRequests.splice(idx, 1);
        resolve(null);
      }, timeoutMs);

      this.waitingRequests.push((cmd) => {
        clearTimeout(timeout);
        resolve(cmd);
      });
    });
  }

  // Extension 결과 수신
  completeCommand(commandId: string, result: any, error?: string) {
    const command = this.commands.get(commandId);
    if (!command) return;

    command.status = error ? 'failed' : 'completed';
    command.result = result;
    command.error = error;

    if (error && command.rejectPromise) {
      command.rejectPromise(new Error(error));
    } else if (command.resolvePromise) {
      command.resolvePromise(result);
    }

    // 오래된 명령 정리 (5분 후)
    setTimeout(() => this.commands.delete(commandId), 5 * 60 * 1000);
  }
}
```

#### MCP Tools

```typescript
const mcpTools = [
  // === Extension 제어 ===
  {
    name: "extract_component",
    description: "현재 페이지에서 컴포넌트 추출 (selector 미지정시 선택 모드)",
    parameters: {
      selector: { type: "string", optional: true },
      format: { type: "string", enum: ["html", "json"], default: "json" }
    }
  },
  {
    name: "set_extract_format",
    description: "추출 형식 설정",
    parameters: {
      format: { type: "string", enum: ["html", "json"] }
    }
  },
  {
    name: "get_extension_status",
    description: "Extension 연결 상태 확인",
    parameters: {}
  },

  // === 데이터 관리 ===
  {
    name: "save_extracted",
    description: "추출 데이터를 파일로 저장",
    parameters: {
      name: { type: "string" },
      data: { type: "object" }
    }
  },
  {
    name: "load_extracted",
    description: "저장된 데이터 로드",
    parameters: {
      name: { type: "string" }
    }
  },
  {
    name: "list_saved",
    description: "저장된 파일 목록",
    parameters: {}
  },

  // === Figma 제어 ===
  {
    name: "figma_status",
    description: "Figma Plugin 연결 상태 확인",
    parameters: {}
  },
  {
    name: "figma_create_frame",
    description: "Figma에 프레임 생성",
    parameters: {
      data: { type: "object", description: "ExtractedNode JSON" },
      name: { type: "string", optional: true }
    }
  },
  {
    name: "figma_import_file",
    description: "저장된 파일을 Figma로 가져오기",
    parameters: {
      filename: { type: "string" }
    }
  },

  // === 복합 작업 ===
  {
    name: "extract_and_save",
    description: "추출 후 저장",
    parameters: {
      selector: { type: "string", optional: true },
      name: { type: "string" }
    }
  },
  {
    name: "extract_and_import",
    description: "추출 → Figma 가져오기 (원스텝)",
    parameters: {
      selector: { type: "string", optional: true },
      name: { type: "string", optional: true }
    }
  }
];
```

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
    // 연결 시 Figma Plugin 등록
    ws.send(JSON.stringify({ type: 'REGISTER', client: 'figma-plugin' }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    updateStatus('연결 끊김', 'disconnected');
    ws = null;
    startServerDetection(); // 폴링으로 복귀
  };
}

function handleServerMessage(msg: any) {
  switch (msg.type) {
    case 'CREATE_FRAME':
      // Plugin main code로 전달
      parent.postMessage({
        pluginMessage: {
          type: 'create-from-json',
          data: msg.data,
          name: msg.name
        }
      }, '*');

      // 결과 응답
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

// Plugin UI 로드 시 서버 감지 시작
startServerDetection();
```

---

### 4. Playwright 연동

**목적:** 브라우저 자동화 (별도 MCP)

Playwright MCP를 Sigma MCP와 함께 사용하여 완전 자동화 가능.

```
AI Agent
    │
    ├── Playwright MCP ──→ navigate(), click(), screenshot()
    │
    └── Sigma MCP ──→ extract_component(), figma_create_frame()
```

---

## 사용 시나리오

### 시나리오 1: 수동 사용 (서버 없이)

```
1. Chrome Extension 아이콘 클릭
2. "선택 모드" 버튼 클릭
3. 웹페이지에서 원하는 컴포넌트 클릭
4. 추출된 JSON 복사
5. Figma Plugin 열기
6. JSON 붙여넣기
7. "가져오기" 버튼 클릭
```

### 시나리오 2: Dashboard 사용 (반자동)

```
1. sigma 서버 실행: sigma start
2. Extension이 자동으로 서버 감지
3. Extension으로 컴포넌트 추출 → 서버에 자동 저장
4. http://localhost:9801 대시보드 열기
5. 저장된 컴포넌트 목록에서 "Figma로 보내기" 클릭
6. Figma Plugin이 자동으로 프레임 생성
```

### 시나리오 3: AI Agent 완전 자동화

```
User: "Storybook에서 Badge 컴포넌트를 Figma에 가져와줘"

AI Agent:
1. [Playwright] navigate("http://localhost:6006/?path=/story/badge")
2. [Playwright] waitForSelector(".badge")
3. [Sigma] extract_component({ selector: ".badge" })
   → { tagName: "span", styles: {...}, ... }
4. [Sigma] figma_create_frame({ name: "Badge", data: ... })
   → "Created frame 'Badge' in Figma"

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
   - [Sigma] extract_component()
   - [Sigma] save_extracted({ name: `button-${variant}` })
   - [Sigma] figma_create_frame({ name: `Button/${variant}` })
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
│   │   │   ├── background.ts     # Service Worker + Long Polling
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
│   │   │   │   ├── routes/
│   │   │   │   │   ├── extension.ts  # Extension Long Polling
│   │   │   │   │   ├── figma.ts
│   │   │   │   │   └── extracted.ts
│   │   │   │   └── middleware/
│   │   │   ├── websocket/        # WebSocket Server
│   │   │   │   └── server.ts
│   │   │   ├── queue/            # Command Queue
│   │   │   │   └── command-queue.ts
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
├── CLAUDE.md                     # 이 파일
├── package.json                  # 모노레포 설정
└── pnpm-workspace.yaml
```

---

## 기술 스택

| 모듈 | 기술 |
|------|------|
| Chrome Extension | TypeScript, Chrome Extension Manifest V3 |
| Local Server | Node.js, TypeScript, Fastify, ws, @anthropic-ai/sdk |
| Figma Plugin | TypeScript, Figma Plugin API |
| Shared | TypeScript |
| Build | esbuild, pnpm workspace |
| Dashboard | Vanilla JS 또는 Preact (경량) |

---

## 포트 및 프로토콜

| 서비스 | 포트 | 프로토콜 | 용도 |
|--------|------|----------|------|
| HTTP Server | 9801 | HTTP | REST API, Dashboard |
| WebSocket Server | 9800 | WebSocket | Figma Plugin 실시간 통신 |
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
  "extension": {
    "pollingTimeout": 30000
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
  "autoConnect": true
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
pnpm install

# 전체 개발 모드
pnpm dev

# 개별 패키지
pnpm --filter @sigma/extension dev      # Extension (watch)
pnpm --filter @sigma/server dev         # Server (watch)
pnpm --filter @sigma/figma-plugin dev   # Figma Plugin (watch)

# 빌드
pnpm build

# 서버 실행 (production)
pnpm --filter @sigma/server start

# Extension 로드
# chrome://extensions → 개발자 모드 → packages/chrome-extension/dist 로드

# Figma Plugin 로드
# Figma → Plugins → Development → Import plugin from manifest
# → packages/figma-plugin/manifest.json 선택
```

---

## 개발 단계

### Phase 1: 기반 구축 (3-4일)
- [ ] Extension HTML/JSON 형식 선택 기능
- [ ] Extension Long Polling 통신 준비
- [ ] Figma Plugin WebSocket 연결 준비
- [ ] 독립 사용 가능하게 완성

### Phase 2: Server 구현 (4-5일)
- [ ] HTTP Server + Long Polling 엔드포인트
- [ ] WebSocket Server
- [ ] Command Queue
- [ ] File Storage
- [ ] 간단한 Dashboard

### Phase 3: MCP 구현 (2-3일)
- [ ] MCP Server 기본 구조
- [ ] Extension 제어 Tools
- [ ] Figma 제어 Tools
- [ ] 복합 작업 Tools

### Phase 4: 통합 및 문서화 (2일)
- [ ] 전체 플로우 테스트
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
   app.register(cors, {
     origin: [
       /^chrome-extension:\/\//,
       'http://localhost:9801'
     ]
   });
   ```

3. **Extension host_permissions**
   ```json
   "host_permissions": ["http://localhost:9801/*"]
   ```

---

## 향후 확장 가능성

- [ ] 디자인 토큰 추출 (CSS 변수 → Figma Variables)
- [ ] 반대 방향 동기화 (Figma → Code)
- [ ] 컴포넌트 버전 관리 및 diff
- [ ] 팀 협업 (클라우드 서버 옵션)
- [ ] VS Code Extension 연동
- [ ] 다른 디자인 도구 지원 (Sketch, Adobe XD)
